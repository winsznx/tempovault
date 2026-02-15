// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GovernanceRoles.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title RiskController
/// @notice Enforces risk boundaries for all vault operations
contract RiskController {

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    GovernanceRoles public immutable governance;

    /// @notice Maximum percentage of vault balance deployable to a single pair (basis points, 10000 = 100%)
    uint16 public maxExposurePerPairBps;

    /// @notice Maximum tick deviation from center peg for order placement
    int16 public maxTickDeviation;

    /// @notice Maximum inventory imbalance ratio (basis points). If bid-side / ask-side > this, halt MM.
    uint16 public maxImbalanceBps;

    /// @notice Absolute maximum single order size in token units (18 decimals)
    uint256 public maxOrderSize;

    /// @notice Minimum reserve ratio that must remain undeployed (basis points)
    uint16 public minReserveBps;

    /// @notice Global pause flag
    bool public paused;

    /// @notice Oracle staleness threshold in seconds
    uint32 public oracleStalenessThreshold;

    /// @notice Maximum allowable spread (bestAsk - bestBid) before order placement is blocked
    int16 public maxSpreadSanityTicks;

    /// @notice Minimum combined orderbook depth (bid + ask, 18 dec USD) required before placement
    uint256 public minDepthThreshold;

    /// @notice Per-pair circuit breaker state
    mapping(bytes32 => bool) public pairCircuitBroken;

    /// @notice Latest oracle signals per pair
    mapping(bytes32 => OracleSignal) public latestSignals;

    /// @notice Per-pair monotonic nonce for oracle replay protection
    mapping(bytes32 => uint256) public oracleNonces;

    /// @notice Per-pair last accepted oracle timestamp for monotonicity enforcement
    mapping(bytes32 => uint256) public oracleLastTimestamp;

    /// @notice EIP-712 domain separator computed at deployment (immutable chain assumption)
    bytes32 public immutable DOMAIN_SEPARATOR;

    // ---------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------

    struct OracleSignal {
        int16 referenceTick;  // Reference tick from oracle (±2000 range)
        uint256 pegDeviation;  // Basis points for backwards compatibility
        uint256 orderbookDepthBid;
        uint256 orderbookDepthAsk;
        uint256 timestamp;
        uint256 nonce;
    }

    struct RiskParams {
        uint16 maxExposurePerPairBps;
        int16 maxTickDeviation;
        uint16 maxImbalanceBps;
        uint256 maxOrderSize;
        uint16 minReserveBps;
        uint32 oracleStalenessThreshold;
        int16 maxSpreadSanityTicks;
        uint256 minDepthThreshold;
    }

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error ProtocolPaused();
    error PairCircuitBroken(bytes32 _pairId);
    error ExposureLimitExceeded(uint256 requested, uint256 maxAllowed);
    error TickDeviationExceeded(int24 requested, int24 maxAllowed);
    error ImbalanceThresholdBreached(uint256 currentImbalance, uint16 maxAllowed);
    error OrderSizeExceeded(uint256 size, uint256 maxAllowed);
    error InsufficientReserve(uint256 available, uint256 required);
    error StaleOracleData(uint256 lastUpdate, uint256 threshold);
    error InvalidParams();
    error OracleNonceReplay(bytes32 _pairId, uint256 submittedNonce, uint256 lastAcceptedNonce);
    error OracleTimestampNotMonotonic(bytes32 _pairId, uint256 submittedTs, uint256 lastTs);
    error OracleSignatureInvalid(address recoveredSigner, address expectedSigner);
    error SpreadSanityExceeded(int24 currentSpread, int24 maxAllowed);
    error DepthBelowThreshold(uint256 currentDepth, uint256 minRequired);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event RiskParamsUpdated(RiskParams params, address indexed updatedBy);
    event OracleSignalUpdated(bytes32 indexed _pairId, OracleSignal signal, uint256 nonce);
    event CircuitBreakerTriggered(bytes32 indexed _pairId, address indexed triggeredBy);
    event CircuitBreakerReset(bytes32 indexed _pairId, address indexed resetBy);
    event GlobalPauseToggled(bool paused, address indexed toggledBy);
    event OracleNonceAdvanced(bytes32 indexed _pairId, uint256 oldNonce, uint256 newNonce);

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyRole(bytes32 role) {
        governance.checkRole(role, msg.sender);
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ProtocolPaused();
        _;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(address _governance, RiskParams memory _params) {
        governance = GovernanceRoles(_governance);
        _setRiskParams(_params);
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("TempoVaultRiskController"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    // ---------------------------------------------------------------
    // Risk Parameter Management
    // ---------------------------------------------------------------

    function updateRiskParams(RiskParams calldata _params)
        external
        onlyRole(governance.RISK_OFFICER_ROLE())
    {
        _setRiskParams(_params);
        emit RiskParamsUpdated(_params, msg.sender);
    }

    function _setRiskParams(RiskParams memory _params) internal {
        if (_params.maxExposurePerPairBps == 0 || _params.maxExposurePerPairBps > 10000)
            revert InvalidParams();
        if (_params.maxTickDeviation <= 0 || _params.maxTickDeviation > 2000)
            revert InvalidParams();
        if (_params.maxImbalanceBps == 0 || _params.maxImbalanceBps > 10000)
            revert InvalidParams();
        if (_params.maxOrderSize == 0) revert InvalidParams();
        if (_params.minReserveBps > 10000) revert InvalidParams();
        if (_params.oracleStalenessThreshold == 0) revert InvalidParams();
        if (_params.maxSpreadSanityTicks <= 0 || _params.maxSpreadSanityTicks > 2000)
            revert InvalidParams();

        maxExposurePerPairBps = _params.maxExposurePerPairBps;
        maxTickDeviation = _params.maxTickDeviation;
        maxImbalanceBps = _params.maxImbalanceBps;
        maxOrderSize = _params.maxOrderSize;
        minReserveBps = _params.minReserveBps;
        oracleStalenessThreshold = _params.oracleStalenessThreshold;
        maxSpreadSanityTicks = _params.maxSpreadSanityTicks;
        minDepthThreshold = _params.minDepthThreshold;
    }

    // ---------------------------------------------------------------
    // Oracle Signal Updates
    // ---------------------------------------------------------------

    /// @notice Submit a signed oracle signal with nonce and timestamp monotonicity enforcement
    /// @param _pairId Target trading pair
    /// @param signal Oracle signal data (must include monotonically increasing nonce)
    /// @param signature ECDSA signature over EIP-712 typed hash of the signal by ORACLE_ROLE holder
    function updateOracleSignal(
        bytes32 _pairId,
        OracleSignal calldata signal,
        bytes calldata signature
    )
        external
        whenNotPaused
    {
        if (signal.timestamp > block.timestamp) revert InvalidParams();

        uint256 lastNonce = oracleNonces[_pairId];
        if (signal.nonce <= lastNonce) {
            revert OracleNonceReplay(_pairId, signal.nonce, lastNonce);
        }

        uint256 lastTs = oracleLastTimestamp[_pairId];
        if (signal.timestamp <= lastTs && lastTs != 0) {
            revert OracleTimestampNotMonotonic(_pairId, signal.timestamp, lastTs);
        }

        bytes32 structHash = keccak256(abi.encode(
            keccak256("OracleUpdate(bytes32 pairId,int16 referenceTick,uint256 pegDeviation,uint256 orderbookDepthBid,uint256 orderbookDepthAsk,uint256 timestamp,uint256 nonce)"),
            _pairId,
            signal.referenceTick,
            signal.pegDeviation,
            signal.orderbookDepthBid,
            signal.orderbookDepthAsk,
            signal.timestamp,
            signal.nonce
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = ECDSA.recover(digest, signature);
        if (!governance.hasRole(governance.ORACLE_ROLE(), recovered)) {
            revert OracleSignatureInvalid(recovered, address(0));
        }

        uint256 oldNonce = oracleNonces[_pairId];
        oracleNonces[_pairId] = signal.nonce;
        oracleLastTimestamp[_pairId] = signal.timestamp;
        latestSignals[_pairId] = signal;

        emit OracleNonceAdvanced(_pairId, oldNonce, signal.nonce);
        emit OracleSignalUpdated(_pairId, signal, signal.nonce);
    }

    // ---------------------------------------------------------------
    // Circuit Breakers
    // ---------------------------------------------------------------

    function triggerCircuitBreaker(bytes32 _pairId)
        external
        onlyRole(governance.RISK_OFFICER_ROLE())
    {
        pairCircuitBroken[_pairId] = true;
        emit CircuitBreakerTriggered(_pairId, msg.sender);
    }

    function resetCircuitBreaker(bytes32 _pairId)
        external
        onlyRole(governance.RISK_OFFICER_ROLE())
    {
        pairCircuitBroken[_pairId] = false;
        emit CircuitBreakerReset(_pairId, msg.sender);
    }

    function toggleGlobalPause(bool _paused)
        external
        onlyRole(governance.EMERGENCY_ROLE())
    {
        paused = _paused;
        emit GlobalPauseToggled(_paused, msg.sender);
    }

    // ---------------------------------------------------------------
    // Validation Functions
    // ---------------------------------------------------------------

    /// @notice Validate that a proposed order placement is within risk bounds
    /// @param _pairId The pair identifier
    /// @param tick Target tick for the order
    /// @param orderSize Size of the order
    /// @param vaultBalance Total vault balance for the token
    /// @param currentPairExposure Current total exposure for this pair
    /// @param currentSpread Current DEX spread (bestAsk - bestBid) for sanity check
    function validateOrderPlacement(
        bytes32 _pairId,
        int16 tick,
        uint256 orderSize,
        uint256 vaultBalance,
        uint256 currentPairExposure,
        int16 currentSpread
    ) external view whenNotPaused {
        if (pairCircuitBroken[_pairId]) revert PairCircuitBroken(_pairId);

        if (currentSpread > maxSpreadSanityTicks) {
            revert SpreadSanityExceeded(currentSpread, maxSpreadSanityTicks);
        }

        OracleSignal storage sig = latestSignals[_pairId];
        if (sig.timestamp != 0) {
            uint256 totalDepth = sig.orderbookDepthBid + sig.orderbookDepthAsk;
            if (totalDepth < minDepthThreshold) {
                revert DepthBelowThreshold(totalDepth, minDepthThreshold);
            }
        }

        if (sig.timestamp != 0 && block.timestamp - sig.timestamp > oracleStalenessThreshold) {
            revert StaleOracleData(sig.timestamp, oracleStalenessThreshold);
        }

        if (tick > maxTickDeviation || tick < -maxTickDeviation) {
            revert TickDeviationExceeded(tick, maxTickDeviation);
        }

        if (orderSize > maxOrderSize) {
            revert OrderSizeExceeded(orderSize, maxOrderSize);
        }

        uint256 maxExposure = (vaultBalance * maxExposurePerPairBps) / 10000;
        if (currentPairExposure + orderSize > maxExposure) {
            revert ExposureLimitExceeded(currentPairExposure + orderSize, maxExposure);
        }

        uint256 minReserve = (vaultBalance * minReserveBps) / 10000;
        uint256 availableAfter = vaultBalance - currentPairExposure - orderSize;
        if (availableAfter < minReserve) {
            revert InsufficientReserve(availableAfter, minReserve);
        }
    }

    /// @notice Check if inventory imbalance warrants halting market making
    function isImbalanced(uint256 bidExposure, uint256 askExposure)
        external view returns (bool)
    {
        if (bidExposure == 0 && askExposure == 0) return false;
        uint256 larger = bidExposure > askExposure ? bidExposure : askExposure;
        uint256 smaller = bidExposure > askExposure ? askExposure : bidExposure;
        if (smaller == 0) return true;
        uint256 ratioBps = (larger * 10000) / smaller;
        return ratioBps > (10000 + maxImbalanceBps);
    }

    // ---------------------------------------------------------------
    // View Helpers
    // ---------------------------------------------------------------

    /// @notice Compute pair identifier
    function pairId(address tokenA, address tokenB) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            tokenA < tokenB ? tokenA : tokenB,
            tokenA < tokenB ? tokenB : tokenA
        ));
    }

    /// @notice Compute recommended tick width based on current oracle signal
    function recommendedTickWidth(bytes32 __pairId, uint256 baseWidth)
        external view returns (uint256 recommendedWidth)
    {
        OracleSignal storage sig = latestSignals[__pairId];

        // Use basis points deviation for calculation
        uint256 absDeviation = sig.pegDeviation;
        uint256 deviationAdjustment = (absDeviation * 50) / 100;
        recommendedWidth = baseWidth + deviationAdjustment;

        if (recommendedWidth > uint256(uint16(maxTickDeviation))) {
            recommendedWidth = uint256(uint16(maxTickDeviation));
        }
    }

    /// @notice Get reference tick from latest oracle signal
    /// @param _pairId Pair identifier
    /// @return referenceTick Reference tick (int16)
    function getReferenceTick(bytes32 _pairId)
        external view returns (int16 referenceTick)
    {
        return latestSignals[_pairId].referenceTick;
    }
}

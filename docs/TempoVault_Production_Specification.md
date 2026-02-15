# TempoVault: Production System Specification

## Institutional Stablecoin Treasury Infrastructure on Tempo

**Version:** 1.0.0
**Status:** Implementation-Ready
**Target Network:** Tempo Chain (Testnet for hackathon; Mainnet post-audit)
**Compiler:** Solidity ^0.8.24

---

# 1. SYSTEM OVERVIEW

## 1.1 System Definition

TempoVault is a programmable onchain treasury layer built natively on Tempo's tick-based limit orderbook DEX. It enables institutional stablecoin holders to deploy idle capital via automated flip-order market making, tick-based liquidity strategies, and fixed-term lending vaults with built-in risk controls and compliance reporting.

## 1.2 Scope Boundaries

**What this system IS:**

- A segregated stablecoin treasury management protocol
- A DEX-native yield engine using Tempo's flip orders and tick-based pricing
- A programmable risk controller for institutional capital deployment
- A reporting layer for regulatory and audit compliance
- A role-based governance framework for treasury operations

**What this system is NOT:**

- Not a custodial wallet provider
- Not an MPC key management system
- Not a stablecoin issuer (it integrates with TIP-20 issuers)
- Not a cross-chain bridge
- Not a retail-facing DeFi protocol
- Not a fiat on/off ramp (integrates with external ramp providers)

## 1.3 Core Invariants

1. **Segregation Invariant:** No vault's capital may be commingled with another vault's capital at any point in the execution path.
2. **Solvency Invariant:** For every vault, `totalDeposited - totalWithdrawn >= activeDeployedCapital + reserveBalance`.
3. **Exposure Invariant:** No single stablecoin pair position may exceed the configured `maxExposurePercent` of the vault's total balance.
4. **Tick Boundary Invariant:** All limit orders placed by the protocol must fall within the range `[-MAX_TICK_DEVIATION, +MAX_TICK_DEVIATION]` relative to the peg center tick.
5. **Withdrawal Invariant:** Any withdrawal request that would violate the solvency invariant must revert.
6. **Role Invariant:** No address may execute a privileged function without holding the required role at the time of execution.

## 1.4 Threat Model Assumptions

- Tempo DEX is assumed to function correctly per its specification. TempoVault does not defend against DEX-level bugs.
- Passkey signatures and 2D nonces are assumed to provide replay protection at the chain level.
- Oracle data may be stale by up to `ORACLE_STALENESS_THRESHOLD` seconds. All oracle-dependent decisions must check freshness.
- MEV actors exist. Sandwich attacks on large order placements are a known risk. Mitigation is via tick spreading and order size limits.
- The system assumes adversarial users who may attempt to drain vaults, manipulate risk parameters, or exploit governance delays.
- Flash loan attacks are considered. All state changes that depend on balances use pre-transaction snapshots.

---

# 2. ARCHITECTURE DIAGRAM

```
+------------------------------------------------------------------+
|                        OFFCHAIN LAYER                            |
|                                                                  |
|  +------------------+    +-------------------+    +------------+ |
|  | Risk Signal      |    | Reporting         |    | Dashboard  | |
|  | Engine           |    | Service           |    | API        | |
|  | (Python)         |    | (Node.js)         |    | (React)    | |
|  +--------+---------+    +--------+----------+    +-----+------+ |
|           |                       |                      |       |
|           v                       v                      v       |
|  +------------------+    +-------------------+                   |
|  | Oracle Relay     |    | Event Indexer     |                   |
|  | (Signed Tx)      |    | (Subgraph/Custom) |                   |
|  +--------+---------+    +-------------------+                   |
+-----------|------------------------------------------------------+
            |
============|=== ONCHAIN BOUNDARY (Tempo Chain) ====================
            v
+------------------------------------------------------------------+
|                        ONCHAIN LAYER                             |
|                                                                  |
|  +------------------+    +-------------------+                   |
|  | GovernanceRoles  |    | RiskController    |                   |
|  | (AccessControl)  |    | (Thresholds,      |                   |
|  |                  |    |  Circuit Breakers) |                   |
|  +--------+---------+    +--------+----------+                   |
|           |                       |                              |
|           v                       v                              |
|  +--------------------------------------------------+           |
|  |              TreasuryVault                        |           |
|  |  - Segregated balances                            |           |
|  |  - Deposit / Withdraw                             |           |
|  |  - Strategy allocation                            |           |
|  +--------+---------+--------+-----------------------+           |
|           |                  |                                   |
|           v                  v                                   |
|  +------------------+  +-------------------+                     |
|  | DexStrategy      |  | LendingModule     |                     |
|  | - Tick placement  |  | - Fixed-term pools |                    |
|  | - Flip orders     |  | - Interest accrual|                    |
|  | - Spread control  |  | - Liquidation     |                    |
|  +--------+---------+  +-------------------+                     |
|           |                                                      |
|           v                                                      |
|  +------------------+    +-------------------+                   |
|  | Tempo DEX        |    | TIP-20 Tokens     |                   |
|  | (ITempoOrderbook)|    | (IERC20 + TIP20)  |                   |
|  +------------------+    +-------------------+                   |
|                                                                  |
|  +------------------+                                            |
|  | ReportingAdapter |                                            |
|  | (Event Logs)     |                                            |
|  +------------------+                                            |
+------------------------------------------------------------------+
```

### Interaction Flows

1. **Deposit Flow:** User -> GovernanceRoles (auth check) -> TreasuryVault.deposit() -> Token transfer -> Balance update -> ReportingAdapter.emit()
2. **Strategy Deployment:** TreasuryManager role -> TreasuryVault.deployToStrategy() -> DexStrategy.placeLiquidity() -> Tempo DEX
3. **Risk Adjustment:** Oracle Relay -> RiskController.updateSignals() -> DexStrategy.adjustPositions() -> Tempo DEX (modify/cancel orders)
4. **Withdrawal Flow:** User -> GovernanceRoles (auth check) -> TreasuryVault.withdraw() -> DexStrategy.unwind() (if needed) -> Token transfer
5. **Lending Flow:** Depositor -> LendingModule.lend() -> Lock tokens -> Issue position NFT -> Interest accrual on claim

---

# 3. ONCHAIN CONTRACT DESIGN

## 3.1 Interface Definitions

### ITempoOrderbook.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITempoOrderbook {
    /// @notice Place a limit order at a specific tick
    /// @param tokenIn Address of the token being sold
    /// @param tokenOut Address of the token being bought
    /// @param tick Tick position (-2000 to +2000, representing +/-2% from peg)
    /// @param amount Amount of tokenIn to sell (must be >= $100 USD equivalent)
    /// @param isFlip If true, order auto-reverses when filled
    /// @return orderId Unique identifier for the placed order
    function placeOrder(
        address tokenIn,
        address tokenOut,
        int24 tick,
        uint256 amount,
        bool isFlip
    ) external returns (uint256 orderId);

    /// @notice Cancel an existing order
    /// @param orderId The order to cancel
    /// @return refundedAmount Amount returned to caller
    function cancelOrder(uint256 orderId) external returns (uint256 refundedAmount);

    /// @notice Modify an existing order's parameters
    /// @param orderId The order to modify
    /// @param newTick New tick position
    /// @param newAmount New amount
    function modifyOrder(
        uint256 orderId,
        int24 newTick,
        uint256 newAmount
    ) external;

    /// @notice Execute a swap against the orderbook
    /// @param tokenIn Token to sell
    /// @param tokenOut Token to buy
    /// @param amountIn Amount to sell
    /// @param minAmountOut Minimum acceptable output
    /// @return amountOut Actual output amount
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);

    /// @notice Get the best bid tick for a pair
    function bestBid(address tokenA, address tokenB) external view returns (int24);

    /// @notice Get the best ask tick for a pair
    function bestAsk(address tokenA, address tokenB) external view returns (int24);

    /// @notice Get total liquidity at a specific tick
    function liquidityAtTick(address tokenA, address tokenB, int24 tick)
        external view returns (uint256);

    /// @notice Get order details
    function getOrder(uint256 orderId)
        external view returns (
            address owner,
            address tokenIn,
            address tokenOut,
            int24 tick,
            uint256 remainingAmount,
            bool isFlip,
            bool isActive
        );
}
```

### ITIP20.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITIP20 is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function pause() external;
    function unpause() external;
    function hasRole(bytes32 role, address account) external view returns (bool);
}
```

---

## 3.2 GovernanceRoles.sol

**Responsibility:** Centralized role registry and access control for the entire protocol. All permissioned contracts delegate authorization checks here.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

/// @title GovernanceRoles
/// @notice Protocol-wide role registry for TempoVault
/// @dev All permissioned contracts reference this contract for auth checks
contract GovernanceRoles is AccessControlEnumerable {

    // ---------------------------------------------------------------
    // Role Definitions
    // ---------------------------------------------------------------

    /// @notice Can add/remove other roles, upgrade protocol parameters
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    /// @notice Can deposit, withdraw, allocate capital to strategies
    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER");

    /// @notice Can update risk parameters, trigger circuit breakers
    bytes32 public constant RISK_OFFICER_ROLE = keccak256("RISK_OFFICER");

    /// @notice Can invoke emergency pause across all modules
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY");

    /// @notice Can submit oracle data updates
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE");

    /// @notice Can configure and execute DEX strategies
    bytes32 public constant STRATEGIST_ROLE = keccak256("STRATEGIST");

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error Unauthorized(address caller, bytes32 requiredRole);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event RoleGrantedByAdmin(bytes32 indexed role, address indexed account, address indexed admin);
    event RoleRevokedByAdmin(bytes32 indexed role, address indexed account, address indexed admin);

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    /// @param initialAdmin Address that receives DEFAULT_ADMIN_ROLE
    constructor(address initialAdmin) {
        if (initialAdmin == address(0)) revert Unauthorized(address(0), ADMIN_ROLE);
        _grantRole(ADMIN_ROLE, initialAdmin);
        _grantRole(EMERGENCY_ROLE, initialAdmin);
    }

    // ---------------------------------------------------------------
    // External Authorization Check
    // ---------------------------------------------------------------

    /// @notice Revert if caller lacks the required role
    /// @param role The role to check
    /// @param account The address to verify
    function checkRole(bytes32 role, address account) external view {
        if (!hasRole(role, account)) {
            revert Unauthorized(account, role);
        }
    }

    // ---------------------------------------------------------------
    // Role Admin Configuration
    // ---------------------------------------------------------------

    /// @notice Set which role can administer another role
    /// @dev Only callable by DEFAULT_ADMIN_ROLE
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }
}
```

### Permission Matrix

| Function | ADMIN | TREASURY_MANAGER | RISK_OFFICER | EMERGENCY | ORACLE | STRATEGIST |
|---|---|---|---|---|---|---|
| Grant/revoke roles | X | | | | | |
| Deposit to vault | | X | | | | |
| Withdraw from vault | | X | | | | |
| Deploy capital to strategy | | X | | | | |
| Adjust risk thresholds | | | X | | | |
| Trigger circuit breaker | | | X | X | | |
| Emergency pause all | | | | X | | |
| Submit oracle update | | | | | X | |
| Configure DEX strategy | | | | | | X |
| Place/cancel orders | | | | | | X |
| Update protocol params | X | | | | | |

---

## 3.3 RiskController.sol

**Responsibility:** Enforce exposure limits, manage circuit breakers, validate risk parameters before strategy execution. Accepts oracle signals and translates them into actionable constraints.

```solidity
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
    int24 public maxTickDeviation;

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
    int24 public maxSpreadSanityTicks;

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
        int24 pegDeviation;         // Current peg deviation in ticks
        uint256 orderbookDepthBid;  // Total bid-side liquidity in USD terms (18 dec)
        uint256 orderbookDepthAsk;  // Total ask-side liquidity in USD terms (18 dec)
        uint256 timestamp;          // Block timestamp of measurement
        uint256 nonce;              // Monotonically increasing per-pair nonce
    }

    struct RiskParams {
        uint16 maxExposurePerPairBps;
        int24 maxTickDeviation;
        uint16 maxImbalanceBps;
        uint256 maxOrderSize;
        uint16 minReserveBps;
        uint32 oracleStalenessThreshold;
        int24 maxSpreadSanityTicks;
        uint256 minDepthThreshold;
    }

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error ProtocolPaused();
    error PairCircuitBroken(bytes32 pairId);
    error ExposureLimitExceeded(uint256 requested, uint256 maxAllowed);
    error TickDeviationExceeded(int24 requested, int24 maxAllowed);
    error ImbalanceThresholdBreached(uint256 currentImbalance, uint16 maxAllowed);
    error OrderSizeExceeded(uint256 size, uint256 maxAllowed);
    error InsufficientReserve(uint256 available, uint256 required);
    error StaleOracleData(uint256 lastUpdate, uint256 threshold);
    error InvalidParams();
    error OracleNonceReplay(bytes32 pairId, uint256 submittedNonce, uint256 lastAcceptedNonce);
    error OracleTimestampNotMonotonic(bytes32 pairId, uint256 submittedTs, uint256 lastTs);
    error OracleSignatureInvalid(address recoveredSigner);
    error SpreadSanityExceeded(int24 currentSpread, int24 maxAllowed);
    error DepthBelowThreshold(uint256 currentDepth, uint256 minRequired);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event RiskParamsUpdated(RiskParams params, address indexed updatedBy);
    event OracleSignalUpdated(bytes32 indexed pairId, OracleSignal signal, uint256 nonce);
    event CircuitBreakerTriggered(bytes32 indexed pairId, address indexed triggeredBy);
    event CircuitBreakerReset(bytes32 indexed pairId, address indexed resetBy);
    event GlobalPauseToggled(bool paused, address indexed toggledBy);
    event OracleNonceAdvanced(bytes32 indexed pairId, uint256 oldNonce, uint256 newNonce);

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

    function updateOracleSignal(
        bytes32 pairId,
        OracleSignal calldata signal,
        bytes calldata signature
    )
        external
        whenNotPaused
    {
        if (signal.timestamp > block.timestamp) revert InvalidParams();

        // Enforce nonce monotonicity (replay protection)
        uint256 lastNonce = oracleNonces[pairId];
        if (signal.nonce <= lastNonce) {
            revert OracleNonceReplay(pairId, signal.nonce, lastNonce);
        }

        // Enforce timestamp monotonicity
        uint256 lastTs = oracleLastTimestamp[pairId];
        if (signal.timestamp <= lastTs && lastTs != 0) {
            revert OracleTimestampNotMonotonic(pairId, signal.timestamp, lastTs);
        }

        // Verify ECDSA signature from an ORACLE_ROLE holder
        bytes32 structHash = keccak256(abi.encode(
            keccak256("OracleUpdate(bytes32 pairId,int24 pegDeviation,uint256 orderbookDepthBid,uint256 orderbookDepthAsk,uint256 timestamp,uint256 nonce)"),
            pairId,
            signal.pegDeviation,
            signal.orderbookDepthBid,
            signal.orderbookDepthAsk,
            signal.timestamp,
            signal.nonce
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address recovered = ECDSA.recover(digest, signature);
        if (!governance.hasRole(governance.ORACLE_ROLE(), recovered)) {
            revert OracleSignatureInvalid(recovered);
        }

        // Update state
        uint256 oldNonce = oracleNonces[pairId];
        oracleNonces[pairId] = signal.nonce;
        oracleLastTimestamp[pairId] = signal.timestamp;
        latestSignals[pairId] = signal;

        emit OracleNonceAdvanced(pairId, oldNonce, signal.nonce);
        emit OracleSignalUpdated(pairId, signal, signal.nonce);
    }

    // ---------------------------------------------------------------
    // Circuit Breakers
    // ---------------------------------------------------------------

    function triggerCircuitBreaker(bytes32 pairId)
        external
        onlyRole(governance.RISK_OFFICER_ROLE())
    {
        pairCircuitBroken[pairId] = true;
        emit CircuitBreakerTriggered(pairId, msg.sender);
    }

    function resetCircuitBreaker(bytes32 pairId)
        external
        onlyRole(governance.RISK_OFFICER_ROLE())
    {
        pairCircuitBroken[pairId] = false;
        emit CircuitBreakerReset(pairId, msg.sender);
    }

    function toggleGlobalPause(bool _paused)
        external
        onlyRole(governance.EMERGENCY_ROLE())
    {
        paused = _paused;
        emit GlobalPauseToggled(_paused, msg.sender);
    }

    // ---------------------------------------------------------------
    // Validation Functions (called by other contracts)
    // ---------------------------------------------------------------

    /// @notice Validate that a proposed order placement is within risk bounds
    function validateOrderPlacement(
        bytes32 pairId,
        int24 tick,
        uint256 orderSize,
        uint256 vaultBalance,
        uint256 currentPairExposure,
        int24 currentSpread
    ) external view whenNotPaused {
        if (pairCircuitBroken[pairId]) revert PairCircuitBroken(pairId);

        // Spread sanity -- block placement into manipulated orderbook
        if (currentSpread > maxSpreadSanityTicks) {
            revert SpreadSanityExceeded(currentSpread, maxSpreadSanityTicks);
        }

        // Depth sanity -- block placement into shallow orderbook
        OracleSignal storage sig = latestSignals[pairId];
        if (sig.timestamp != 0) {
            uint256 totalDepth = sig.orderbookDepthBid + sig.orderbookDepthAsk;
            if (totalDepth < minDepthThreshold) {
                revert DepthBelowThreshold(totalDepth, minDepthThreshold);
            }
        }

        // Check oracle freshness
        if (sig.timestamp != 0 && block.timestamp - sig.timestamp > oracleStalenessThreshold) {
            revert StaleOracleData(sig.timestamp, oracleStalenessThreshold);
        }

        // Check tick deviation
        if (tick > maxTickDeviation || tick < -maxTickDeviation) {
            revert TickDeviationExceeded(tick, maxTickDeviation);
        }

        // Check order size
        if (orderSize > maxOrderSize) {
            revert OrderSizeExceeded(orderSize, maxOrderSize);
        }

        // Check pair exposure
        uint256 maxExposure = (vaultBalance * maxExposurePerPairBps) / 10000;
        if (currentPairExposure + orderSize > maxExposure) {
            revert ExposureLimitExceeded(currentPairExposure + orderSize, maxExposure);
        }

        // Check reserve ratio
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
    /// @dev Formula: baseWidth + (abs(pegDeviation) * DEVIATION_MULTIPLIER / 100)
    /// @return recommendedWidth Tick distance from center for bid/ask placement
    function recommendedTickWidth(bytes32 _pairId, int24 baseWidth)
        external view returns (int24 recommendedWidth)
    {
        OracleSignal storage sig = latestSignals[_pairId];
        int24 absDeviation = sig.pegDeviation >= 0 ? sig.pegDeviation : -sig.pegDeviation;

        // Widen spread by 50% of peg deviation
        int24 deviationAdjustment = (absDeviation * 50) / 100;
        recommendedWidth = baseWidth + deviationAdjustment;

        if (recommendedWidth > maxTickDeviation) {
            recommendedWidth = maxTickDeviation;
        }
    }
}
```

### State Transitions for RiskController

| State | Trigger | New State | Conditions |
|---|---|---|---|
| Active | `triggerCircuitBreaker()` | Pair Halted | RISK_OFFICER or EMERGENCY role |
| Pair Halted | `resetCircuitBreaker()` | Active | RISK_OFFICER role |
| Active | `toggleGlobalPause(true)` | Global Pause | EMERGENCY role |
| Global Pause | `toggleGlobalPause(false)` | Active | EMERGENCY role |

---

## 3.4 TreasuryVault.sol

**Responsibility:** Core vault holding segregated stablecoin balances. Manages deposits, withdrawals, and capital allocation to strategies. Each vault instance is isolated.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRoles.sol";
import "./RiskController.sol";
import "./interfaces/ITempoOrderbook.sol";

/// @title TreasuryVault
/// @notice Segregated institutional stablecoin treasury
contract TreasuryVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    GovernanceRoles public immutable governance;
    RiskController public immutable riskController;

    /// @notice Unique vault identifier
    uint256 public immutable vaultId;

    /// @notice Vault owner (institutional entity)
    address public owner;

    /// @notice Accepted stablecoins and their balances
    mapping(address => uint256) public tokenBalances;

    /// @notice Capital currently deployed to strategies per token
    mapping(address => uint256) public deployedCapital;

    /// @notice Total capital deployed per pair (for exposure tracking)
    mapping(bytes32 => uint256) public pairExposure;

    /// @notice Whitelisted strategy contracts
    mapping(address => bool) public approvedStrategies;

    /// @notice Whitelisted tokens
    mapping(address => bool) public approvedTokens;

    /// @notice Total number of active strategy deployments
    uint256 public activeDeployments;

    /// @notice Vault creation timestamp
    uint256 public immutable createdAt;

    /// @notice Protocol fee treasury address
    address public feeTreasury;

    /// @notice Performance fee in basis points (applied to spread yield)
    uint16 public performanceFeeBps;

    /// @notice Management fee in basis points (annualized, applied to AUM)
    uint16 public managementFeeBps;

    /// @notice Accrued but unclaimed performance fees per token
    mapping(address => uint256) public accruedPerformanceFees;

    /// @notice Accrued but unclaimed management fees per token
    mapping(address => uint256) public accruedManagementFees;

    /// @notice Last management fee accrual timestamp per token
    mapping(address => uint256) public lastFeeAccrualTimestamp;

    /// @notice Cumulative realized losses per token
    mapping(address => uint256) public realizedLosses;

    // ---------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------

    struct Deployment {
        address strategy;
        address token;
        uint256 amount;
        bytes32 pairId;
        uint256 timestamp;
        bool active;
    }

    /// @notice All deployments indexed by ID
    mapping(uint256 => Deployment) public deployments;
    uint256 public nextDeploymentId;

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error TokenNotApproved(address token);
    error StrategyNotApproved(address strategy);
    error InsufficientBalance(uint256 available, uint256 requested);
    error DeploymentNotActive(uint256 deploymentId);
    error ZeroAmount();
    error NotVaultOwner();
    error BalanceConsistencyViolation(address token, uint256 expected, uint256 actual);
    error FeeTreasuryNotSet();

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event Deposited(
        uint256 indexed vaultId,
        address indexed token,
        uint256 amount,
        address indexed depositor,
        uint256 newBalance
    );

    event Withdrawn(
        uint256 indexed vaultId,
        address indexed token,
        uint256 amount,
        address indexed recipient,
        uint256 newBalance
    );

    event CapitalDeployed(
        uint256 indexed vaultId,
        uint256 indexed deploymentId,
        address indexed strategy,
        address token,
        uint256 amount,
        bytes32 pairId
    );

    event CapitalRecalled(
        uint256 indexed vaultId,
        uint256 indexed deploymentId,
        uint256 returnedAmount
    );

    event StrategyApproved(address indexed strategy, bool approved);
    event TokenApproved(address indexed token, bool approved);

    event LossRealized(
        uint256 indexed vaultId,
        uint256 indexed deploymentId,
        address indexed token,
        uint256 deployedAmount,
        uint256 returnedAmount,
        uint256 loss
    );

    event PerformanceFeeAccrued(
        uint256 indexed vaultId,
        address indexed token,
        uint256 yieldAmount,
        uint256 feeAmount
    );

    event ManagementFeeAccrued(
        uint256 indexed vaultId,
        address indexed token,
        uint256 feeAmount,
        uint256 periodSeconds
    );

    event FeesDistributed(
        uint256 indexed vaultId,
        address indexed token,
        uint256 performanceFee,
        uint256 managementFee,
        address indexed recipient
    );

    event EmergencyReturnReceived(
        uint256 indexed vaultId,
        address indexed token,
        uint256 amount,
        bytes32 indexed pairId
    );

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyRole(bytes32 role) {
        governance.checkRole(role, msg.sender);
        _;
    }

    modifier onlyOwnerOrManager() {
        if (msg.sender != owner) {
            governance.checkRole(governance.TREASURY_MANAGER_ROLE(), msg.sender);
        }
        _;
    }

    modifier whenNotPaused() {
        if (riskController.paused()) revert RiskController.ProtocolPaused();
        _;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(
        uint256 _vaultId,
        address _owner,
        address _governance,
        address _riskController
    ) {
        vaultId = _vaultId;
        owner = _owner;
        governance = GovernanceRoles(_governance);
        riskController = RiskController(_riskController);
        createdAt = block.timestamp;
    }

    // ---------------------------------------------------------------
    // Token and Strategy Management
    // ---------------------------------------------------------------

    function setApprovedToken(address token, bool approved)
        external onlyRole(governance.ADMIN_ROLE())
    {
        approvedTokens[token] = approved;
        emit TokenApproved(token, approved);
    }

    function setApprovedStrategy(address strategy, bool approved)
        external onlyRole(governance.ADMIN_ROLE())
    {
        approvedStrategies[strategy] = approved;
        emit StrategyApproved(strategy, approved);
    }

    // ---------------------------------------------------------------
    // Deposit
    // ---------------------------------------------------------------

    /// @notice Deposit stablecoins into the vault
    /// @param token The stablecoin address
    /// @param amount Amount to deposit (18 decimals)
    function deposit(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyOwnerOrManager
    {
        if (amount == 0) revert ZeroAmount();
        if (!approvedTokens[token]) revert TokenNotApproved(token);

        // Accrue management fee before balance change to prevent dilution
        accrueManagementFee(token);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;

        emit Deposited(vaultId, token, amount, msg.sender, tokenBalances[token]);
    }

    // ---------------------------------------------------------------
    // Withdraw
    // ---------------------------------------------------------------

    /// @notice Withdraw stablecoins from the vault
    /// @param token The stablecoin address
    /// @param amount Amount to withdraw
    /// @param recipient Destination address
    function withdraw(address token, uint256 amount, address recipient)
        external
        nonReentrant
        whenNotPaused
        onlyOwnerOrManager
    {
        if (amount == 0) revert ZeroAmount();

        accrueManagementFee(token);

        uint256 available = tokenBalances[token] - deployedCapital[token]
            - accruedPerformanceFees[token] - accruedManagementFees[token];
        if (amount > available) revert InsufficientBalance(available, amount);

        tokenBalances[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit Withdrawn(vaultId, token, amount, recipient, tokenBalances[token]);

        _assertBalanceConsistency(token);
    }

    // ---------------------------------------------------------------
    // Strategy Deployment
    // ---------------------------------------------------------------

    /// @notice Deploy capital from vault to an approved strategy
    /// @param strategy Address of the strategy contract
    /// @param token Stablecoin to deploy
    /// @param amount Amount to deploy
    /// @param pairId The trading pair identifier for exposure tracking
    function deployToStrategy(
        address strategy,
        address token,
        uint256 amount,
        bytes32 pairId
    )
        external
        nonReentrant
        whenNotPaused
        onlyRole(governance.TREASURY_MANAGER_ROLE())
        returns (uint256 deploymentId)
    {
        if (amount == 0) revert ZeroAmount();
        if (!approvedStrategies[strategy]) revert StrategyNotApproved(strategy);
        if (!approvedTokens[token]) revert TokenNotApproved(token);

        uint256 available = tokenBalances[token] - deployedCapital[token];
        if (amount > available) revert InsufficientBalance(available, amount);

        // Risk validation (pass 0 for spread; tick-level checks happen in DexStrategy)
        riskController.validateOrderPlacement(
            pairId,
            0, // tick validation happens in DexStrategy
            amount,
            tokenBalances[token],
            pairExposure[pairId],
            0  // spread check deferred to strategy-level placement
        );

        deployedCapital[token] += amount;
        pairExposure[pairId] += amount;

        IERC20(token).safeTransfer(strategy, amount);

        deploymentId = nextDeploymentId++;
        deployments[deploymentId] = Deployment({
            strategy: strategy,
            token: token,
            amount: amount,
            pairId: pairId,
            timestamp: block.timestamp,
            active: true
        });
        activeDeployments++;

        // Mandatory deployment linkage -- strategy must register this binding
        IDexStrategy(strategy).acceptDeployment(deploymentId, pairId);

        emit CapitalDeployed(vaultId, deploymentId, strategy, token, amount, pairId);
    }

    /// @notice Recall capital from a strategy deployment
    /// @dev Strategy calls this after cancelling orders and consolidating funds for this deployment.
    ///      Strategy must pass the exact amount attributable to this deployment, not its full balance.
    /// @param deploymentId The deployment to recall
    /// @param returnedAmount Amount the strategy is returning for this specific deployment
    function recallFromStrategy(uint256 deploymentId, uint256 returnedAmount)
        external
        nonReentrant
        whenNotPaused
    {
        Deployment storage d = deployments[deploymentId];
        if (!d.active) revert DeploymentNotActive(deploymentId);
        if (msg.sender != d.strategy) revert StrategyNotApproved(msg.sender);

        // Effects first
        d.active = false;
        activeDeployments--;

        if (d.amount <= deployedCapital[d.token]) {
            deployedCapital[d.token] -= d.amount;
        } else {
            deployedCapital[d.token] = 0;
        }

        if (d.amount <= pairExposure[d.pairId]) {
            pairExposure[d.pairId] -= d.amount;
        } else {
            pairExposure[d.pairId] = 0;
        }

        // Interaction: transfer the declared amount
        IERC20(d.token).safeTransferFrom(msg.sender, address(this), returnedAmount);

        // Loss accounting
        if (returnedAmount < d.amount) {
            uint256 loss = d.amount - returnedAmount;
            realizedLosses[d.token] += loss;
            tokenBalances[d.token] += returnedAmount;
            emit LossRealized(vaultId, deploymentId, d.token, d.amount, returnedAmount, loss);
        } else if (returnedAmount > d.amount) {
            // Yield: accrue performance fee
            uint256 yield_ = returnedAmount - d.amount;
            uint256 fee = (yield_ * performanceFeeBps) / 10000;
            accruedPerformanceFees[d.token] += fee;
            tokenBalances[d.token] += (returnedAmount - fee);
            emit PerformanceFeeAccrued(vaultId, d.token, yield_, fee);
        } else {
            tokenBalances[d.token] += returnedAmount;
        }

        emit CapitalRecalled(vaultId, deploymentId, returnedAmount);

        _assertBalanceConsistency(d.token);
    }

    /// @notice Accept emergency fund return from a strategy (direct push, no recall flow)
    /// @dev Called by strategy during emergencyUnwind. Does not require active deployment
    ///      since the deployment binding is cleared by the strategy before transfer.
    function receiveEmergencyReturn(bytes32 pairId, address token, uint256 amount)
        external
        nonReentrant
    {
        if (!approvedStrategies[msg.sender]) revert StrategyNotApproved(msg.sender);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Adjust exposure tracking
        if (amount <= pairExposure[pairId]) {
            pairExposure[pairId] -= amount;
        } else {
            pairExposure[pairId] = 0;
        }

        if (amount <= deployedCapital[token]) {
            deployedCapital[token] -= amount;
        } else {
            deployedCapital[token] = 0;
        }

        tokenBalances[token] += amount;

        emit EmergencyReturnReceived(vaultId, token, amount, pairId);
    }

    // ---------------------------------------------------------------
    // Fee Management
    // ---------------------------------------------------------------

    /// @notice Set fee configuration. Only callable by admin.
    function setFeeConfig(
        address _feeTreasury,
        uint16 _performanceFeeBps,
        uint16 _managementFeeBps
    ) external onlyRole(governance.ADMIN_ROLE()) {
        if (_feeTreasury == address(0)) revert FeeTreasuryNotSet();
        feeTreasury = _feeTreasury;
        performanceFeeBps = _performanceFeeBps;
        managementFeeBps = _managementFeeBps;
    }

    /// @notice Accrue management fee based on elapsed time and net AUM
    /// @dev AUM excludes deployed capital (at-risk), accrued fees, and realized losses
    function accrueManagementFee(address token) public {
        uint256 lastAccrual = lastFeeAccrualTimestamp[token];
        if (lastAccrual == 0) {
            lastFeeAccrualTimestamp[token] = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - lastAccrual;
        if (elapsed == 0) return;

        // Net AUM: total balance minus deployed capital and accrued fees
        uint256 netAum = tokenBalances[token] - deployedCapital[token]
            - accruedPerformanceFees[token] - accruedManagementFees[token];
        uint256 fee = (netAum * managementFeeBps * elapsed) / (10000 * 365 days);

        if (fee > 0 && fee <= netAum) {
            accruedManagementFees[token] += fee;
            tokenBalances[token] -= fee;
            emit ManagementFeeAccrued(vaultId, token, fee, elapsed);
        }

        lastFeeAccrualTimestamp[token] = block.timestamp;
    }

    /// @notice Distribute accrued fees to protocol treasury
    function distributeFees(address token) external nonReentrant onlyRole(governance.ADMIN_ROLE()) {
        if (feeTreasury == address(0)) revert FeeTreasuryNotSet();

        uint256 perfFee = accruedPerformanceFees[token];
        uint256 mgmtFee = accruedManagementFees[token];
        uint256 totalFee = perfFee + mgmtFee;
        if (totalFee == 0) return;

        accruedPerformanceFees[token] = 0;
        accruedManagementFees[token] = 0;

        IERC20(token).safeTransfer(feeTreasury, totalFee);

        emit FeesDistributed(vaultId, token, perfFee, mgmtFee, feeTreasury);
        _assertBalanceConsistency(token);
    }

    /// @notice Internal balance consistency assertion
    function _assertBalanceConsistency(address token) internal view {
        uint256 expectedMinBalance = tokenBalances[token] - deployedCapital[token]
            + accruedPerformanceFees[token] + accruedManagementFees[token];
        uint256 actualBalance = IERC20(token).balanceOf(address(this));
        if (actualBalance < expectedMinBalance) {
            revert BalanceConsistencyViolation(token, expectedMinBalance, actualBalance);
        }
    }

    // ---------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------

    /// @notice Get available (undeployed) balance for a token
    function availableBalance(address token) external view returns (uint256) {
        return tokenBalances[token] - deployedCapital[token];
    }

    /// @notice Get vault utilization rate in basis points
    function utilizationBps(address token) external view returns (uint16) {
        if (tokenBalances[token] == 0) return 0;
        return uint16((deployedCapital[token] * 10000) / tokenBalances[token]);
    }
}
```

### Revert Conditions

| Function | Revert Condition |
|---|---|
| deposit | amount == 0, token not approved, protocol paused, caller lacks role |
| withdraw | amount == 0, insufficient available balance, protocol paused, caller lacks role |
| deployToStrategy | amount == 0, strategy/token not approved, insufficient balance, risk validation fail, protocol paused |
| recallFromStrategy | deployment not active, caller not the strategy contract |

### Security Considerations

- ReentrancyGuard on all state-changing functions
- SafeERC20 for all token transfers
- checks-effects-interactions pattern followed: balance updates before external calls in withdraw
- Deployed capital tracking prevents over-withdrawal
- Strategy contracts are whitelisted to prevent unauthorized capital movement

---

## 3.5 DexStrategy.sol

**Responsibility:** Manages all interactions with Tempo's orderbook DEX. Handles tick-based liquidity placement, flip order automation, spread management, and emergency unwinds.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRoles.sol";
import "./RiskController.sol";
import "./TreasuryVault.sol";
import "./interfaces/ITempoOrderbook.sol";

/// @title DexStrategy
/// @notice Automated market making and liquidity provisioning on Tempo DEX
contract DexStrategy is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------

    /// @notice Minimum order size enforced by Tempo DEX ($100 equivalent)
    uint256 public constant MIN_ORDER_SIZE = 100e18;

    /// @notice Maximum number of active orders per pair
    uint16 public constant MAX_ORDERS_PER_PAIR = 20;

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    GovernanceRoles public immutable governance;
    RiskController public immutable riskController;
    ITempoOrderbook public immutable dex;
    TreasuryVault public vault;

    /// @notice Strategy configuration per pair
    mapping(bytes32 => StrategyConfig) public pairConfigs;

    /// @notice Active order IDs per pair
    mapping(bytes32 => uint256[]) public activeOrderIds;

    /// @notice Order details tracking
    mapping(uint256 => OrderRecord) public orderRecords;

    /// @notice Cumulative spread captured per pair (for yield reporting)
    mapping(bytes32 => uint256) public cumulativeSpreadCaptured;

    /// @notice Cumulative volume per pair
    mapping(bytes32 => uint256) public cumulativeVolume;

    /// @notice Current inventory per token (amount held by this contract)
    mapping(address => uint256) public inventory;

    /// @notice Bid-side exposure per pair
    mapping(bytes32 => uint256) public bidExposure;

    /// @notice Ask-side exposure per pair
    mapping(bytes32 => uint256) public askExposure;

    /// @notice Active deploymentId for each pair (one deployment per pair at a time)
    mapping(bytes32 => uint256) public activeDeploymentForPair;

    /// @notice Whether a pair has an active vault deployment
    mapping(bytes32 => bool) public pairHasActiveDeployment;

    /// @notice Capital principal attributable to each deployment (for accurate recall)
    mapping(uint256 => uint256) public deploymentPrincipal;

    // ---------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------

    struct StrategyConfig {
        address tokenA;            // Base token
        address tokenB;            // Quote token (typically pathUSD)
        int24 baseTickWidth;       // Base spread from center in ticks
        uint256 orderSizePerTick;  // Size of each order
        uint16 numBidLevels;       // Number of bid orders to place
        uint16 numAskLevels;       // Number of ask orders to place
        bool useFlipOrders;        // Whether to use auto-reversing flip orders
        bool active;               // Strategy active flag
    }

    struct OrderRecord {
        bytes32 pairId;
        int24 tick;
        uint256 amount;
        bool isBid;
        bool isFlip;
        uint256 placedAt;
    }

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error StrategyNotActive(bytes32 pairId);
    error TooManyOrders(bytes32 pairId, uint16 max);
    error OrderSizeBelowMinimum(uint256 size, uint256 minimum);
    error EmergencyUnwindFailed(uint256 orderId);
    error PairNotLinkedToDeployment(bytes32 pairId);
    error PairAlreadyHasActiveDeployment(bytes32 pairId);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event StrategyConfigured(
        bytes32 indexed pairId,
        StrategyConfig config
    );

    event OrderPlaced(
        bytes32 indexed pairId,
        uint256 indexed orderId,
        int24 tick,
        uint256 amount,
        bool isBid,
        bool isFlip
    );

    event OrderCancelled(
        bytes32 indexed pairId,
        uint256 indexed orderId,
        uint256 refundedAmount
    );

    event SpreadCaptured(
        bytes32 indexed pairId,
        uint256 amount,
        uint256 cumulativeTotal
    );

    event EmergencyUnwind(
        bytes32 indexed pairId,
        uint256 ordersUnwound,
        uint256 totalRefunded,
        uint256 returnedToVault
    );

    event DeploymentAccepted(
        bytes32 indexed pairId,
        uint256 indexed deploymentId,
        uint256 principal
    );

    event PositionsAdjusted(
        bytes32 indexed pairId,
        int24 newTickWidth,
        uint256 timestamp
    );

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyRole(bytes32 role) {
        governance.checkRole(role, msg.sender);
        _;
    }

    modifier whenNotPaused() {
        if (riskController.paused()) revert RiskController.ProtocolPaused();
        _;
    }

    modifier whenStrategyActive(bytes32 pairId) {
        if (!pairConfigs[pairId].active) revert StrategyNotActive(pairId);
        _;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(
        address _governance,
        address _riskController,
        address _dex,
        address _vault
    ) {
        governance = GovernanceRoles(_governance);
        riskController = RiskController(_riskController);
        dex = ITempoOrderbook(_dex);
        vault = TreasuryVault(_vault);
    }

    // ---------------------------------------------------------------
    // Strategy Configuration
    // ---------------------------------------------------------------

    function configureStrategy(bytes32 pairId, StrategyConfig calldata config)
        external
        onlyRole(governance.STRATEGIST_ROLE())
    {
        if (config.orderSizePerTick < MIN_ORDER_SIZE) {
            revert OrderSizeBelowMinimum(config.orderSizePerTick, MIN_ORDER_SIZE);
        }
        pairConfigs[pairId] = config;
        emit StrategyConfigured(pairId, config);
    }

    // ---------------------------------------------------------------
    // Deployment Linkage
    // ---------------------------------------------------------------

    /// @notice Register a deployment from TreasuryVault, linking capital to a specific pair
    /// @dev Called by TreasuryVault.deployToStrategy() after transferring funds
    function acceptDeployment(uint256 deploymentId, bytes32 pairId)
        external
    {
        if (msg.sender != address(vault)) revert StrategyNotActive(pairId);
        if (pairHasActiveDeployment[pairId]) revert PairAlreadyHasActiveDeployment(pairId);

        uint256 principal = IERC20(pairConfigs[pairId].tokenB).balanceOf(address(this));
        activeDeploymentForPair[pairId] = deploymentId;
        pairHasActiveDeployment[pairId] = true;
        deploymentPrincipal[deploymentId] = principal;

        emit DeploymentAccepted(pairId, deploymentId, principal);
    }

    // ---------------------------------------------------------------
    // Liquidity Placement
    // ---------------------------------------------------------------

    /// @notice Deploy liquidity across bid and ask levels
    /// @param pairId The pair to deploy on
    function deployLiquidity(bytes32 pairId)
        external
        nonReentrant
        whenNotPaused
        whenStrategyActive(pairId)
        onlyRole(governance.STRATEGIST_ROLE())
    {
        // Enforce Capital Linkage Invariant
        if (!pairHasActiveDeployment[pairId]) revert PairNotLinkedToDeployment(pairId);

        StrategyConfig storage config = pairConfigs[pairId];

        // Read current spread for sanity check
        int24 currentSpread_ = dex.bestAsk(config.tokenA, config.tokenB)
            - dex.bestBid(config.tokenA, config.tokenB);

        // Get recommended tick width from risk controller
        int24 tickWidth = riskController.recommendedTickWidth(pairId, config.baseTickWidth);

        // Place bid orders (negative ticks = below peg)
        for (uint16 i = 0; i < config.numBidLevels; i++) {
            if (activeOrderIds[pairId].length >= MAX_ORDERS_PER_PAIR) {
                revert TooManyOrders(pairId, MAX_ORDERS_PER_PAIR);
            }

            int24 tick = -(tickWidth + int24(int16(i)) * config.baseTickWidth);

            // Validate with risk controller using vault-level data
            riskController.validateOrderPlacement(
                pairId,
                tick,
                config.orderSizePerTick,
                vault.tokenBalances(config.tokenB),
                vault.pairExposure(pairId),
                currentSpread_
            );

            // Approve and place order
            IERC20(config.tokenB).safeIncreaseAllowance(address(dex), config.orderSizePerTick);
            uint256 orderId = dex.placeOrder(
                config.tokenB,
                config.tokenA,
                tick,
                config.orderSizePerTick,
                config.useFlipOrders
            );

            activeOrderIds[pairId].push(orderId);
            orderRecords[orderId] = OrderRecord({
                pairId: pairId,
                tick: tick,
                amount: config.orderSizePerTick,
                isBid: true,
                isFlip: config.useFlipOrders,
                placedAt: block.timestamp
            });
            bidExposure[pairId] += config.orderSizePerTick;

            emit OrderPlaced(pairId, orderId, tick, config.orderSizePerTick, true, config.useFlipOrders);
        }

        // Place ask orders (positive ticks = above peg)
        for (uint16 i = 0; i < config.numAskLevels; i++) {
            if (activeOrderIds[pairId].length >= MAX_ORDERS_PER_PAIR) {
                revert TooManyOrders(pairId, MAX_ORDERS_PER_PAIR);
            }

            int24 tick = tickWidth + int24(int16(i)) * config.baseTickWidth;

            riskController.validateOrderPlacement(
                pairId,
                tick,
                config.orderSizePerTick,
                vault.tokenBalances(config.tokenA),
                vault.pairExposure(pairId),
                currentSpread_
            );

            IERC20(config.tokenA).safeIncreaseAllowance(address(dex), config.orderSizePerTick);
            uint256 orderId = dex.placeOrder(
                config.tokenA,
                config.tokenB,
                tick,
                config.orderSizePerTick,
                config.useFlipOrders
            );

            activeOrderIds[pairId].push(orderId);
            orderRecords[orderId] = OrderRecord({
                pairId: pairId,
                tick: tick,
                amount: config.orderSizePerTick,
                isBid: false,
                isFlip: config.useFlipOrders,
                placedAt: block.timestamp
            });
            askExposure[pairId] += config.orderSizePerTick;

            emit OrderPlaced(pairId, orderId, tick, config.orderSizePerTick, false, config.useFlipOrders);
        }
    }

    // ---------------------------------------------------------------
    // Position Adjustment
    // ---------------------------------------------------------------

    /// @notice Cancel all orders and redeploy at new tick width
    /// @dev Called when risk controller recommends wider/tighter spreads
    function adjustPositions(bytes32 pairId)
        external
        nonReentrant
        whenNotPaused
        whenStrategyActive(pairId)
        onlyRole(governance.STRATEGIST_ROLE())
    {
        _cancelAllOrders(pairId);

        // Re-read recommended width (may have changed)
        int24 newWidth = riskController.recommendedTickWidth(
            pairId,
            pairConfigs[pairId].baseTickWidth
        );

        emit PositionsAdjusted(pairId, newWidth, block.timestamp);

        // Note: Caller should invoke deployLiquidity() after this
        // Separated to allow inspection of state between cancel and redeploy
    }

    // ---------------------------------------------------------------
    // Emergency Unwind
    // ---------------------------------------------------------------

    /// @notice Cancel all orders for a pair, return all capital to vault, clear deployment binding
    function emergencyUnwind(bytes32 pairId)
        external
        nonReentrant
        onlyRole(governance.EMERGENCY_ROLE())
    {
        uint256 orderCount = activeOrderIds[pairId].length;
        uint256 totalRefunded = _cancelAllOrders(pairId);
        pairConfigs[pairId].active = false;

        // Clear deployment binding
        uint256 depId = activeDeploymentForPair[pairId];
        delete deploymentPrincipal[depId];
        delete activeDeploymentForPair[pairId];
        pairHasActiveDeployment[pairId] = false;

        // Return all token balances to vault via dedicated receiver
        StrategyConfig storage config = pairConfigs[pairId];
        uint256 totalReturned = 0;
        totalReturned += _returnTokenToVault(pairId, config.tokenA);
        totalReturned += _returnTokenToVault(pairId, config.tokenB);

        emit EmergencyUnwind(pairId, orderCount, totalRefunded, totalReturned);
    }

    /// @notice Transfer entire balance of a token back to vault via receiveEmergencyReturn
    function _returnTokenToVault(bytes32 pairId, address token) internal returns (uint256 returned) {
        returned = IERC20(token).balanceOf(address(this));
        if (returned > 0) {
            IERC20(token).safeIncreaseAllowance(address(vault), returned);
            vault.receiveEmergencyReturn(pairId, token, returned);
        }
    }

    // ---------------------------------------------------------------
    // Internal Helpers
    // ---------------------------------------------------------------

    function _cancelAllOrders(bytes32 pairId) internal returns (uint256 totalRefunded) {
        uint256[] storage orderIds = activeOrderIds[pairId];

        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 orderId = orderIds[i];
            OrderRecord storage record = orderRecords[orderId];

            uint256 refunded = dex.cancelOrder(orderId);
            totalRefunded += refunded;

            if (record.isBid) {
                bidExposure[pairId] = bidExposure[pairId] >= record.amount
                    ? bidExposure[pairId] - record.amount
                    : 0;
            } else {
                askExposure[pairId] = askExposure[pairId] >= record.amount
                    ? askExposure[pairId] - record.amount
                    : 0;
            }

            emit OrderCancelled(pairId, orderId, refunded);
        }

        delete activeOrderIds[pairId];
    }

    // ---------------------------------------------------------------
    // Yield Reporting
    // ---------------------------------------------------------------

    /// @notice Record spread captured from filled flip orders
    /// @dev Called by an offchain keeper that monitors order fills
    function recordSpreadCapture(bytes32 pairId, uint256 amount)
        external
        onlyRole(governance.ORACLE_ROLE())
    {
        cumulativeSpreadCaptured[pairId] += amount;
        cumulativeVolume[pairId] += amount;
        emit SpreadCaptured(pairId, amount, cumulativeSpreadCaptured[pairId]);
    }

    // ---------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------

    function getActiveOrderCount(bytes32 pairId) external view returns (uint256) {
        return activeOrderIds[pairId].length;
    }

    function getActiveOrders(bytes32 pairId) external view returns (uint256[] memory) {
        return activeOrderIds[pairId];
    }

    /// @notice Get current spread in ticks between best bid and ask
    function currentSpread(bytes32 pairId) external view returns (int24) {
        StrategyConfig storage config = pairConfigs[pairId];
        int24 bestBid = dex.bestBid(config.tokenA, config.tokenB);
        int24 bestAsk = dex.bestAsk(config.tokenA, config.tokenB);
        return bestAsk - bestBid;
    }
}
```

---

## 3.6 LendingModule.sol

**Responsibility:** Fixed-term collateralized lending pools funded by TreasuryVault deployments. Borrowers post collateral and repay principal plus interest. Interest revenue funds vault yield. Capital pools are strictly separated: principal pool and interest pool.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRoles.sol";

/// @title LendingModule
/// @notice Fixed-term collateralized stablecoin lending funded by vault capital
contract LendingModule is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------

    uint256 public constant TERM_30_DAYS = 30 days;
    uint256 public constant TERM_60_DAYS = 60 days;
    uint256 public constant TERM_90_DAYS = 90 days;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_COLLATERAL_RATIO_BPS = 12000; // 120% minimum

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    GovernanceRoles public immutable governance;

    /// @notice Interest rates per term in basis points (annualized)
    mapping(uint256 => uint16) public termRatesBps;

    /// @notice All loan positions
    mapping(uint256 => LoanPosition) public positions;
    uint256 public nextPositionId;

    /// @notice Principal pool: capital supplied by vaults, available for lending
    mapping(address => uint256) public principalPool;

    /// @notice Interest pool: interest earned from borrower repayments
    mapping(address => uint256) public interestPool;

    /// @notice Total capital currently lent out
    mapping(address => uint256) public totalActiveLending;

    /// @notice Whitelisted vault addresses that can supply capital
    mapping(address => bool) public approvedVaults;

    /// @notice Whitelisted borrower addresses
    mapping(address => bool) public approvedBorrowers;

    /// @notice Collateral token accepted
    address public collateralToken;

    /// @notice Collateral balances per borrower
    mapping(address => uint256) public collateralBalances;

    // ---------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------

    struct LoanPosition {
        address borrower;
        address token;
        uint256 principal;
        uint16 rateBps;
        uint256 term;
        uint256 startTimestamp;
        uint256 maturityTimestamp;
        uint256 collateralAmount;
        bool repaid;
        bool liquidated;
        bool active;
    }

    // ---------------------------------------------------------------
    // Custom Errors
    // ---------------------------------------------------------------

    error InvalidTerm(uint256 term);
    error PositionNotActive(uint256 positionId);
    error NotPositionOwner(address caller, address owner);
    error ZeroAmount();
    error RateNotSet(uint256 term);
    error VaultNotApproved(address vault);
    error BorrowerNotApproved(address borrower);
    error InsufficientLendableCapital(uint256 available, uint256 requested);
    error InsufficientCollateral(uint256 provided, uint256 required);
    error LoanNotOverdue(uint256 maturity);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event CapitalSupplied(address indexed vault, address indexed token, uint256 amount);
    event CapitalWithdrawn(address indexed vault, address indexed token, uint256 principalAmount, uint256 interestAmount);
    event LoanOriginated(
        uint256 indexed positionId,
        address indexed borrower,
        address indexed token,
        uint256 principal,
        uint16 rateBps,
        uint256 term,
        uint256 collateralAmount
    );
    event LoanRepaid(uint256 indexed positionId, address indexed borrower, uint256 principal, uint256 interest);
    event LoanLiquidated(uint256 indexed positionId, address indexed borrower, uint256 collateralSeized);
    event TermRateUpdated(uint256 term, uint16 rateBps);

    // ---------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------

    modifier onlyRole(bytes32 role) {
        governance.checkRole(role, msg.sender);
        _;
    }

    modifier onlyApprovedVault() {
        if (!approvedVaults[msg.sender]) revert VaultNotApproved(msg.sender);
        _;
    }

    modifier onlyApprovedBorrower() {
        if (!approvedBorrowers[msg.sender]) revert BorrowerNotApproved(msg.sender);
        _;
    }

    // ---------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------

    constructor(address _governance, address _collateralToken) {
        governance = GovernanceRoles(_governance);
        collateralToken = _collateralToken;
    }

    // ---------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------

    function setTermRate(uint256 term, uint16 rateBps) external onlyRole(governance.ADMIN_ROLE()) {
        if (term != TERM_30_DAYS && term != TERM_60_DAYS && term != TERM_90_DAYS) revert InvalidTerm(term);
        termRatesBps[term] = rateBps;
        emit TermRateUpdated(term, rateBps);
    }

    function setApprovedVault(address vault_, bool approved) external onlyRole(governance.ADMIN_ROLE()) {
        approvedVaults[vault_] = approved;
    }

    function setApprovedBorrower(address borrower, bool approved) external onlyRole(governance.ADMIN_ROLE()) {
        approvedBorrowers[borrower] = approved;
    }

    // ---------------------------------------------------------------
    // Capital Supply (from TreasuryVault only)
    // ---------------------------------------------------------------

    /// @notice Supply capital for lending. Only callable by approved vaults.
    function supplyCapital(address token, uint256 amount) external nonReentrant onlyApprovedVault {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        principalPool[token] += amount;
        emit CapitalSupplied(msg.sender, token, amount);
    }

    /// @notice Withdraw idle capital plus earned interest back to vault
    /// @dev Strictly separates principal and interest pool debits
    function withdrawCapital(address token, uint256 amount) external nonReentrant onlyApprovedVault {
        if (amount == 0) revert ZeroAmount();
        uint256 availablePrincipal = principalPool[token] - totalActiveLending[token];
        uint256 availableInterest = interestPool[token];
        uint256 totalAvailable = availablePrincipal + availableInterest;
        if (amount > totalAvailable) revert InsufficientLendableCapital(totalAvailable, amount);

        // Debit from principal first, then interest
        uint256 fromPrincipal = amount <= availablePrincipal ? amount : availablePrincipal;
        uint256 fromInterest = amount - fromPrincipal;

        principalPool[token] -= fromPrincipal;
        interestPool[token] -= fromInterest;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit CapitalWithdrawn(msg.sender, token, fromPrincipal, fromInterest);
    }

    // ---------------------------------------------------------------
    // Borrowing
    // ---------------------------------------------------------------

    function borrow(address token, uint256 amount, uint256 term, uint256 collateralAmount)
        external nonReentrant onlyApprovedBorrower returns (uint256 positionId)
    {
        if (amount == 0) revert ZeroAmount();
        if (term != TERM_30_DAYS && term != TERM_60_DAYS && term != TERM_90_DAYS) revert InvalidTerm(term);
        if (termRatesBps[term] == 0) revert RateNotSet(term);

        uint256 available = principalPool[token] - totalActiveLending[token];
        if (amount > available) revert InsufficientLendableCapital(available, amount);

        uint256 requiredCollateral = (amount * MIN_COLLATERAL_RATIO_BPS) / BPS_DENOMINATOR;
        if (collateralAmount < requiredCollateral) revert InsufficientCollateral(collateralAmount, requiredCollateral);

        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);
        collateralBalances[msg.sender] += collateralAmount;

        positionId = nextPositionId++;
        positions[positionId] = LoanPosition({
            borrower: msg.sender,
            token: token,
            principal: amount,
            rateBps: termRatesBps[term],
            term: term,
            startTimestamp: block.timestamp,
            maturityTimestamp: block.timestamp + term,
            collateralAmount: collateralAmount,
            repaid: false,
            liquidated: false,
            active: true
        });

        totalActiveLending[token] += amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit LoanOriginated(positionId, msg.sender, token, amount, termRatesBps[term], term, collateralAmount);
    }

    function repay(uint256 positionId) external nonReentrant {
        LoanPosition storage pos = positions[positionId];
        if (!pos.active) revert PositionNotActive(positionId);
        if (msg.sender != pos.borrower) revert NotPositionOwner(msg.sender, pos.borrower);

        uint256 interest = calculateInterest(pos.principal, pos.rateBps, pos.term);
        uint256 totalRepayment = pos.principal + interest;

        pos.repaid = true;
        pos.active = false;
        totalActiveLending[pos.token] -= pos.principal;

        // Interest goes to interest pool (strictly separated)
        interestPool[pos.token] += interest;

        IERC20(pos.token).safeTransferFrom(msg.sender, address(this), totalRepayment);

        // Return collateral
        uint256 collateral = pos.collateralAmount;
        collateralBalances[msg.sender] -= collateral;
        IERC20(collateralToken).safeTransfer(msg.sender, collateral);

        emit LoanRepaid(positionId, msg.sender, pos.principal, interest);
    }

    function liquidate(uint256 positionId) external nonReentrant onlyRole(governance.RISK_OFFICER_ROLE()) {
        LoanPosition storage pos = positions[positionId];
        if (!pos.active) revert PositionNotActive(positionId);
        if (block.timestamp < pos.maturityTimestamp + 3 days) revert LoanNotOverdue(pos.maturityTimestamp);

        pos.liquidated = true;
        pos.active = false;
        totalActiveLending[pos.token] -= pos.principal;

        uint256 collateral = pos.collateralAmount;
        collateralBalances[pos.borrower] -= collateral;

        emit LoanLiquidated(positionId, pos.borrower, collateral);
    }

    // ---------------------------------------------------------------
    // Interest Calculation
    // ---------------------------------------------------------------

    function calculateInterest(uint256 principal, uint16 rateBps, uint256 term)
        public pure returns (uint256)
    {
        return (principal * uint256(rateBps) * term) / (365 days * BPS_DENOMINATOR);
    }

    // ---------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------

    function getPosition(uint256 positionId) external view returns (LoanPosition memory) {
        return positions[positionId];
    }

    function isMatured(uint256 positionId) external view returns (bool) {
        return block.timestamp >= positions[positionId].maturityTimestamp;
    }

    function availableToLend(address token) external view returns (uint256) {
        return principalPool[token] - totalActiveLending[token];
    }
}
```

---

## 3.7 ReportingAdapter.sol

**Responsibility:** Emit structured events for compliance, audit, and analytics. Does not store data onchain -- relies on event indexing.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ReportingAdapter
/// @notice Structured event emission for compliance and analytics
contract ReportingAdapter {

    // ---------------------------------------------------------------
    // Event Schema
    // ---------------------------------------------------------------

    event TreasuryAction(
        uint256 indexed vaultId,
        bytes32 indexed actionType,    // "DEPOSIT", "WITHDRAW", "DEPLOY", "RECALL"
        address indexed token,
        uint256 amount,
        address actor,
        uint256 timestamp,
        bytes32 metadata               // Encoded additional context
    );

    event RiskEvent(
        bytes32 indexed pairId,
        bytes32 indexed eventType,     // "CIRCUIT_BREAK", "SPREAD_ADJUST", "UNWIND"
        int24 tickBefore,
        int24 tickAfter,
        uint256 exposureBefore,
        uint256 exposureAfter,
        uint256 timestamp
    );

    event YieldEvent(
        uint256 indexed vaultId,
        bytes32 indexed pairId,
        uint256 spreadCaptured,
        uint256 lendingInterest,
        uint256 totalYield,
        uint256 period,                // Reporting period end timestamp
        uint256 timestamp
    );

    event ComplianceSnapshot(
        uint256 indexed vaultId,
        uint256 totalBalance,
        uint256 totalDeployed,
        uint256 totalLent,
        uint16 utilizationBps,
        uint256 timestamp
    );

    // ---------------------------------------------------------------
    // Emission Functions
    // ---------------------------------------------------------------

    function emitTreasuryAction(
        uint256 vaultId,
        bytes32 actionType,
        address token,
        uint256 amount,
        address actor,
        bytes32 metadata
    ) external {
        emit TreasuryAction(vaultId, actionType, token, amount, actor, block.timestamp, metadata);
    }

    function emitRiskEvent(
        bytes32 pairId,
        bytes32 eventType,
        int24 tickBefore,
        int24 tickAfter,
        uint256 exposureBefore,
        uint256 exposureAfter
    ) external {
        emit RiskEvent(pairId, eventType, tickBefore, tickAfter, exposureBefore, exposureAfter, block.timestamp);
    }

    function emitYieldEvent(
        uint256 vaultId,
        bytes32 pairId,
        uint256 spreadCaptured,
        uint256 lendingInterest,
        uint256 period
    ) external {
        emit YieldEvent(
            vaultId,
            pairId,
            spreadCaptured,
            lendingInterest,
            spreadCaptured + lendingInterest,
            period,
            block.timestamp
        );
    }

    function emitComplianceSnapshot(
        uint256 vaultId,
        uint256 totalBalance,
        uint256 totalDeployed,
        uint256 totalLent,
        uint16 utilizationBps
    ) external {
        emit ComplianceSnapshot(
            vaultId,
            totalBalance,
            totalDeployed,
            totalLent,
            utilizationBps,
            block.timestamp
        );
    }
}
```

---

# 4. DEX STRATEGY ENGINE DESIGN

## 4.1 Tick Logic

Tempo's DEX uses integer ticks from -2000 to +2000, each representing a basis point deviation from the 1:1 peg center. Tick 0 is the peg center.

**Price mapping:**

```
price(tick) = 1.0 + (tick / 100000)
```

For tick = +20: price = 1.00020 (0.02% above peg)
For tick = -20: price = 0.99980 (0.02% below peg)

## 4.2 Spread Calculation

The spread is defined as the distance between the bid and ask ticks placed by the vault.

**Base spread formula:**

```
spreadTicks = 2 * baseTickWidth
```

**Dynamic spread adjustment:**

```
adjustedWidth = baseTickWidth + floor(abs(pegDeviation) * DEVIATION_MULTIPLIER / 100)
```

Where `DEVIATION_MULTIPLIER = 50` (widen by 50% of observed deviation).

**Constraints:**

```
MIN_TICK_WIDTH <= adjustedWidth <= maxTickDeviation
```

Default `MIN_TICK_WIDTH = 5` ticks (0.005% minimum spread).

## 4.3 Flip Order Automation

When a flip order fills:

1. The filled order auto-reverses its direction
2. If a bid at tick -20 fills (bought tokenA), a new ask is placed at tick +20 (sell tokenA)
3. The spread between the original bid and the new ask is the captured yield

**Spread capture per round trip:**

```
yieldPerRoundTrip = orderSize * spreadTicks / 100000
```

For $10,000 order with 40-tick spread:

```
yield = 10000 * 40 / 100000 = $4.00 per round trip
```

## 4.4 Inventory Skew Control

Inventory skew occurs when one side (bid or ask) fills disproportionately.

**Imbalance ratio:**

```
imbalanceRatio = max(bidExposure, askExposure) / min(bidExposure, askExposure)
```

**Actions by threshold:**

| Imbalance Ratio | Action |
|---|---|
| < 1.5 | Normal operation |
| 1.5 - 2.0 | Reduce order size on heavy side by 50% |
| 2.0 - 3.0 | Cancel all orders on heavy side, maintain light side |
| > 3.0 | Emergency halt -- cancel all orders, await manual intervention |

## 4.5 Capital Allocation Formula

For a vault with balance `B`, reserve requirement `R` (in bps), and `N` pairs:

```
deployableCapital = B * (10000 - R) / 10000
capitalPerPair = min(deployableCapital / N, B * maxExposurePerPairBps / 10000)
capitalPerSide = capitalPerPair / 2
capitalPerOrder = capitalPerSide / numLevels
```

Each `capitalPerOrder` must be >= `MIN_ORDER_SIZE` ($100).

## 4.6 Emergency Unwind Logic

Trigger conditions (any one):

1. Global pause activated
2. Pair circuit breaker triggered
3. Imbalance ratio > 3.0
4. Oracle staleness exceeded
5. Manual invocation by EMERGENCY role

Unwind procedure:

1. Cancel all active orders for the affected pair
2. Collect all refunded amounts
3. Deactivate strategy config for the pair
4. Emit `EmergencyUnwind` event
5. Capital remains in DexStrategy until explicitly recalled to vault

## 4.7 Failure States

| State | Cause | Recovery |
|---|---|---|
| Order placement reverts | Insufficient DEX liquidity or balance | Retry with smaller size; log and alert |
| Order cancel reverts | DEX state inconsistency | Admin intervention; mark order as orphaned |
| Flip order fills but reversal fails | DEX constraint violation | Emergency unwind remaining positions |
| Gas price spike | Network congestion | Delay non-critical operations; unwind on next block |

---

# 5. RISK ENGINE SPECIFICATION

## 5.1 Input Signals

**Onchain (directly measurable):**

- Current best bid and ask ticks from DEX
- Liquidity depth at each tick level
- Vault token balances
- Current bid/ask exposure per pair
- Orderbook imbalance ratio

**Offchain (oracle-provided):**

- Peg deviation from external price feeds (e.g., Chainlink, Pyth)
- Aggregate orderbook depth across top N ticks
- Volume-weighted average price (VWAP) over trailing 1h/4h/24h
- Cross-exchange peg deviation

## 5.2 Risk Thresholds (Default Configuration)

| Parameter | Default Value | Range |
|---|---|---|
| maxExposurePerPairBps | 3000 (30%) | 500 - 10000 |
| maxTickDeviation | 200 (0.2%) | 10 - 2000 |
| maxImbalanceBps | 5000 (1.5x ratio) | 1000 - 10000 |
| maxOrderSize | 50,000e18 ($50k) | MIN_ORDER_SIZE - type(uint256).max |
| minReserveBps | 2000 (20%) | 0 - 9000 |
| oracleStalenessThreshold | 300 (5 min) | 60 - 3600 |

## 5.3 Capital Adjustment Algorithm

```
Given:
  pegDev = absolute peg deviation in ticks
  depth = total orderbook depth at target ticks (USD)
  vaultBalance = total vault balance
  currentExposure = current deployed capital

Step 1: Compute risk score (0-100)
  riskScore = min(100, pegDev * 2 + max(0, 50 - depth / 1000))

Step 2: Compute target exposure reduction
  if riskScore < 20:  targetReduction = 0%
  if riskScore 20-50: targetReduction = (riskScore - 20) * 1.5%  (0-45%)
  if riskScore 50-80: targetReduction = 45% + (riskScore - 50) * 1.0%  (45-75%)
  if riskScore > 80:  targetReduction = 100% (full unwind)

Step 3: Compute target tick width
  targetWidth = baseTickWidth + floor(riskScore * 0.5)

Step 4: Execute
  if targetReduction == 100%: triggerCircuitBreaker
  else: adjustPositions with new targetWidth and reduced size
```

## 5.4 Vault Exposure Constraints

- No vault may deploy more than `(100 - minReserveBps/100)%` of its total balance
- No single pair may receive more than `maxExposurePerPairBps/10000` of vault balance
- Cross-pair total exposure must not exceed `(100 - minReserveBps/100)%`
- Emergency reserve must be maintained at all times; any operation that would breach it must revert

## 5.5 Edge Cases

| Edge Case | Handling |
|---|---|
| Oracle returns 0 depth | Treat as maximum risk; halt all new orders |
| Peg deviation exceeds +/- 200 ticks | Trigger circuit breaker for pair |
| All orders fill simultaneously | Inventory skew detection triggers halt |
| Token depeg beyond 2% | Circuit breaker; no new orders; existing orders remain for capture |
| Vault balance drops below minimum order size | All strategies deactivated |

---

# 6. ECONOMIC MODEL

## 6.1 Yield Generation Sources

1. **Spread Capture from Flip Orders:** Primary yield. Revenue = orderSize * spreadTicks / 100000 per round trip.
2. **Fixed-Term Lending Interest:** Secondary yield. Revenue = principal * rateBps * term / (365 * 10000).
3. **Peg Restoration Profit:** When vault provides liquidity during depeg and price returns, filled orders are in profit.

## 6.2 Fee Structure

| Fee Type | Rate | Recipient |
|---|---|---|
| Performance fee on spread yield | 10% of captured spread | Protocol treasury |
| Vault management fee | 0.5% annualized on AUM | Protocol treasury |
| Lending origination fee | 0.1% of principal | Protocol treasury |
| Early withdrawal penalty (lending) | Forfeited interest | Distributed to remaining lenders |

## 6.3 Performance Fee Calculation

```
Quarterly performance fee:
  spreadYield = sum of all spread captures in period
  performanceFee = spreadYield * performanceFeeBps / 10000
  netYieldToVault = spreadYield - performanceFee

Management fee (accrued daily):
  dailyFee = vaultAUM * managementFeeBps / (10000 * 365)
```

## 6.4 Worst-Case Liquidity Scenario

Assumptions:

- All flip orders fill on one side (maximum inventory skew)
- Peg deviation reaches 2% (maximum tick range)
- No fills on the opposite side for 24 hours

Simple case maximum unrealized loss:

```
maxLoss_simple = totalDeployedCapital * 0.02  (2% depeg at maximum tick range)
```

Laddered exposure model (realistic worst case):

For N bid levels placed at ticks [-w, -2w, -3w, ..., -Nw]:

```
maxLoss_laddered = sum(orderSize * abs(tick_i) / 100000, for i in 1..N)
```

Extreme depeg scenario (all bids fill, peg drops to -2000):

```
maxLoss_extreme = sum(orderSize * (2000 - abs(tick_i)) / 100000, for i in 1..N)
```

Example: 5 bid levels at 20-tick spacing, $10,000 each:

```
maxLoss_extreme = 10000 * ((2000-20) + (2000-40) + (2000-60) + (2000-80) + (2000-100)) / 100000
               = 10000 * 9700 / 100000
               = $970.00
```

For maximum deployment ($50k per order, 5 levels, 4 pairs):

```
maxLoss_extreme = 4 * 5 * 50000 * 1940 / 100000 = $194,000
```

Mitigation: Circuit breaker triggers at 200-tick deviation, limiting the window.
maxOrderSize cap at $50k and maxExposurePerPairBps at 30% bound aggregate risk.
The laddered model shows risk scales with order size and level count, not simply total deployment.

## 6.5 Peg Defense Logic

When peg deviation exceeds threshold:

1. Vault deploys additional liquidity at ticks bracketing the deviation
2. This provides buy-side support during downward depeg, sell-side during upward
3. As peg restores, filled orders profit from the convergence
4. Net effect: vault earns outsized returns during volatility while stabilizing the market

Revenue during peg defense events is typically 3-5x normal spread capture due to wider spreads and higher fill rates.

---

# 7. ROLE-BASED ACCESS CONTROL

Defined in Section 3.2 (GovernanceRoles.sol). Permission matrix included there.

### Escalation Flow

1. Normal operations: TREASURY_MANAGER and STRATEGIST handle routine deposits, withdrawals, strategy execution
2. Risk escalation: RISK_OFFICER adjusts thresholds, triggers pair-level circuit breakers
3. Emergency: EMERGENCY role pauses entire protocol; all operations halt
4. Recovery: ADMIN + RISK_OFFICER jointly reset circuit breakers and unpause
5. Governance upgrade: ADMIN role only; timelocked for parameter changes affecting economic model

### Emergency Controls

- `toggleGlobalPause(true)` -- halts all deposits, withdrawals, strategy operations
- `triggerCircuitBreaker(pairId)` -- halts operations for a specific pair
- `emergencyUnwind(pairId)` -- cancels all orders and deactivates strategy for a pair

---

# 8. OFFCHAIN SERVICES

## 8.1 Risk Signal Engine

**Language:** Python 3.11+
**Framework:** FastAPI

**Inputs:**

- Tempo DEX orderbook snapshots (polled every 10 seconds)
- External price feeds (Chainlink, Pyth via REST/WebSocket)
- Vault state from event indexer

**Outputs:**

- `OracleSignal` struct signed by ORACLE_ROLE key
- Submitted as onchain transaction to `RiskController.updateOracleSignal()`

**Architecture:**

```
[DEX Poller] --> [Signal Processor] --> [Risk Scorer] --> [Oracle Relay]
                                                               |
[Price Feed Poller] ---^                                       v
                                                        [Tempo Chain Tx]
```

## 8.2 Oracle Relay

**Message Format (EIP-712 typed data):**

```
struct OracleUpdate {
    bytes32 pairId;
    int24 pegDeviation;
    uint256 orderbookDepthBid;
    uint256 orderbookDepthAsk;
    uint256 timestamp;
    uint256 nonce;
}
```

**Signature verification:** ECDSA signature from address holding ORACLE_ROLE.

**Replay prevention:** Monotonically increasing nonce per pairId. Contract rejects nonce <= last accepted nonce.

**Failure handling:**

- If oracle update fails, retry 3 times with exponential backoff (1s, 2s, 4s)
- If all retries fail, alert via webhook and continue with stale data (circuit breaker will trigger at staleness threshold)
- If gas estimation exceeds 2x baseline, delay and retry

## 8.3 Event Indexer

**Technology:** Custom indexer or The Graph subgraph

**Indexed Events:**

- All events from TreasuryVault, DexStrategy, RiskController, LendingModule, ReportingAdapter
- Block number, transaction hash, log index stored for each event

**Data served to:**

- Dashboard API (REST + WebSocket)
- Risk Signal Engine (real-time vault state)
- Compliance export service

## 8.4 API Contract

Base URL: `/api/v1`

### Endpoints

```
GET  /vaults/{vaultId}                    -- Vault summary
GET  /vaults/{vaultId}/balances           -- Token balances
GET  /vaults/{vaultId}/deployments        -- Active strategy deployments
GET  /vaults/{vaultId}/yield              -- Yield history and projections
GET  /vaults/{vaultId}/compliance         -- Compliance snapshots
GET  /strategies/{pairId}/orders          -- Active orders for a pair
GET  /strategies/{pairId}/performance     -- P&L and spread captured
GET  /risk/signals/{pairId}               -- Current risk signals
GET  /risk/thresholds                     -- Current risk parameters
GET  /lending/positions?lender={address}  -- Lending positions
WS   /ws/orderbook/{pairId}              -- Real-time orderbook updates
WS   /ws/vault/{vaultId}                 -- Real-time vault state changes
```

**Authentication:** JWT bearer tokens issued via wallet signature (Sign-In with Ethereum).

**Rate limiting:** 100 requests/minute for REST, 10 concurrent WebSocket connections per account.

---

# 9. DATABASE SCHEMA

Used by the offchain indexer and API service.

```sql
-- Vault state snapshots
CREATE TABLE vault_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    vault_id        NUMERIC NOT NULL,
    token_address   TEXT NOT NULL,
    balance         NUMERIC(78, 0) NOT NULL,
    deployed        NUMERIC(78, 0) NOT NULL,
    utilization_bps SMALLINT NOT NULL,
    block_number    BIGINT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,
    INDEX idx_vault_snapshots_vault_time (vault_id, timestamp)
);

-- Strategy order history
CREATE TABLE order_history (
    id              BIGSERIAL PRIMARY KEY,
    pair_id         TEXT NOT NULL,
    order_id        NUMERIC NOT NULL,
    tick            SMALLINT NOT NULL,
    amount          NUMERIC(78, 0) NOT NULL,
    is_bid          BOOLEAN NOT NULL,
    is_flip         BOOLEAN NOT NULL,
    status          TEXT NOT NULL,       -- 'active', 'filled', 'cancelled'
    placed_at       TIMESTAMPTZ NOT NULL,
    filled_at       TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    refunded_amount NUMERIC(78, 0),
    tx_hash         TEXT NOT NULL,
    block_number    BIGINT NOT NULL,
    INDEX idx_orders_pair_status (pair_id, status),
    INDEX idx_orders_placed (placed_at)
);

-- Yield records
CREATE TABLE yield_records (
    id                BIGSERIAL PRIMARY KEY,
    vault_id          NUMERIC NOT NULL,
    pair_id           TEXT NOT NULL,
    spread_captured   NUMERIC(78, 0) NOT NULL,
    lending_interest  NUMERIC(78, 0) NOT NULL,
    total_yield       NUMERIC(78, 0) NOT NULL,
    period_start      TIMESTAMPTZ NOT NULL,
    period_end        TIMESTAMPTZ NOT NULL,
    INDEX idx_yield_vault_period (vault_id, period_end)
);

-- Risk events
CREATE TABLE risk_events (
    id              BIGSERIAL PRIMARY KEY,
    pair_id         TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    tick_before     SMALLINT,
    tick_after      SMALLINT,
    exposure_before NUMERIC(78, 0),
    exposure_after  NUMERIC(78, 0),
    risk_score      SMALLINT,
    timestamp       TIMESTAMPTZ NOT NULL,
    block_number    BIGINT NOT NULL,
    INDEX idx_risk_pair_time (pair_id, timestamp)
);

-- Lending positions
CREATE TABLE lending_positions (
    id                BIGSERIAL PRIMARY KEY,
    position_id       NUMERIC NOT NULL UNIQUE,
    lender_address    TEXT NOT NULL,
    token_address     TEXT NOT NULL,
    principal         NUMERIC(78, 0) NOT NULL,
    rate_bps          SMALLINT NOT NULL,
    term_seconds      INTEGER NOT NULL,
    start_timestamp   TIMESTAMPTZ NOT NULL,
    maturity_timestamp TIMESTAMPTZ NOT NULL,
    claimed           BOOLEAN DEFAULT FALSE,
    INDEX idx_lending_lender (lender_address),
    INDEX idx_lending_maturity (maturity_timestamp)
);

-- Oracle signals
CREATE TABLE oracle_signals (
    id                  BIGSERIAL PRIMARY KEY,
    pair_id             TEXT NOT NULL,
    peg_deviation       SMALLINT NOT NULL,
    orderbook_depth_bid NUMERIC(78, 0) NOT NULL,
    orderbook_depth_ask NUMERIC(78, 0) NOT NULL,
    timestamp           TIMESTAMPTZ NOT NULL,
    block_number        BIGINT NOT NULL,
    INDEX idx_oracle_pair_time (pair_id, timestamp DESC)
);
```

---

# 10. API DESIGN

Covered in Section 8.4. Request/response schemas follow standard JSON:API format.

**Example response for `GET /vaults/{vaultId}`:**

```json
{
    "data": {
        "vaultId": "1",
        "owner": "0x...",
        "createdAt": "2025-01-01T00:00:00Z",
        "balances": [
            {
                "token": "0x...pathUSD",
                "balance": "1000000000000000000000000",
                "deployed": "600000000000000000000000",
                "available": "400000000000000000000000",
                "utilizationBps": 6000
            }
        ],
        "activeDeployments": 3,
        "totalYield": {
            "spread": "5000000000000000000000",
            "lending": "2000000000000000000000",
            "total": "7000000000000000000000",
            "periodStart": "2025-01-01T00:00:00Z",
            "periodEnd": "2025-02-01T00:00:00Z"
        }
    }
}
```

---

# 11. TESTING STRATEGY

## 11.1 Unit Test Categories

| Category | Scope | Framework |
|---|---|---|
| Access control | Role checks on all functions | Foundry |
| Deposit/withdraw | Balance accounting, edge cases | Foundry |
| Strategy deployment | Capital tracking, exposure limits | Foundry |
| Risk validation | Threshold checks, circuit breakers | Foundry |
| Tick calculation | Spread math, width adjustment | Foundry |
| Lending math | Interest calculation, maturity | Foundry |
| Oracle freshness | Staleness rejection | Foundry |

## 11.2 Property-Based Tests (Foundry Fuzz)

```
Property 1: For any sequence of deposits and withdrawals,
            tokenBalances[token] == sum(deposits) - sum(withdrawals) - sum(mgmtFees)

Property 2: deployedCapital[token] <= tokenBalances[token] for all tokens

Property 3: pairExposure[pair] <= tokenBalances[token] * maxExposurePerPairBps / 10000

Property 4: After emergencyUnwind, activeOrderIds[pair].length == 0
            AND strategy token balances == 0

Property 5: For any lending position, calculateInterest is monotonically
            increasing with principal, rate, and term

Property 6: For any vault and token, sum(pairExposure[pair]) <= deployedCapital[token]

Property 7: For any vault and token,
            IERC20(token).balanceOf(vault) >= tokenBalances[token] - deployedCapital[token]
                + accruedPerformanceFees[token] + accruedManagementFees[token]

Property 8: For any pairId, submitting an oracle signal with nonce <= oracleNonces[pairId]
            must revert with OracleNonceReplay

Property 9: For any pairId, submitting an oracle signal with timestamp <= oracleLastTimestamp[pairId]
            must revert with OracleTimestampNotMonotonic

Property 10: DexStrategy.deployLiquidity reverts for any pair where
             pairHasActiveDeployment[pairId] == false
```

## 11.3 Invariant Tests

```
Invariant 1: Protocol solvency -- sum of all token balances across vaults ==
             sum of all ERC20 balances held by vault contracts

Invariant 2: No vault utilization exceeds (10000 - minReserveBps) bps

Invariant 3: No tick in any active order exceeds maxTickDeviation

Invariant 4: Global pause halts all state-changing operations

Invariant 5: For every vault and token, sum of all pairExposure entries for pairs
             using that token never exceeds deployedCapital[token]

Invariant 6: For every pairId, oracleNonces[pairId] is strictly monotonically increasing
             across all accepted oracle updates

Invariant 7: For every vault, ERC20 balance >= internal accounting minimum
             (tokenBalances - deployedCapital + accrued fees)

Invariant 8: LendingModule.principalPool[token] >= totalActiveLending[token] at all times
```

## 11.4 Adversarial Tests

- Attempt withdrawal exceeding available balance
- Attempt strategy deployment to unapproved contract
- Attempt oracle update from unauthorized address
- Attempt oracle update with forged ECDSA signature
- Attempt oracle signal replay with same or lower nonce
- Attempt to call recallFromStrategy from non-strategy address
- Reentrancy attempt on deposit/withdraw
- Sandwich attack simulation on order placement
- Flash loan to manipulate vault utilization ratio
- Flash loan + deposit + deploy + withdraw in same transaction
- Strategy attempts deployLiquidity for pair without active deployment
- Lending: attempt to borrow without sufficient collateral
- Lending: attempt to withdraw more than available after active loans
- Strategy recall with under-reported amount (loss tracking verification)

## 11.5 Simulation Tests

**Peg Deviation Simulation:**

- Simulate progressive depeg from 0 to 200 ticks over 100 blocks
- Verify circuit breaker triggers at configured threshold
- Verify spread widening follows the formula
- Verify emergency unwind completes within gas limits

**Liquidity Stress:**

- Simulate all bid-side orders filling simultaneously
- Verify imbalance detection and halt
- Simulate 50% of vault withdrawal during active deployment
- Verify solvency invariant holds

## 11.6 Test Configuration

```toml
# foundry.toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200
via-ir = true
fuzz = { runs = 10000, seed = "0x42" }
invariant = { runs = 256, depth = 128, fail_on_revert = true }

[profile.default.rpc_endpoints]
tempo_testnet = "${TEMPO_TESTNET_RPC_URL}"
```

**Coverage goal:** 95% line coverage, 90% branch coverage.

---

# 12. DEPLOYMENT PLAN

## 12.1 Testnet Deployment Steps

1. Deploy `GovernanceRoles` with deployer as initial admin
2. Deploy `RiskController` with default risk params
3. Deploy `ReportingAdapter`
4. Deploy `TreasuryVault` factory (creates vault instances)
5. Deploy `DexStrategy` linked to vault and DEX addresses
6. Deploy `LendingModule` with GovernanceRoles and collateral token addresses
7. Configure roles: assign TREASURY_MANAGER, RISK_OFFICER, STRATEGIST, ORACLE to appropriate addresses
8. Whitelist test stablecoins (pathUSD, test USDC)
9. Approve DexStrategy and LendingModule as allowed strategies in vault
10. Set lending term rates
11. Approve TreasuryVault in LendingModule via `setApprovedVault()`
12. Approve test borrower addresses in LendingModule
13. Set fee configuration on TreasuryVault via `setFeeConfig()`
14. Run smoke tests: deposit, deploy, acceptDeployment, place orders, withdraw

## 12.2 Environment Variables

```
TEMPO_TESTNET_RPC_URL=
DEPLOYER_PRIVATE_KEY=
ADMIN_ADDRESS=
TREASURY_MANAGER_ADDRESS=
RISK_OFFICER_ADDRESS=
ORACLE_SIGNER_ADDRESS=
TEMPO_DEX_ADDRESS=
PATHUSD_ADDRESS=
TEST_USDC_ADDRESS=
FEE_TREASURY_ADDRESS=
COLLATERAL_TOKEN_ADDRESS=
PERFORMANCE_FEE_BPS=1000
MANAGEMENT_FEE_BPS=50
```

## 12.3 Contract Verification

Verify all contracts on Tempo block explorer using `forge verify-contract`.

## 12.4 Multi-sig Setup

Production deployment: 3-of-5 multi-sig for ADMIN_ROLE using Gnosis Safe (or equivalent on Tempo).

Signers: 2 core team + 2 advisors + 1 institutional partner.

## 12.5 Upgrade Plan

Contracts are non-upgradeable by default. Upgrades require:

1. Deploy new contract version
2. Migrate state via read-from-old/write-to-new pattern
3. Update references in dependent contracts via admin function
4. Deprecate old contracts

No proxy pattern used to reduce attack surface.

## 12.6 Rollback Plan

1. Trigger global pause
2. Emergency unwind all active strategies
3. Withdraw all capital back to vault
4. Point frontend and API to previous contract addresses
5. Communicate status via incident page

---

# 13. SECURITY ANALYSIS

## 13.1 Attack Vectors

| Vector | Risk | Mitigation |
|---|---|---|
| Reentrancy | Medium | ReentrancyGuard on all external state-changing functions |
| Oracle manipulation | High | EIP-712 signature verification; nonce + timestamp monotonicity; staleness checks; circuit breakers |
| Oracle signal replay | High | Per-pair monotonic nonce; timestamp ordering; ECDSA verification |
| Flash loan balance manipulation | Medium | Snapshot-based balance checks; minimum order size |
| Governance key compromise | Critical | Multi-sig; timelocked parameter changes |
| MEV sandwich on order placement | Medium | Tick spreading; order size limits; spread sanity check; batch placement |
| DEX orderbook manipulation | Medium | Minimum order size ($100); tick boundary limits; depth threshold check |
| Griefing via dust deposits | Low | Minimum deposit threshold |
| Front-running strategy adjustments | Medium | Commit-reveal for large adjustments; private mempools |
| Capital linkage bypass | High | Mandatory acceptDeployment binding; pair must have active deployment for order placement |
| Strategy recall manipulation | Medium | Loss explicitly tracked; vault reads declared amount with accounting verification |
| Lending pool insolvency | Critical | Borrower-funded interest; 120% collateral; separated principal/interest pools; liquidation |
| Fee reserve drainage | Medium | Available balance subtracts accrued fees; balance consistency assertion on withdrawal |

## 13.2 Economic Exploits

- **Peg manipulation profit extraction:** Attacker depegs token, fills vault orders at discount, restores peg. Mitigation: circuit breaker halts at 200-tick deviation; max order size limits exposure.
- **Interest rate arbitrage on lending:** Borrowing externally at lower rate, lending in TempoVault. Not a protocol risk -- this is expected market behavior.
- **Vault drainage via rapid deploy/recall:** Rate-limited by transaction throughput; recall requires strategy contract authorization.

## 13.3 MEV Considerations

- Order placement transactions reveal tick targets in the mempool
- Mitigations: use private RPCs where available; split large orders across multiple transactions; randomize placement timing within a block range

---

# 14. GAS OPTIMIZATION STRATEGY

## 14.1 Storage Packing

```solidity
// RiskController: Pack into single slot
// maxExposurePerPairBps (uint16) + maxTickDeviation (int24) + maxImbalanceBps (uint16) +
// minReserveBps (uint16) + oracleStalenessThreshold (uint32) + paused (bool) +
// maxSpreadSanityTicks (int24)
// = 2 + 3 + 2 + 2 + 4 + 1 + 3 = 17 bytes < 32 bytes (one slot)
```

## 14.2 Minimal Writes

- ReportingAdapter uses events only (no storage writes)
- Oracle signals use single mapping write per update
- Order tracking uses append-only pattern; cleanup via delete on unwind

## 14.3 Loop Boundaries

- `MAX_ORDERS_PER_PAIR = 20` prevents unbounded loops in cancel-all operations
- Maximum gas for full unwind of one pair: ~20 * cancelOrder gas (~500k estimated)

## 14.4 Event Design

All events use indexed fields for efficient filtering. Non-indexed fields carry full context to minimize view calls by offchain services.

---

# 15. POST-HACK PRODUCTION HARDENING ROADMAP

## Phase 1: Security (Weeks 1-4)

- Commission audit from Trail of Bits, OpenZeppelin, or Spearbit
- Formal verification of core invariants (Certora or Halmos)
- Bug bounty program via Immunefi ($50k-$250k based on severity)
- Penetration testing of offchain services

## Phase 2: Monitoring (Weeks 2-6)

- Onchain telemetry via Tenderly or Forta agents
- Real-time alerting for circuit breaker triggers, exposure threshold breaches, oracle staleness
- Automated daily compliance snapshot emission
- Dashboard uptime monitoring (PagerDuty/Opsgenie)

## Phase 3: Feature Expansion (Weeks 4-12)

- Multi-stablecoin support (USDT, EURC)
- Automated peg defense vault (autonomous deployment during depeg)
- Secondary market for lending positions (ERC-721 tokenized positions)
- Institutional API with dedicated rate limits and SLA

## Phase 4: Ecosystem Integration (Weeks 8-20)

- Custodian integrations (Fireblocks, Copper, Anchorage)
- Fiat ramp integration (Mercury, Bridge)
- Embedded wallet support (Privy)
- Cross-chain settlement routing via intent-based bridges

## Phase 5: Governance Decentralization (Weeks 12-24)

- Transition ADMIN_ROLE to onchain governance (Governor + Timelock)
- Community-elected risk committee for RISK_OFFICER_ROLE
- Protocol revenue sharing with governance token stakers

---

# APPENDIX A: HACKATHON MVP SCOPE

For a 48-hour hackathon, implement:

1. **GovernanceRoles.sol** -- Full implementation
2. **RiskController.sol** -- Simplified: static thresholds, no oracle integration
3. **TreasuryVault.sol** -- Single vault, single token (pathUSD)
4. **DexStrategy.sol** -- Single pair (USDC/pathUSD), flip orders, 3 bid + 3 ask levels
5. **Dashboard** -- React frontend showing vault balance, active orders, P&L, tick chart

Skip for MVP:

- LendingModule
- ReportingAdapter
- Offchain risk engine
- Multi-vault factory

---

# APPENDIX B: CONTRACT DEPLOYMENT ADDRESSES (TESTNET)

To be populated after deployment.

| Contract | Address | Verified |
|---|---|---|
| GovernanceRoles | TBD | |
| RiskController | TBD | |
| TreasuryVault | TBD | |
| DexStrategy | TBD | |
| LendingModule | TBD | |
| ReportingAdapter | TBD | |

---

**End of Specification.**

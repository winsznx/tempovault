// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GovernanceRoles.sol";
import "./RiskController.sol";
import "./TreasuryVault.sol";
import "./interfaces/ITempoOrderbook.sol";

/// @title DexStrategy
/// @notice Automated market making and liquidity provisioning on Tempo DEX
/// @dev Updated for Tempo protocol: uses place/placeFlip, internal balances, int16 ticks
contract DexStrategy is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------

    uint256 public constant MIN_ORDER_SIZE = 100e18;
    uint16 public constant MAX_ORDERS_PER_PAIR = 20;

    /// @notice Tempo DEX tick constraints
    int16 public constant TEMPO_MIN_TICK = -2000;
    int16 public constant TEMPO_MAX_TICK = 2000;
    int16 public constant TEMPO_TICK_SPACING = 10;

    /// @notice Maximum safe uint128 value for conversions
    uint128 public constant MAX_UINT128 = type(uint128).max;

    // ---------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------

    GovernanceRoles public immutable governance;
    RiskController public immutable riskController;
    ITempoOrderbook public immutable dex;
    TreasuryVault public vault;

    mapping(bytes32 => StrategyConfig) public pairConfigs;
    mapping(bytes32 => uint128[]) public activeOrderIds;  // Changed to uint128[]
    mapping(uint128 => OrderRecord) public orderRecords;  // Changed to uint128 key
    mapping(bytes32 => uint256) public cumulativeSpreadCaptured;
    mapping(bytes32 => uint256) public cumulativeVolume;
    mapping(address => uint256) public inventory;
    mapping(bytes32 => uint256) public bidExposure;
    mapping(bytes32 => uint256) public askExposure;
    mapping(bytes32 => uint256) public activeDeploymentForPair;
    mapping(bytes32 => bool) public pairHasActiveDeployment;
    mapping(uint256 => uint256) public deploymentPrincipal;

    /// @notice Track flip order metadata for monitoring
    mapping(uint128 => FlipOrderData) public flipOrders;

    // ---------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------

    struct StrategyConfig {
        address tokenA;
        address tokenB;
        int16 baseTickWidth;  // Changed to int16
        uint256 orderSizePerTick;
        uint16 numBidLevels;
        uint16 numAskLevels;
        bool useFlipOrders;
        bool active;
    }

    struct OrderRecord {
        bytes32 pairId;
        int16 tick;  // Changed to int16
        uint256 amount;
        bool isBid;
        bool isFlip;
        uint256 placedAt;
    }

    /// @notice Flip order metadata structure
    struct FlipOrderData {
        address token;
        uint128 amount;
        bool isBid;
        int16 originalTick;
        int16 flipTick;
        uint256 createdAt;
        bool isActive;
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
    error AmountExceedsUint128(uint256 amount);
    error TickOutOfBounds(int16 tick);
    error TickNotMultipleOfSpacing(int16 tick);
    error InvalidFlipTick(int16 tick, int16 flipTick, bool isBid);

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    event StrategyConfigured(
        bytes32 indexed pairId,
        StrategyConfig config
    );

    event OrderPlaced(
        bytes32 indexed pairId,
        uint128 indexed orderId,  // Changed to uint128
        int16 tick,  // Changed to int16
        uint128 amount,  // Changed to uint128
        bool isBid,
        bool isFlip
    );

    event OrderCancelled(
        bytes32 indexed pairId,
        uint128 indexed orderId,  // Changed to uint128
        uint128 refundedAmount  // Changed to uint128
    );

    event SpreadCaptured(
        bytes32 indexed pairId,
        uint256 amount,
        uint256 cumulativeTotal
    );

    event EmergencyUnwind(
        bytes32 indexed pairId,
        uint256 ordersUnwound,
        uint128 baseReturned,  // Changed to uint128
        uint128 quoteReturned  // Changed to uint128
    );

    event DeploymentAccepted(
        bytes32 indexed pairId,
        uint256 indexed deploymentId,
        uint256 principal
    );

    event PositionsAdjusted(
        bytes32 indexed pairId,
        int16 newTickWidth,  // Changed to int16
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

    // ============================================
    // INTERNAL BALANCE MANAGEMENT
    // ============================================

    /// @notice Ensure sufficient DEX internal balance for order placement
    /// @param token Token to check/deposit
    /// @param amount Amount needed
    function _ensureDexBalance(address token, uint128 amount) internal {
        uint128 currentBalance = dex.balanceOf(address(this), token);

        if (currentBalance < amount) {
            uint128 shortfall = amount - currentBalance;
            IERC20(token).approve(address(dex), shortfall);
        }
    }

    /// @notice Withdraw all proceeds from DEX internal balance
    /// @param token Token to withdraw
    /// @return amount Amount withdrawn
    function _withdrawAllFromDex(address token) internal returns (uint128 amount) {
        amount = dex.balanceOf(address(this), token);

        if (amount > 0) {
            dex.withdraw(token, amount);
        }
    }

    /// @notice Withdraw specific amount from DEX internal balance
    /// @param token Token to withdraw
    /// @param amount Amount to withdraw
    function _withdrawFromDex(address token, uint128 amount) internal {
        require(amount > 0, "Zero amount");

        uint128 balance = dex.balanceOf(address(this), token);
        require(balance >= amount, "Insufficient DEX balance");

        dex.withdraw(token, amount);
    }

    /// @notice Get current DEX internal balance
    /// @param token Token to query
    /// @return balance Current balance in DEX
    function getDexBalance(address token) public view returns (uint128 balance) {
        return dex.balanceOf(address(this), token);
    }

    // ============================================
    // TICK VALIDATION
    // ============================================

    /// @notice Validate tick meets Tempo DEX constraints
    /// @param tick Tick to validate
    function _validateTick(int16 tick) internal pure {
        if (tick < TEMPO_MIN_TICK || tick > TEMPO_MAX_TICK) {
            revert TickOutOfBounds(tick);
        }
        if (tick % TEMPO_TICK_SPACING != 0) {
            revert TickNotMultipleOfSpacing(tick);
        }
    }

    /// @notice Validate flip tick constraints
    /// @param tick Original tick
    /// @param flipTick Flip tick
    /// @param isBid Order direction
    function _validateFlipTick(int16 tick, int16 flipTick, bool isBid) internal pure {
        _validateTick(flipTick);

        if (isBid) {
            if (flipTick <= tick) revert InvalidFlipTick(tick, flipTick, isBid);
        } else {
            if (flipTick >= tick) revert InvalidFlipTick(tick, flipTick, isBid);
        }
    }

    /// @notice Convert uint256 amount to uint128 safely
    /// @param amount Amount to convert
    /// @return amount128 Converted amount
    function _toUint128(uint256 amount) internal pure returns (uint128 amount128) {
        if (amount > MAX_UINT128) revert AmountExceedsUint128(amount);
        amount128 = uint128(amount);
    }

    // ---------------------------------------------------------------
    // Liquidity Placement - REWRITTEN FOR TEMPO
    // ---------------------------------------------------------------

    /// @notice Deploy liquidity to Tempo DEX orderbook
    /// @param pairId Pair identifier
    function deployLiquidity(bytes32 pairId)
        external
        nonReentrant
        whenNotPaused
        whenStrategyActive(pairId)
        onlyRole(governance.STRATEGIST_ROLE())
    {
        if (!pairHasActiveDeployment[pairId]) revert PairNotLinkedToDeployment(pairId);

        StrategyConfig storage config = pairConfigs[pairId];
        require(activeOrderIds[pairId].length == 0, "Orders already active");

        // Get fresh oracle signal for reference tick
        int16 refTick = riskController.getReferenceTick(pairId);

        // Calculate ticks from reference
        int16 bidTick = refTick - config.baseTickWidth;
        int16 askTick = refTick + config.baseTickWidth;

        // Validate ticks
        _validateTick(bidTick);
        _validateTick(askTick);

        // Determine base and quote tokens
        address base = config.tokenA;
        address quote = config.tokenB;

        // Convert amounts to uint128
        uint128 orderSize = _toUint128(config.orderSizePerTick);

        // Place bid orders (buy base with quote)
        for (uint16 i = 0; i < config.numBidLevels; i++) {
            if (activeOrderIds[pairId].length >= MAX_ORDERS_PER_PAIR) {
                revert TooManyOrders(pairId, MAX_ORDERS_PER_PAIR);
            }

            int16 tick = bidTick - int16(i) * config.baseTickWidth;
            _validateTick(tick);

            // Ensure DEX has balance (bids need quote token)
            _ensureDexBalance(quote, orderSize);

            uint128 orderId;
            if (config.useFlipOrders) {
                // Calculate flip tick (bid flips to ask)
                int16 flipTick = askTick + int16(i) * config.baseTickWidth;
                _validateFlipTick(tick, flipTick, true);

                orderId = dex.placeFlip(base, orderSize, true, tick, flipTick);

                // Track flip order metadata
                flipOrders[orderId] = FlipOrderData({
                    token: base,
                    amount: orderSize,
                    isBid: true,
                    originalTick: tick,
                    flipTick: flipTick,
                    createdAt: block.timestamp,
                    isActive: true
                });
            } else {
                orderId = dex.place(base, orderSize, true, tick);
            }

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

            emit OrderPlaced(pairId, orderId, tick, orderSize, true, config.useFlipOrders);
        }

        // Place ask orders (sell base for quote)
        for (uint16 i = 0; i < config.numAskLevels; i++) {
            if (activeOrderIds[pairId].length >= MAX_ORDERS_PER_PAIR) {
                revert TooManyOrders(pairId, MAX_ORDERS_PER_PAIR);
            }

            int16 tick = askTick + int16(i) * config.baseTickWidth;
            _validateTick(tick);

            // Ensure DEX has balance (asks need base token)
            _ensureDexBalance(base, orderSize);

            uint128 orderId;
            if (config.useFlipOrders) {
                // Calculate flip tick (ask flips to bid)
                int16 flipTick = bidTick - int16(i) * config.baseTickWidth;
                _validateFlipTick(tick, flipTick, false);

                orderId = dex.placeFlip(base, orderSize, false, tick, flipTick);

                // Track flip order metadata
                flipOrders[orderId] = FlipOrderData({
                    token: base,
                    amount: orderSize,
                    isBid: false,
                    originalTick: tick,
                    flipTick: flipTick,
                    createdAt: block.timestamp,
                    isActive: true
                });
            } else {
                orderId = dex.place(base, orderSize, false, tick);
            }

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

            emit OrderPlaced(pairId, orderId, tick, orderSize, false, config.useFlipOrders);
        }
    }

    // ---------------------------------------------------------------
    // Position Adjustment
    // ---------------------------------------------------------------

    function adjustPositions(bytes32 pairId)
        external
        nonReentrant
        whenNotPaused
        whenStrategyActive(pairId)
        onlyRole(governance.STRATEGIST_ROLE())
    {
        _cancelAllOrders(pairId);

        uint256 recommended = riskController.recommendedTickWidth(pairId, uint256(uint16(pairConfigs[pairId].baseTickWidth)));
        int16 newTickWidth = int16(uint16(recommended));  // Safe conversion: uint256 -> uint16 -> int16

        emit PositionsAdjusted(pairId, newTickWidth, block.timestamp);
    }

    // ---------------------------------------------------------------
    // Emergency Unwind - REWRITTEN FOR TEMPO
    // ---------------------------------------------------------------

    /// @notice Emergency unwind - cancel all orders and return capital
    /// @param pairId Pair to unwind
    function emergencyUnwind(bytes32 pairId)
        external
        nonReentrant
        onlyRole(governance.EMERGENCY_ROLE())
    {
        uint128[] storage orders = activeOrderIds[pairId];
        require(orders.length > 0, "No active orders");

        StrategyConfig storage config = pairConfigs[pairId];
        address base = config.tokenA;
        address quote = config.tokenB;

        // Query DEX balances before cancellation
        uint128 baseBalanceBefore = dex.balanceOf(address(this), base);
        uint128 quoteBalanceBefore = dex.balanceOf(address(this), quote);

        // Cancel all orders
        for (uint256 i = 0; i < orders.length; i++) {
            uint128 orderId = orders[i];

            // Cancel order (void return - refund goes to internal balance)
            dex.cancel(orderId);

            // Mark flip order as inactive if it was one
            if (flipOrders[orderId].isActive) {
                flipOrders[orderId].isActive = false;
            }
        }

        // Query DEX balances after cancellation
        uint128 baseBalanceAfter = dex.balanceOf(address(this), base);
        uint128 quoteBalanceAfter = dex.balanceOf(address(this), quote);

        // Withdraw all balances from DEX to strategy contract
        if (baseBalanceAfter > 0) {
            dex.withdraw(base, baseBalanceAfter);
        }
        if (quoteBalanceAfter > 0) {
            dex.withdraw(quote, quoteBalanceAfter);
        }

        // Transfer back to TreasuryVault
        if (baseBalanceAfter > 0) {
            IERC20(base).safeIncreaseAllowance(address(vault), baseBalanceAfter);
            vault.receiveEmergencyReturn(pairId, base, baseBalanceAfter);
        }
        if (quoteBalanceAfter > 0) {
            IERC20(quote).safeIncreaseAllowance(address(vault), quoteBalanceAfter);
            vault.receiveEmergencyReturn(pairId, quote, quoteBalanceAfter);
        }

        // Clear active orders
        delete activeOrderIds[pairId];
        pairHasActiveDeployment[pairId] = false;
        pairConfigs[pairId].active = false;

        // Clear exposure tracking
        bidExposure[pairId] = 0;
        askExposure[pairId] = 0;

        uint256 depId = activeDeploymentForPair[pairId];
        delete deploymentPrincipal[depId];
        delete activeDeploymentForPair[pairId];

        emit EmergencyUnwind(pairId, orders.length, baseBalanceAfter, quoteBalanceAfter);
    }

    // ============================================
    // FLIP ORDER MONITORING
    // ============================================

    /// @notice Check if flip order may have silently failed
    /// @dev Flip orders can fail without reverting if:
    ///      1. Insufficient DEX balance after fill
    ///      2. Lost TIP-403 authorization
    /// @param orderId Flip order ID to check
    /// @return mayHaveFailed True if flip may have failed
    /// @return reason Failure reason if detected
    function checkFlipOrderHealth(uint128 orderId)
        external
        view
        returns (bool mayHaveFailed, string memory reason)
    {
        FlipOrderData memory flipOrder = flipOrders[orderId];

        if (!flipOrder.isActive) {
            return (false, "");
        }

        // Check if we have sufficient balance for flip
        uint128 dexBalance = dex.balanceOf(address(this), flipOrder.token);

        if (dexBalance < flipOrder.amount) {
            return (true, "Insufficient DEX balance for flip");
        }

        // Check if order is very old (may have filled but not flipped)
        if (block.timestamp - flipOrder.createdAt > 1 days) {
            return (true, "Order age exceeds 1 day - may have filled without flip");
        }

        return (false, "");
    }

    /// @notice Get all active flip orders for monitoring
    /// @return orderIds Array of active flip order IDs
    function getActiveFlipOrders() external view returns (uint128[] memory orderIds) {
        // Count active flip orders
        uint256 count = 0;
        uint128 maxOrderId = dex.nextOrderId();

        for (uint128 i = 1; i < maxOrderId; i++) {
            if (flipOrders[i].isActive) {
                count++;
            }
        }

        // Collect active flip order IDs
        orderIds = new uint128[](count);
        uint256 idx = 0;
        for (uint128 i = 1; i < maxOrderId; i++) {
            if (flipOrders[i].isActive) {
                orderIds[idx] = i;
                idx++;
            }
        }
    }

    // ---------------------------------------------------------------
    // Internal Helpers
    // ---------------------------------------------------------------

    function _cancelAllOrders(bytes32 pairId) internal returns (uint128 totalRefunded) {
        uint128[] storage orderIds = activeOrderIds[pairId];
        StrategyConfig storage config = pairConfigs[pairId];

        // Get balances before cancel
        uint128 baseBalanceBefore = dex.balanceOf(address(this), config.tokenA);
        uint128 quoteBalanceBefore = dex.balanceOf(address(this), config.tokenB);

        for (uint256 i = 0; i < orderIds.length; i++) {
            uint128 orderId = orderIds[i];
            dex.cancel(orderId);

            if (flipOrders[orderId].isActive) {
                flipOrders[orderId].isActive = false;
            }
        }

        // Get balances after cancel
        uint128 baseBalanceAfter = dex.balanceOf(address(this), config.tokenA);
        uint128 quoteBalanceAfter = dex.balanceOf(address(this), config.tokenB);

        // Calculate total refunded
        totalRefunded = (baseBalanceAfter - baseBalanceBefore) + (quoteBalanceAfter - quoteBalanceBefore);

        delete activeOrderIds[pairId];
        bidExposure[pairId] = 0;
        askExposure[pairId] = 0;
    }

    // ---------------------------------------------------------------
    // Yield Tracking
    // ---------------------------------------------------------------

    function recordSpreadCapture(bytes32 pairId, uint256 amount)
        external
        onlyRole(governance.STRATEGIST_ROLE())
    {
        cumulativeSpreadCaptured[pairId] += amount;
        cumulativeVolume[pairId] += amount;
        emit SpreadCaptured(pairId, amount, cumulativeSpreadCaptured[pairId]);
    }
}

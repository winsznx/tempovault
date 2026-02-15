// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITempoOrderbook
 * @notice Interface for Tempo Stablecoin DEX (predeployed at 0xdec0000000000000000000000000000000000000)
 * @dev This is the VERIFIED interface matching Tempo protocol specification
 * Source: https://docs.tempo.xyz/protocol/exchange/spec
 *
 * CRITICAL NOTES:
 * - Uses uint128 for amounts and order IDs (NOT uint256)
 * - Uses int16 for ticks (NOT int24)
 * - Single token + isBid direction (NOT tokenIn/tokenOut)
 * - Flip orders use separate placeFlip() function
 * - Internal balance system: balanceOf() and withdraw() required
 * - cancel() returns void (NOT refunded amount)
 */
interface ITempoOrderbook {
    // ============================================
    // CONSTANTS
    // ============================================

    /// @notice Price scaling factor: tick = (price - 1) × PRICE_SCALE
    function PRICE_SCALE() external view returns (uint32);

    /// @notice Tick spacing requirement (must be divisible by this)
    function TICK_SPACING() external view returns (int16);

    /// @notice Minimum allowed tick (-2000 = 0.98)
    function MIN_TICK() external view returns (int16);

    /// @notice Maximum allowed tick (+2000 = 1.02)
    function MAX_TICK() external view returns (int16);

    /// @notice Minimum price (corresponds to MIN_TICK)
    function MIN_PRICE() external view returns (uint32);

    /// @notice Maximum price (corresponds to MAX_TICK)
    function MAX_PRICE() external view returns (uint32);

    // ============================================
    // PRICING HELPERS
    // ============================================

    /// @notice Convert tick to price
    /// @param tick Tick value (int16, range ±2000)
    /// @return price Price as uint32 (scaled by PRICE_SCALE)
    function tickToPrice(int16 tick) external pure returns (uint32 price);

    /// @notice Convert price to tick
    /// @param price Price as uint32 (scaled by PRICE_SCALE)
    /// @return tick Tick value (int16)
    function priceToTick(uint32 price) external pure returns (int16 tick);

    // ============================================
    // PAIR MANAGEMENT
    // ============================================

    /// @notice Compute deterministic pair key from two tokens
    /// @param tokenA First token address
    /// @param tokenB Second token address
    /// @return key Bytes32 pair identifier (order-independent)
    function pairKey(address tokenA, address tokenB) external pure returns (bytes32 key);

    /// @notice Create new trading pair (if doesn't exist)
    /// @param base Base token address (must have quoteToken() via TIP-20)
    /// @return key Pair identifier
    function createPair(address base) external returns (bytes32 key);

    /// @notice Get pair orderbook state
    /// @param key Pair identifier from pairKey()
    /// @return base Base token address
    /// @return quote Quote token address
    /// @return bestBidTick Best bid price level (int16)
    /// @return bestAskTick Best ask price level (int16)
    function books(bytes32 key)
        external
        view
        returns (address base, address quote, int16 bestBidTick, int16 bestAskTick);

    /// @notice Get liquidity at specific tick level
    /// @param base Base token address
    /// @param tick Price level to query
    /// @param isBid True for bid side, false for ask side
    /// @return head First order ID in queue
    /// @return tail Last order ID in queue
    /// @return totalLiquidity Total amount available at this tick
    function getTickLevel(address base, int16 tick, bool isBid)
        external
        view
        returns (uint128 head, uint128 tail, uint128 totalLiquidity);

    // ============================================
    // INTERNAL BALANCE SYSTEM
    // ============================================

    /// @notice Query user's internal DEX balance for a token
    /// @dev Balances are held on DEX for gas efficiency
    /// @param user User address
    /// @param token Token address
    /// @return balance Amount held in internal balance (uint128)
    function balanceOf(address user, address token) external view returns (uint128 balance);

    /// @notice Withdraw tokens from internal DEX balance to wallet
    /// @dev Transfers from DEX internal balance to msg.sender
    /// @param token Token to withdraw
    /// @param amount Amount to withdraw (uint128)
    function withdraw(address token, uint128 amount) external;

    // ============================================
    // ORDER PLACEMENT & LIFECYCLE
    // ============================================

    /// @notice Place limit order on the orderbook
    /// @dev Debits from internal balance (or transfers shortfall from wallet)
    /// @param token Token to trade (base token for the pair)
    /// @param amount Amount to trade (uint128)
    /// @param isBid True = bid (buy base with quote), False = ask (sell base for quote)
    /// @param tick Price level (int16, range ±2000, divisible by 10)
    /// @return orderId Unique order identifier (uint128)
    function place(address token, uint128 amount, bool isBid, int16 tick)
        external
        returns (uint128 orderId);

    /// @notice Place flip order (auto-flips to opposite side on complete fill)
    /// @dev Same as place() but flips to flipTick when 100% filled
    /// @param token Token to trade
    /// @param amount Amount to trade
    /// @param isBid Direction of initial order
    /// @param tick Initial price level
    /// @param flipTick Price to flip to (must satisfy: bid ? flipTick > tick : flipTick < tick)
    /// @return orderId Unique order identifier
    function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick)
        external
        returns (uint128 orderId);

    /// @notice Cancel active order
    /// @dev Refunds remaining amount to internal balance (NO return value)
    /// @dev Only order maker can cancel
    /// @param orderId Order to cancel
    function cancel(uint128 orderId) external;

    /// @notice Cancel stale order (anyone can call if maker lost authorization)
    /// @dev Callable by anyone if maker is forbidden by TIP-403 transfer policy
    /// @param orderId Order to cancel
    function cancelStaleOrder(uint128 orderId) external;

    /// @notice Get next order ID that will be assigned
    /// @return nextId Next order ID (uint128)
    function nextOrderId() external view returns (uint128 nextId);

    // ============================================
    // SWAPS & QUOTING
    // ============================================

    /// @notice Quote swap output for exact input
    /// @param tokenIn Input token
    /// @param tokenOut Output token
    /// @param amountIn Input amount (uint128)
    /// @return amountOut Expected output amount (uint128)
    function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn)
        external
        view
        returns (uint128 amountOut);

    /// @notice Quote swap input for exact output
    /// @param tokenIn Input token
    /// @param tokenOut Output token
    /// @param amountOut Desired output amount
    /// @return amountIn Required input amount
    function quoteSwapExactAmountOut(address tokenIn, address tokenOut, uint128 amountOut)
        external
        view
        returns (uint128 amountIn);

    /// @notice Execute swap with exact input amount
    /// @param tokenIn Input token
    /// @param tokenOut Output token
    /// @param amountIn Exact input amount
    /// @param minAmountOut Minimum output (slippage protection)
    /// @return amountOut Actual output amount
    function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut)
        external
        returns (uint128 amountOut);

    /// @notice Execute swap with exact output amount
    /// @param tokenIn Input token
    /// @param tokenOut Output token
    /// @param amountOut Exact output amount desired
    /// @param maxAmountIn Maximum input (slippage protection)
    /// @return amountIn Actual input amount consumed
    function swapExactAmountOut(address tokenIn, address tokenOut, uint128 amountOut, uint128 maxAmountIn)
        external
        returns (uint128 amountIn);

    // ============================================
    // EVENTS
    // ============================================

    /// @notice Emitted when new pair is created
    event PairCreated(bytes32 indexed key, address indexed base, address indexed quote);

    /// @notice Emitted when order is placed
    event OrderPlaced(
        uint128 indexed orderId,
        address indexed maker,
        address indexed token,
        uint128 amount,
        bool isBid,
        int16 tick,
        bool isFlipOrder,
        int16 flipTick
    );

    /// @notice Emitted when order is cancelled
    event OrderCancelled(uint128 indexed orderId);

    /// @notice Emitted when order is filled (fully or partially)
    event OrderFilled(
        uint128 indexed orderId,
        address indexed maker,
        address indexed taker,
        uint128 amountFilled,
        bool partialFill
    );
}

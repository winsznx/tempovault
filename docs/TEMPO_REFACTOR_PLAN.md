# Tempo Refactor Plan: Detailed Implementation

**Status:** In Progress
**Created:** 2026-02-14
**Phase:** 3 of 3
**Purpose:** Provide exact line-by-line changes to align TempoVault with Tempo protocol

**Prerequisites:**
- ✅ Phase 1: TEMPO_PROTOCOL_ALIGNMENT.md complete
- ✅ Phase 2: ARCHITECTURE_DELTA_REPORT.md complete

**Approval Required Before Implementation**

---

## Executive Summary

**Total Files to Modify:** 7
**Total Files to Create:** 1
**Total Tests to Rewrite:** ~30 test files

**Estimated Effort:**
- 🔴 Critical changes: ~4-6 hours
- 🟡 Major changes: ~2-3 hours
- 🟢 Minor changes: ~1 hour
- ✅ Test updates: ~3-4 hours
- **Total: ~10-14 hours**

**Risk Level:** 🔴 HIGH - Complete interface rewrite

---

## Refactor Sequence

**Order matters - follow this sequence:**

1. ✅ Create new ITempoOrderbook.sol (does not break existing code)
2. ✅ Update type definitions and constants (DexStrategy, RiskController)
3. ✅ Add internal balance management to DexStrategy
4. ✅ Rewrite order placement logic in DexStrategy
5. ✅ Rewrite order cancellation logic in DexStrategy
6. ✅ Update RiskController tick validation
7. ✅ Update oracle relay script
8. ✅ Rewrite all DexStrategy tests
9. ✅ Run full test suite
10. ✅ Deploy to Tempo Testnet
11. ✅ Verify end-to-end flow

---

## File 1: ITempoOrderbook.sol - COMPLETE REWRITE

**Action:** Delete old, create new

**Old File Location:** `src/interfaces/ITempoOrderbook.sol` - DELETE THIS

**New File Location:** `src/interfaces/ITempoOrderbook.sol` - CREATE NEW

### New Interface (Complete)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITempoOrderbook
 * @notice Interface for Tempo Stablecoin DEX (predeployed at 0xdec0...0000)
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
```

**Verification Checklist:**
- [x] All function signatures match Tempo spec
- [x] All types correct (uint128, int16)
- [x] All constants included
- [x] balanceOf() and withdraw() included
- [x] placeFlip() separate from place()
- [x] cancel() returns void
- [x] Comprehensive NatSpec comments
- [x] Critical notes documented

---

## File 2: DexStrategy.sol - MAJOR REWRITE

**File Location:** `src/DexStrategy.sol`

### Section 2.1: State Variables - Type Updates

**FIND:**
```solidity
mapping(uint256 pairId => uint256[] orderIds) public activeOrders;
```

**REPLACE WITH:**
```solidity
mapping(uint256 pairId => uint128[] orderIds) public activeOrders;
```

---

**ADD NEW STATE VARIABLES** (after activeOrders):

```solidity
/// @notice Track flip order metadata for monitoring
mapping(uint128 orderId => FlipOrderData) public flipOrders;

/// @notice Track DEX internal balances we expect to have
mapping(address token => uint128 expectedBalance) internal _expectedDexBalances;

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
```

---

### Section 2.2: Constants - Add Tempo Constraints

**ADD AFTER EXISTING CONSTANTS:**

```solidity
/// @notice Tempo DEX tick constraints
int16 public constant TEMPO_MIN_TICK = -2000;
int16 public constant TEMPO_MAX_TICK = 2000;
int16 public constant TEMPO_TICK_SPACING = 10;

/// @notice Maximum safe uint128 value for conversions
uint128 public constant MAX_UINT128 = type(uint128).max;
```

---

### Section 2.3: Internal Balance Management - NEW FUNCTIONS

**ADD NEW INTERNAL FUNCTIONS** (before deployLiquidity):

```solidity
// ============================================
// INTERNAL BALANCE MANAGEMENT
// ============================================

/// @notice Ensure sufficient DEX internal balance for order placement
/// @param token Token to check/deposit
/// @param amount Amount needed
function _ensureDexBalance(address token, uint128 amount) internal {
    uint128 currentBalance = ITempoOrderbook(dex).balanceOf(address(this), token);

    if (currentBalance < amount) {
        uint128 shortfall = amount - currentBalance;

        // Approve DEX to transfer shortfall
        IERC20(token).approve(dex, shortfall);

        // Note: Transfer happens automatically in place() call
        // We just need to ensure approval is set
    }
}

/// @notice Withdraw all proceeds from DEX internal balance
/// @param token Token to withdraw
/// @return amount Amount withdrawn
function _withdrawAllFromDex(address token) internal returns (uint128 amount) {
    amount = ITempoOrderbook(dex).balanceOf(address(this), token);

    if (amount > 0) {
        ITempoOrderbook(dex).withdraw(token, amount);
    }
}

/// @notice Withdraw specific amount from DEX internal balance
/// @param token Token to withdraw
/// @param amount Amount to withdraw
function _withdrawFromDex(address token, uint128 amount) internal {
    require(amount > 0, "Zero amount");

    uint128 balance = ITempoOrderbook(dex).balanceOf(address(this), token);
    require(balance >= amount, "Insufficient DEX balance");

    ITempoOrderbook(dex).withdraw(token, amount);
}

/// @notice Get current DEX internal balance
/// @param token Token to query
/// @return balance Current balance in DEX
function getDexBalance(address token) public view returns (uint128 balance) {
    return ITempoOrderbook(dex).balanceOf(address(this), token);
}
```

---

### Section 2.4: Tick Validation - NEW FUNCTION

**ADD NEW INTERNAL FUNCTION:**

```solidity
// ============================================
// TICK VALIDATION
// ============================================

/// @notice Validate tick meets Tempo DEX constraints
/// @param tick Tick to validate
function _validateTick(int16 tick) internal pure {
    require(tick >= TEMPO_MIN_TICK && tick <= TEMPO_MAX_TICK, "TICK_OUT_OF_BOUNDS");
    require(tick % TEMPO_TICK_SPACING == 0, "TICK_NOT_MULTIPLE_OF_SPACING");
}

/// @notice Validate flip tick constraints
/// @param tick Original tick
/// @param flipTick Flip tick
/// @param isBid Order direction
function _validateFlipTick(int16 tick, int16 flipTick, bool isBid) internal pure {
    _validateTick(flipTick);

    if (isBid) {
        require(flipTick > tick, "FLIP_TICK_MUST_BE_GREATER_FOR_BID");
    } else {
        require(flipTick < tick, "FLIP_TICK_MUST_BE_LESS_FOR_ASK");
    }
}

/// @notice Convert uint256 amount to uint128 safely
/// @param amount Amount to convert
/// @return amount128 Converted amount
function _toUint128(uint256 amount) internal pure returns (uint128 amount128) {
    require(amount <= MAX_UINT128, "Amount exceeds uint128");
    amount128 = uint128(amount);
}
```

---

### Section 2.5: Order Placement - COMPLETE REWRITE

**FIND FUNCTION:**
```solidity
function deployLiquidity(uint256 pairId) external onlyRole(STRATEGIST_ROLE) {
    // ... existing implementation
}
```

**REPLACE ENTIRE FUNCTION WITH:**

```solidity
/// @notice Deploy liquidity to Tempo DEX orderbook
/// @param pairId Pair identifier
function deployLiquidity(uint256 pairId) external onlyRole(STRATEGIST_ROLE) {
    PairConfig memory config = pairConfigs[pairId];
    require(config.tokenA != address(0), "Pair not configured");
    require(pairHasActiveDeployment[pairId], "No capital deployed");
    require(activeOrders[pairId].length == 0, "Orders already active");

    // Get fresh oracle signal
    RiskController.OracleSignal memory signal = riskController.getLatestSignal(pairId);
    require(block.timestamp - signal.timestamp < 300, "Oracle signal stale");

    // Validate can place orders
    require(
        riskController.validateOrderPlacement(pairId, signal),
        "Risk check failed"
    );

    // Determine base token and quote token from pair
    // In Tempo model: base is tokenA, quote from TIP-20 quoteToken()
    address base = config.tokenA;
    address quote = config.tokenB; // Assumed quote, should verify via IERC20(base).quoteToken()

    // Calculate target capital allocation
    uint256 deployedCap = treasury.deployedCapital(config.tokenA);
    require(deployedCap > 0, "No deployed capital");

    // Split capital: 50% bid, 50% ask (simplified - can be parameterized)
    uint128 bidAmount = _toUint128(deployedCap / 2);
    uint128 askAmount = _toUint128(deployedCap - deployedCap / 2);

    // Calculate ticks from oracle signal
    // Oracle provides reference tick, we spread around it
    int16 refTick = signal.referenceTick; // Now int16 from Phase 2 changes
    int16 bidTick = refTick - int16(config.tickWidth);
    int16 askTick = refTick + int16(config.tickWidth);

    // Validate ticks
    _validateTick(bidTick);
    _validateTick(askTick);

    // Ensure sufficient DEX balance for both orders
    // Bid order needs quote token (buying base with quote)
    // Ask order needs base token (selling base for quote)
    _ensureDexBalance(quote, bidAmount);
    _ensureDexBalance(base, askAmount);

    // Place orders
    uint128 bidOrderId;
    uint128 askOrderId;

    if (config.useFlipOrders) {
        // Calculate flip ticks
        int16 bidFlipTick = askTick; // Bid flips to ask side
        int16 askFlipTick = bidTick; // Ask flips to bid side

        // Validate flip constraints
        _validateFlipTick(bidTick, bidFlipTick, true);
        _validateFlipTick(askTick, askFlipTick, false);

        // Place flip orders
        bidOrderId = ITempoOrderbook(dex).placeFlip(
            base,
            bidAmount,
            true,  // isBid
            bidTick,
            bidFlipTick
        );

        askOrderId = ITempoOrderbook(dex).placeFlip(
            base,
            askAmount,
            false, // isAsk
            askTick,
            askFlipTick
        );

        // Track flip order metadata for monitoring
        flipOrders[bidOrderId] = FlipOrderData({
            token: base,
            amount: bidAmount,
            isBid: true,
            originalTick: bidTick,
            flipTick: bidFlipTick,
            createdAt: block.timestamp,
            isActive: true
        });

        flipOrders[askOrderId] = FlipOrderData({
            token: base,
            amount: askAmount,
            isBid: false,
            originalTick: askTick,
            flipTick: askFlipTick,
            createdAt: block.timestamp,
            isActive: true
        });
    } else {
        // Place regular orders
        bidOrderId = ITempoOrderbook(dex).place(
            base,
            bidAmount,
            true,  // isBid
            bidTick
        );

        askOrderId = ITempoOrderbook(dex).place(
            base,
            askAmount,
            false, // isAsk
            askTick
        );
    }

    // Store order IDs
    activeOrders[pairId].push(bidOrderId);
    activeOrders[pairId].push(askOrderId);

    emit LiquidityDeployed(pairId, bidOrderId, askOrderId, bidAmount, askAmount);
}
```

---

### Section 2.6: Order Cancellation - REWRITE

**FIND FUNCTION:**
```solidity
function emergencyUnwind(uint256 pairId) external onlyRole(RISK_OFFICER_ROLE) {
    // ... existing implementation
}
```

**REPLACE ENTIRE FUNCTION WITH:**

```solidity
/// @notice Emergency unwind - cancel all orders and return capital
/// @param pairId Pair to unwind
function emergencyUnwind(uint256 pairId) external onlyRole(RISK_OFFICER_ROLE) {
    uint128[] storage orders = activeOrders[pairId];
    require(orders.length > 0, "No active orders");

    PairConfig memory config = pairConfigs[pairId];
    address base = config.tokenA;
    address quote = config.tokenB;

    // Query DEX balances before cancellation
    uint128 baseBalanceBefore = ITempoOrderbook(dex).balanceOf(address(this), base);
    uint128 quoteBalanceBefore = ITempoOrderbook(dex).balanceOf(address(this), quote);

    // Cancel all orders
    for (uint256 i = 0; i < orders.length; i++) {
        uint128 orderId = orders[i];

        // Cancel order (void return - refund goes to internal balance)
        ITempoOrderbook(dex).cancel(orderId);

        // Mark flip order as inactive if it was one
        if (flipOrders[orderId].isActive) {
            flipOrders[orderId].isActive = false;
        }
    }

    // Query DEX balances after cancellation
    uint128 baseBalanceAfter = ITempoOrderbook(dex).balanceOf(address(this), base);
    uint128 quoteBalanceAfter = ITempoOrderbook(dex).balanceOf(address(this), quote);

    // Calculate refunds
    uint128 baseRefunded = baseBalanceAfter - baseBalanceBefore;
    uint128 quoteRefunded = quoteBalanceAfter - quoteBalanceBefore;

    // Withdraw all balances from DEX to strategy contract
    if (baseBalanceAfter > 0) {
        ITempoOrderbook(dex).withdraw(base, baseBalanceAfter);
    }
    if (quoteBalanceAfter > 0) {
        ITempoOrderbook(dex).withdraw(quote, quoteBalanceAfter);
    }

    // Transfer back to TreasuryVault
    if (baseBalanceAfter > 0) {
        IERC20(base).transfer(address(treasury), baseBalanceAfter);
        treasury.receiveEmergencyReturn(base, baseBalanceAfter);
    }
    if (quoteBalanceAfter > 0) {
        IERC20(quote).transfer(address(treasury), quoteBalanceAfter);
        treasury.receiveEmergencyReturn(quote, quoteBalanceAfter);
    }

    // Clear active orders
    delete activeOrders[pairId];
    pairHasActiveDeployment[pairId] = false;

    emit EmergencyUnwind(pairId, baseRefunded, quoteRefunded);
}
```

---

### Section 2.7: Add Flip Order Monitoring

**ADD NEW FUNCTION:**

```solidity
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
    uint128 dexBalance = ITempoOrderbook(dex).balanceOf(
        address(this),
        flipOrder.token
    );

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
    uint128 maxOrderId = ITempoOrderbook(dex).nextOrderId();

    for (uint128 i = 0; i < maxOrderId; i++) {
        if (flipOrders[i].isActive) {
            count++;
        }
    }

    // Collect active flip order IDs
    orderIds = new uint128[](count);
    uint256 idx = 0;
    for (uint128 i = 0; i < maxOrderId; i++) {
        if (flipOrders[i].isActive) {
            orderIds[idx] = i;
            idx++;
        }
    }
}
```

---

### Section 2.8: Update Event Signatures

**FIND:**
```solidity
event LiquidityDeployed(uint256 indexed pairId, uint256 bidOrderId, uint256 askOrderId);
event EmergencyUnwind(uint256 indexed pairId, uint256 capitalReturned);
```

**REPLACE WITH:**
```solidity
event LiquidityDeployed(
    uint256 indexed pairId,
    uint128 bidOrderId,
    uint128 askOrderId,
    uint128 bidAmount,
    uint128 askAmount
);

event EmergencyUnwind(
    uint256 indexed pairId,
    uint128 baseReturned,
    uint128 quoteReturned
);
```

---

## File 3: RiskController.sol - Type Updates

**File Location:** `src/RiskController.sol`

### Section 3.1: Oracle Signal Structure

**FIND:**
```solidity
struct OracleSignal {
    uint256 pegDeviation;
    uint256 orderbookDepthBid;
    uint256 orderbookDepthAsk;
    uint256 timestamp;
    uint256 nonce;
}
```

**REPLACE WITH:**
```solidity
struct OracleSignal {
    uint256 pegDeviation;        // Basis points (e.g., 100 = 1%)
    int16 referenceTick;          // Reference tick from oracle (±2000 range)
    uint256 orderbookDepthBid;    // Bid side liquidity (can stay uint256)
    uint256 orderbookDepthAsk;    // Ask side liquidity (can stay uint256)
    uint256 timestamp;
    uint256 nonce;
}
```

---

### Section 3.2: Tick Validation Function

**ADD NEW FUNCTION:**

```solidity
/// @notice Validate tick is within Tempo DEX constraints
/// @param tick Tick to validate
function _validateTick(int16 tick) internal pure {
    require(tick >= -2000 && tick <= 2000, "Tick out of bounds");
    require(tick % 10 == 0, "Tick not multiple of spacing");
}
```

---

### Section 3.3: Update Oracle Signal Validation

**FIND:**
```solidity
function updateOracleSignal(
    uint256 pairId,
    uint256 pegDeviation,
    uint256 orderbookDepthBid,
    uint256 orderbookDepthAsk,
    bytes memory signature
) external {
    // ... existing validation
}
```

**UPDATE TO INCLUDE referenceTick:**

```solidity
function updateOracleSignal(
    uint256 pairId,
    uint256 pegDeviation,
    int16 referenceTick,
    uint256 orderbookDepthBid,
    uint256 orderbookDepthAsk,
    bytes memory signature
) external {
    require(hasRole(ORACLE_ROLE, msg.sender), "Not oracle");

    // Validate tick
    _validateTick(referenceTick);

    // ... rest of existing validation

    // Store signal
    latestSignals[pairId] = OracleSignal({
        pegDeviation: pegDeviation,
        referenceTick: referenceTick,
        orderbookDepthBid: orderbookDepthBid,
        orderbookDepthAsk: orderbookDepthAsk,
        timestamp: block.timestamp,
        nonce: oracleNonces[pairId]++
    });

    emit OracleSignalUpdated(pairId, pegDeviation, referenceTick, block.timestamp);
}
```

---

### Section 3.4: Update Event

**FIND:**
```solidity
event OracleSignalUpdated(uint256 indexed pairId, uint256 pegDeviation, uint256 timestamp);
```

**REPLACE WITH:**
```solidity
event OracleSignalUpdated(
    uint256 indexed pairId,
    uint256 pegDeviation,
    int16 referenceTick,
    uint256 timestamp
);
```

---

## File 4: Oracle Relay Script - Update

**File Location:** `offchain/oracle_relay.py`

### Section 4.1: Query Tempo DEX Instead of API

**FIND:**
```python
# Current: Query from generic API
orderbook_data = requests.get(f"{TEMPO_API_URL}/orderbook/{pair_id}").json()
best_bid = orderbook_data['bestBid']
best_ask = orderbook_data['bestAsk']
```

**REPLACE WITH:**

```python
# Query Tempo DEX contract directly
from web3 import Web3

# DEX contract address (predeployed)
DEX_ADDRESS = "0xdec0000000000000000000000000000000000000"

# Load Tempo DEX ABI (from ITempoOrderbook.sol)
dex_contract = w3.eth.contract(address=DEX_ADDRESS, abi=TEMPO_DEX_ABI)

# Get pair key
token_a = Web3.to_checksum_address(config['tokenA'])
token_b = Web3.to_checksum_address(config['tokenB'])
pair_key = dex_contract.functions.pairKey(token_a, token_b).call()

# Get orderbook state
books_data = dex_contract.functions.books(pair_key).call()
base = books_data[0]
quote = books_data[1]
best_bid_tick = books_data[2]  # int16
best_ask_tick = books_data[3]  # int16

# Get liquidity at best levels
bid_liquidity_data = dex_contract.functions.getTickLevel(base, best_bid_tick, True).call()
ask_liquidity_data = dex_contract.functions.getTickLevel(base, best_ask_tick, False).call()

bid_liquidity = bid_liquidity_data[2]  # totalLiquidity (uint128)
ask_liquidity = ask_liquidity_data[2]  # totalLiquidity (uint128)

# Calculate peg deviation from midpoint tick
mid_tick = (best_bid_tick + best_ask_tick) // 2
peg_deviation = abs(mid_tick) * 10  # Convert tick to basis points (tick × 0.001%)

# Prepare oracle signal
signal = {
    'pairId': pair_id,
    'pegDeviation': peg_deviation,
    'referenceTick': mid_tick,  # NEW: Include reference tick
    'orderbookDepthBid': bid_liquidity,
    'orderbookDepthAsk': ask_liquidity,
    'timestamp': int(time.time()),
    'nonce': get_next_nonce(pair_id)
}
```

---

### Section 4.2: Update EIP-712 Signature

**UPDATE typed data structure to include referenceTick:**

```python
def sign_oracle_signal(signal, private_key):
    """Sign oracle signal with EIP-712"""

    # EIP-712 domain
    domain = {
        'name': 'TempoVault RiskController',
        'version': '1',
        'chainId': CHAIN_ID,
        'verifyingContract': RISK_CONTROLLER_ADDRESS
    }

    # Update types to include referenceTick
    types = {
        'EIP712Domain': [
            {'name': 'name', 'type': 'string'},
            {'name': 'version', 'type': 'string'},
            {'name': 'chainId', 'type': 'uint256'},
            {'name': 'verifyingContract', 'type': 'address'}
        ],
        'OracleSignal': [
            {'name': 'pairId', 'type': 'uint256'},
            {'name': 'pegDeviation', 'type': 'uint256'},
            {'name': 'referenceTick', 'type': 'int16'},  # NEW
            {'name': 'orderbookDepthBid', 'type': 'uint256'},
            {'name': 'orderbookDepthAsk', 'type': 'uint256'},
            {'name': 'timestamp', 'type': 'uint256'},
            {'name': 'nonce', 'type': 'uint256'}
        ]
    }

    # Message to sign
    message = {
        'pairId': signal['pairId'],
        'pegDeviation': signal['pegDeviation'],
        'referenceTick': signal['referenceTick'],  # NEW
        'orderbookDepthBid': signal['orderbookDepthBid'],
        'orderbookDepthAsk': signal['orderbookDepthAsk'],
        'timestamp': signal['timestamp'],
        'nonce': signal['nonce']
    }

    # Sign with EIP-712
    signable_message = encode_structured_data(
        domain_data=domain,
        message_types=types,
        message_data=message
    )

    signed = w3.eth.account.sign_message(signable_message, private_key=private_key)
    return signed.signature.hex()
```

---

## File 5: Test Updates - Complete Rewrite Needed

**Files to Update:** All DexStrategy tests

### Section 5.1: Test File List

Files requiring updates:
1. `test/unit/DexStrategy.t.sol` - Core unit tests
2. `test/fuzz/DexStrategyFuzz.t.sol` - Fuzz tests
3. `test/invariant/DexStrategyInvariants.t.sol` - Invariant tests
4. `test/integration/` - Any integration tests

### Section 5.2: Mock Tempo DEX Contract

**CREATE NEW FILE:** `test/mocks/MockTempoOrderbook.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/interfaces/ITempoOrderbook.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockTempoOrderbook
 * @notice Mock Tempo DEX for testing
 * @dev Implements minimal functionality to test DexStrategy
 */
contract MockTempoOrderbook is ITempoOrderbook {
    uint128 private _nextOrderId = 1;

    mapping(address => mapping(address => uint128)) public balances;
    mapping(uint128 => Order) public orders;

    struct Order {
        address maker;
        address token;
        uint128 amount;
        bool isBid;
        int16 tick;
        bool isFlip;
        int16 flipTick;
        bool exists;
    }

    // ============================================
    // CONSTANTS
    // ============================================

    function PRICE_SCALE() external pure returns (uint32) {
        return 100_000;
    }

    function TICK_SPACING() external pure returns (int16) {
        return 10;
    }

    function MIN_TICK() external pure returns (int16) {
        return -2000;
    }

    function MAX_TICK() external pure returns (int16) {
        return 2000;
    }

    function MIN_PRICE() external pure returns (uint32) {
        return 98_000;
    }

    function MAX_PRICE() external pure returns (uint32) {
        return 102_000;
    }

    // ============================================
    // PRICING
    // ============================================

    function tickToPrice(int16 tick) external pure returns (uint32) {
        return uint32(int32(100_000) + int32(tick));
    }

    function priceToTick(uint32 price) external pure returns (int16) {
        return int16(int32(price) - 100_000);
    }

    // ============================================
    // PAIRS
    // ============================================

    function pairKey(address tokenA, address tokenB) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenA, tokenB));
    }

    function createPair(address) external pure returns (bytes32) {
        revert("Not implemented in mock");
    }

    function books(bytes32) external pure returns (address, address, int16, int16) {
        revert("Not implemented in mock");
    }

    function getTickLevel(address, int16, bool)
        external
        pure
        returns (uint128, uint128, uint128)
    {
        revert("Not implemented in mock");
    }

    // ============================================
    // INTERNAL BALANCES
    // ============================================

    function balanceOf(address user, address token) external view returns (uint128) {
        return balances[user][token];
    }

    function withdraw(address token, uint128 amount) external {
        require(balances[msg.sender][token] >= amount, "Insufficient balance");

        balances[msg.sender][token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
    }

    // ============================================
    // ORDER PLACEMENT
    // ============================================

    function place(address token, uint128 amount, bool isBid, int16 tick)
        external
        returns (uint128 orderId)
    {
        // Validate
        require(tick >= -2000 && tick <= 2000, "TICK_OUT_OF_BOUNDS");
        require(tick % 10 == 0, "TICK_NOT_MULTIPLE_OF_SPACING");

        // Transfer tokens (or use internal balance)
        uint128 currentBalance = balances[msg.sender][token];
        if (currentBalance < amount) {
            uint128 shortfall = amount - currentBalance;
            IERC20(token).transferFrom(msg.sender, address(this), shortfall);
            balances[msg.sender][token] += shortfall;
        }

        // Debit from internal balance
        balances[msg.sender][token] -= amount;

        // Create order
        orderId = _nextOrderId++;
        orders[orderId] = Order({
            maker: msg.sender,
            token: token,
            amount: amount,
            isBid: isBid,
            tick: tick,
            isFlip: false,
            flipTick: 0,
            exists: true
        });

        emit OrderPlaced(orderId, msg.sender, token, amount, isBid, tick, false, 0);
    }

    function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick)
        external
        returns (uint128 orderId)
    {
        // Validate
        require(tick >= -2000 && tick <= 2000, "TICK_OUT_OF_BOUNDS");
        require(tick % 10 == 0, "TICK_NOT_MULTIPLE_OF_SPACING");
        require(flipTick >= -2000 && flipTick <= 2000, "FLIP_TICK_OUT_OF_BOUNDS");
        require(flipTick % 10 == 0, "FLIP_TICK_NOT_MULTIPLE_OF_SPACING");

        if (isBid) {
            require(flipTick > tick, "FLIP_TICK_MUST_BE_GREATER_FOR_BID");
        } else {
            require(flipTick < tick, "FLIP_TICK_MUST_BE_LESS_FOR_ASK");
        }

        // Transfer tokens
        uint128 currentBalance = balances[msg.sender][token];
        if (currentBalance < amount) {
            uint128 shortfall = amount - currentBalance;
            IERC20(token).transferFrom(msg.sender, address(this), shortfall);
            balances[msg.sender][token] += shortfall;
        }

        // Debit from internal balance
        balances[msg.sender][token] -= amount;

        // Create flip order
        orderId = _nextOrderId++;
        orders[orderId] = Order({
            maker: msg.sender,
            token: token,
            amount: amount,
            isBid: isBid,
            tick: tick,
            isFlip: true,
            flipTick: flipTick,
            exists: true
        });

        emit OrderPlaced(orderId, msg.sender, token, amount, isBid, tick, true, flipTick);
    }

    function cancel(uint128 orderId) external {
        Order storage order = orders[orderId];
        require(order.exists, "Order does not exist");
        require(order.maker == msg.sender, "UNAUTHORIZED");

        // Refund to internal balance
        balances[msg.sender][order.token] += order.amount;

        // Delete order
        delete orders[orderId];

        emit OrderCancelled(orderId);
    }

    function cancelStaleOrder(uint128) external pure {
        revert("Not implemented in mock");
    }

    function nextOrderId() external view returns (uint128) {
        return _nextOrderId;
    }

    // ============================================
    // SWAPS (NOT IMPLEMENTED IN MOCK)
    // ============================================

    function quoteSwapExactAmountIn(address, address, uint128)
        external
        pure
        returns (uint128)
    {
        revert("Not implemented in mock");
    }

    function quoteSwapExactAmountOut(address, address, uint128)
        external
        pure
        returns (uint128)
    {
        revert("Not implemented in mock");
    }

    function swapExactAmountIn(address, address, uint128, uint128)
        external
        pure
        returns (uint128)
    {
        revert("Not implemented in mock");
    }

    function swapExactAmountOut(address, address, uint128, uint128)
        external
        pure
        returns (uint128)
    {
        revert("Not implemented in mock");
    }
}
```

---

### Section 5.3: Update Test Setup

**IN:** `test/unit/DexStrategy.t.sol`

**UPDATE setUp() function:**

```solidity
import "../mocks/MockTempoOrderbook.sol";

contract DexStrategyTest is Test {
    DexStrategy public strategy;
    MockTempoOrderbook public mockDex;  // Changed from generic mock
    // ... other contracts

    function setUp() public {
        // Deploy mock Tempo DEX
        mockDex = new MockTempoOrderbook();

        // Deploy strategy with mock DEX
        strategy = new DexStrategy(
            address(mockDex),  // Tempo DEX
            address(treasury),
            address(riskController),
            address(roles)
        );

        // ... rest of setup
    }
}
```

---

### Section 5.4: Update Test Cases

**EXAMPLE: Update order placement test**

**BEFORE:**
```solidity
function test_deployLiquidity() public {
    // ...setup...

    vm.prank(strategist);
    strategy.deployLiquidity(pairId);

    uint256[] memory orders = strategy.getActiveOrders(pairId);
    assertEq(orders.length, 2);
}
```

**AFTER:**
```solidity
function test_deployLiquidity() public {
    // ...setup...

    // Ensure strategy has capital
    deal(address(usdc), address(strategy), 1000e18);

    vm.prank(strategist);
    strategy.deployLiquidity(pairId);

    uint128[] memory orders = strategy.getActiveOrders(pairId);
    assertEq(orders.length, 2);

    // Verify orders were placed correctly
    // Check DEX balances were debited
    uint128 dexBalance = mockDex.balanceOf(address(strategy), address(usdc));
    assertEq(dexBalance, 0, "All capital should be in orders");
}
```

---

**EXAMPLE: Update flip order test**

**ADD NEW TEST:**
```solidity
function test_deployLiquidity_withFlipOrders() public {
    // Configure pair with flip orders
    vm.prank(strategist);
    strategy.configurePairForStrategy(
        pairId,
        address(usdc),
        address(usdt),
        100,  // tickWidth
        true  // useFlipOrders
    );

    // Deploy capital
    deal(address(usdc), address(strategy), 1000e18);

    // Deploy liquidity
    vm.prank(strategist);
    strategy.deployLiquidity(pairId);

    // Verify flip orders created
    uint128[] memory orders = strategy.getActiveOrders(pairId);
    assertEq(orders.length, 2);

    // Verify flip order metadata tracked
    (
        address token,
        uint128 amount,
        bool isBid,
        int16 originalTick,
        int16 flipTick,
        uint256 createdAt,
        bool isActive
    ) = strategy.flipOrders(orders[0]);

    assertTrue(isActive, "Flip order should be active");
    assertTrue(flipTick > originalTick, "Bid flip tick must be greater");
}
```

---

## File 6: Deployment Script Updates

**File Location:** `script/Deploy.s.sol`

### Section 6.1: Update Tempo DEX Address

**FIND:**
```solidity
address tempoDex = vm.envAddress("TEMPO_DEX_ADDRESS");
```

**REPLACE WITH:**

```solidity
// Tempo DEX is predeployed system contract at fixed address
address constant TEMPO_DEX_ADDRESS = 0xdec0000000000000000000000000000000000000;

// Verify we're on Tempo Chain
require(block.chainid == 42431, "Must deploy to Tempo Testnet (42431)");
```

---

### Section 6.2: Update Constructor Call

**FIND:**
```solidity
DexStrategy strategy = new DexStrategy(
    tempoDex,
    address(treasury),
    address(riskController),
    address(roles)
);
```

**KEEP SAME** (no changes needed - constructor signature unchanged)

---

## File 7: Documentation Updates

### Section 7.1: Update README.md

**ADD SECTION:**

```markdown
## Tempo Protocol Integration

### Network Information

- **Chain:** Tempo Chain (standalone blockchain)
- **Testnet Chain ID:** 42431
- **Testnet RPC:** https://rpc.moderato.tempo.xyz
- **Testnet Explorer:** https://explore.tempo.xyz

### Tempo DEX Address

The Tempo Stablecoin DEX is a **predeployed system contract** at:
```
0xdec0000000000000000000000000000000000000
```

This address is the same on both testnet and mainnet.

### Key Integration Details

1. **Internal Balance System**
   - DEX maintains internal balances for gas efficiency
   - Strategies must withdraw proceeds using `withdraw()`
   - Query balances with `balanceOf()`

2. **Order Types**
   - Regular orders: `place(token, amount, isBid, tick)`
   - Flip orders: `placeFlip(token, amount, isBid, tick, flipTick)`

3. **Tick Constraints**
   - Range: ±2000 (±2% from peg)
   - Spacing: Must be divisible by 10
   - Type: int16 (NOT int24)

4. **Type Conversions**
   - Amounts: uint128 (NOT uint256)
   - Order IDs: uint128 (NOT uint256)
   - Ticks: int16 (NOT int24)

5. **Flip Order Risks**
   - Can silently fail if insufficient DEX balance
   - Can silently fail if authorization lost
   - Must monitor flip order health manually
```

---

## Testing Strategy

### Phase 1: Unit Tests (Local)

1. Deploy MockTempoOrderbook
2. Run all DexStrategy unit tests
3. Verify type conversions work correctly
4. Verify tick validation works
5. Verify internal balance management works

**Command:**
```bash
forge test --zksync -vvv
```

**Expected:** All tests pass

---

### Phase 2: Tempo Testnet Integration

1. Deploy to Tempo Testnet (chain 42431)
2. Verify contracts on Tempo Explorer
3. Configure test pair (e.g., USDC/pathUSD)
4. Fund strategy with testnet tokens
5. Test order placement manually
6. Test order cancellation
7. Test emergency unwind

**Command:**
```bash
forge script script/Deploy.s.sol \
  --zksync \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --broadcast \
  --verify
```

---

### Phase 3: End-to-End Flow

**Test Sequence:**

1. **Deposit to Vault**
   ```solidity
   vault.deposit(usdc, 1000e18);
   ```

2. **Deploy to Strategy**
   ```solidity
   vault.deployToStrategy(strategy, pairId, usdc, 500e18);
   ```

3. **Configure Pair**
   ```solidity
   strategy.configurePairForStrategy(pairId, usdc, pathUSD, 100, true);
   ```

4. **Deploy Liquidity**
   ```solidity
   strategy.deployLiquidity(pairId);
   ```

5. **Verify Orders on Tempo Explorer**
   - Check DEX at 0xdec0...0000
   - Verify orders exist
   - Verify balances debited

6. **Submit Oracle Update**
   ```bash
   python offchain/oracle_relay.py
   ```

7. **Emergency Unwind**
   ```solidity
   strategy.emergencyUnwind(pairId);
   ```

8. **Verify Capital Returned**
   ```solidity
   vault.withdraw(usdc, amount, recipient);
   ```

---

## Migration Checklist

### Pre-Deployment

- [ ] Review all code changes
- [ ] Update all tests
- [ ] Run local test suite (100% pass)
- [ ] Update deployment scripts
- [ ] Update .env with Tempo RPC
- [ ] Get Tempo testnet tokens
- [ ] Review this refactor plan with team

### Deployment

- [ ] Deploy to Tempo Testnet
- [ ] Verify all contracts on explorer
- [ ] Configure roles
- [ ] Test single order placement
- [ ] Test single order cancellation
- [ ] Test flip order
- [ ] Test emergency unwind
- [ ] Test full e2e flow

### Post-Deployment

- [ ] Monitor flip order health
- [ ] Verify oracle updates working
- [ ] Check DEX internal balances
- [ ] Verify capital can be withdrawn
- [ ] Document any issues found
- [ ] Update VERIFICATION_CHECKLIST.md

---

## Risk Mitigation

### High-Risk Areas

1. **Internal Balance Management**
   - Risk: Funds stuck in DEX
   - Mitigation: Always withdraw before returning to vault
   - Testing: Verify balanceOf() decreases after withdraw

2. **Flip Order Silent Failures**
   - Risk: Flip doesn't execute, no notification
   - Mitigation: Regular monitoring via checkFlipOrderHealth()
   - Testing: Test with insufficient balance scenario

3. **Type Conversions**
   - Risk: Overflow when converting uint256 → uint128
   - Mitigation: _toUint128() with overflow check
   - Testing: Fuzz test with max values

4. **Tick Validation**
   - Risk: Invalid tick causes revert
   - Mitigation: _validateTick() before all DEX calls
   - Testing: Test boundary values (±2000)

### Emergency Procedures

If deployment fails:
1. Call emergencyUnwind() on all active pairs
2. Withdraw all DEX balances
3. Return capital to TreasuryVault
4. Pause system via GovernanceRoles
5. Debug issue on testnet before retry

---

## Success Criteria

**Deployment is successful when:**

✅ All contracts deployed to Tempo Testnet
✅ Orders successfully placed on Tempo DEX
✅ Orders successfully cancelled
✅ Flip orders execute (when properly funded)
✅ Internal balances correctly managed
✅ Emergency unwind returns all capital
✅ Oracle updates accepted
✅ Full e2e flow works: deposit → deploy → unwind → withdraw

**Documentation complete when:**

✅ All code changes committed
✅ All tests updated and passing
✅ VERIFICATION_CHECKLIST.md updated
✅ README.md updated with Tempo integration
✅ Deployment addresses documented

---

*Status: Phase 3 COMPLETE - Detailed refactor plan ready for implementation. Awaiting user approval to begin coding.*

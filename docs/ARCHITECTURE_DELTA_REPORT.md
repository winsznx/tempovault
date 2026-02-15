# Architecture Delta Report: TempoVault vs Tempo Protocol

**Status:** In Progress
**Created:** 2026-02-14
**Phase:** 2 of 3
**Purpose:** Analyze each TempoVault module against Tempo protocol ground truth extracted in Phase 1

**Source Documents:**
- TEMPO_PROTOCOL_ALIGNMENT.md (Phase 1 ground truth)
- TempoVault source code (src/)
- Tempo DEX specification (https://docs.tempo.xyz/protocol/exchange/spec)

---

## Executive Summary

**Severity Legend:**
- 🔴 **CRITICAL**: Blocking issue - will cause transaction reverts or fund loss
- 🟡 **MAJOR**: Functional issue - will cause incorrect behavior but not immediate failure
- 🟢 **MINOR**: Cosmetic issue - code works but doesn't follow best practices
- ⚪ **COSMETIC**: Style/naming only - no functional impact

**Module Status:**
- ITempoOrderbook.sol: 🔴 CRITICAL - 100% incompatible interface
- DexStrategy.sol: 🔴 CRITICAL - Uses wrong interface, wrong semantics, missing internal balance management
- RiskController.sol: 🟡 MAJOR - Tick validation logic incompatible
- TreasuryVault.sol: 🟢 MINOR - No direct DEX interaction, may need balance management awareness
- Oracle/ReportingAdapter: 🟢 MINOR - No direct DEX dependency

---

## Module 1: ITempoOrderbook.sol

**File:** `src/interfaces/ITempoOrderbook.sol`
**Current Status:** 🔴 CRITICAL - Complete rewrite required

### Delta Analysis

#### Function: placeOrder() - 🔴 CRITICAL

**Our Interface:**
```solidity
function placeOrder(
    address tokenIn,
    address tokenOut,
    int24 tick,
    uint256 amount,
    bool isFlip
) external returns (uint256 orderId);
```

**Actual Tempo:**
```solidity
function place(
    address token,
    uint128 amount,
    bool isBid,
    int16 tick
) external returns (uint128 orderId);
```

**Deltas:**
| Element | Our Code | Tempo Reality | Severity |
|---------|----------|---------------|----------|
| Function name | `placeOrder` | `place` | 🔴 CRITICAL |
| Token params | `tokenIn, tokenOut` (2 params) | `token` (1 param) + `bool isBid` | 🔴 CRITICAL |
| Tick type | `int24` | `int16` | 🔴 CRITICAL |
| Amount type | `uint256` | `uint128` | 🔴 CRITICAL |
| Order ID type | `uint256` | `uint128` | 🔴 CRITICAL |
| Flip handling | `bool isFlip` parameter | Separate `placeFlip()` function | 🔴 CRITICAL |

**Impact:**
- ❌ Function does not exist on Tempo DEX
- ❌ All calls will revert with "function selector not found"
- ❌ Even if name fixed, parameter semantics incompatible

---

#### Function: placeFlip() - 🔴 CRITICAL (MISSING)

**Our Interface:**
```solidity
// Does not exist - flip handled via isFlip param in placeOrder
```

**Actual Tempo:**
```solidity
function placeFlip(
    address token,
    uint128 amount,
    bool isBid,
    int16 tick,
    int16 flipTick
) external returns (uint128 orderId);
```

**Deltas:**
| Element | Our Code | Tempo Reality | Severity |
|---------|----------|---------------|----------|
| Function existence | ❌ Does not exist | ✅ Required for flip orders | 🔴 CRITICAL |
| flipTick parameter | ❌ Missing | ✅ Required, validated | 🔴 CRITICAL |

**Impact:**
- ❌ Cannot create flip orders at all
- ❌ DexStrategy flip order logic completely broken

---

#### Function: cancelOrder() - 🔴 CRITICAL

**Our Interface:**
```solidity
function cancelOrder(uint256 orderId) external returns (uint256 refundedAmount);
```

**Actual Tempo:**
```solidity
function cancel(uint128 orderId) external;
```

**Deltas:**
| Element | Our Code | Tempo Reality | Severity |
|---------|----------|---------------|----------|
| Function name | `cancelOrder` | `cancel` | 🔴 CRITICAL |
| Order ID type | `uint256` | `uint128` | 🔴 CRITICAL |
| Return type | `uint256 refundedAmount` | `void` | 🔴 CRITICAL |

**Impact:**
- ❌ Function does not exist on Tempo DEX
- ❌ Cannot get refunded amount from return value
- ❌ Must query `balanceOf()` before/after to determine refund

---

#### Function: modifyOrder() - 🔴 CRITICAL (DOESN'T EXIST)

**Our Interface:**
```solidity
function modifyOrder(uint256 orderId, uint256 newAmount) external;
```

**Actual Tempo:**
```solidity
// ❌ NO SUCH FUNCTION
```

**Impact:**
- ❌ Function does not exist on Tempo DEX
- ❌ All calls will revert
- ❌ Order modification requires cancel + place new order

---

#### Function: swap() - 🔴 CRITICAL

**Our Interface:**
```solidity
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut
) external returns (uint256 amountOut);
```

**Actual Tempo:**
```solidity
function swapExactAmountIn(
    address tokenIn,
    address tokenOut,
    uint128 amountIn,
    uint128 minAmountOut
) external returns (uint128 amountOut);
```

**Deltas:**
| Element | Our Code | Tempo Reality | Severity |
|---------|----------|---------------|----------|
| Function name | `swap` | `swapExactAmountIn` | 🔴 CRITICAL |
| Amount types | `uint256` | `uint128` | 🔴 CRITICAL |

**Impact:**
- ❌ Function does not exist on Tempo DEX
- ⚠️ Not critical if we don't use swaps (we don't in current code)

---

#### View Functions: bestBid/bestAsk - 🔴 CRITICAL

**Our Interface:**
```solidity
function bestBid(address tokenA, address tokenB)
    external view returns (int24 tick, uint256 liquidity);

function bestAsk(address tokenA, address tokenB)
    external view returns (int24 tick, uint256 liquidity);
```

**Actual Tempo:**
```solidity
function books(bytes32 pairKey)
    external view
    returns (
        address base,
        address quote,
        int16 bestBidTick,
        int16 bestAskTick
    );
```

**Deltas:**
| Element | Our Code | Tempo Reality | Severity |
|---------|----------|---------------|----------|
| Function names | `bestBid`, `bestAsk` (separate) | `books` (combined) | 🔴 CRITICAL |
| Pair identification | `(tokenA, tokenB)` | `bytes32 pairKey` | 🔴 CRITICAL |
| Tick type | `int24` | `int16` | 🔴 CRITICAL |
| Liquidity | Returns liquidity | ❌ Does NOT return liquidity | 🔴 CRITICAL |

**Impact:**
- ❌ Functions do not exist on Tempo DEX
- ❌ Must use `books(pairKey(tokenA, tokenB))` instead
- ❌ Cannot get total liquidity at best bid/ask (must query getTickLevel separately)

---

#### Missing Functions We Need

**From Tempo DEX we're not using:**

1. ✅ `balanceOf(address user, address token) returns (uint128)` - **CRITICAL MISSING**
   - Need this to manage internal DEX balances
   - Need this to check refunds after cancel

2. ✅ `withdraw(address token, uint128 amount)` - **CRITICAL MISSING**
   - Need this to withdraw proceeds from DEX to vault

3. ✅ `pairKey(address tokenA, address tokenB) returns (bytes32)` - **MAJOR MISSING**
   - Need this to query orderbook state

4. ✅ `getTickLevel(address base, int16 tick, bool isBid) returns (...)` - **MINOR MISSING**
   - Useful for liquidity monitoring but not critical

---

### Required Changes: ITempoOrderbook.sol

**Action:** Complete rewrite required

**New Interface Structure:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITempoOrderbook {
    // ============================================
    // ORDER PLACEMENT & LIFECYCLE
    // ============================================

    function place(
        address token,
        uint128 amount,
        bool isBid,
        int16 tick
    ) external returns (uint128 orderId);

    function placeFlip(
        address token,
        uint128 amount,
        bool isBid,
        int16 tick,
        int16 flipTick
    ) external returns (uint128 orderId);

    function cancel(uint128 orderId) external;

    // ============================================
    // INTERNAL BALANCES
    // ============================================

    function balanceOf(address user, address token) external view returns (uint128);
    function withdraw(address token, uint128 amount) external;

    // ============================================
    // ORDERBOOK QUERY
    // ============================================

    function pairKey(address tokenA, address tokenB) external pure returns (bytes32);

    function books(bytes32 key)
        external view
        returns (
            address base,
            address quote,
            int16 bestBidTick,
            int16 bestAskTick
        );

    function getTickLevel(address base, int16 tick, bool isBid)
        external view
        returns (
            uint128 head,
            uint128 tail,
            uint128 totalLiquidity
        );

    // ============================================
    // CONSTANTS
    // ============================================

    function MIN_TICK() external view returns (int16);
    function MAX_TICK() external view returns (int16);
    function TICK_SPACING() external view returns (int16);

    // ============================================
    // EVENTS
    // ============================================

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

    event OrderCancelled(uint128 indexed orderId);

    event OrderFilled(
        uint128 indexed orderId,
        address indexed maker,
        address indexed taker,
        uint128 amountFilled,
        bool partialFill
    );
}
```

**Files to Delete:**
- Current ITempoOrderbook.sol (completely wrong)

**Files to Create:**
- New ITempoOrderbook.sol (above interface)

---

## Module 2: DexStrategy.sol

**File:** `src/DexStrategy.sol`
**Current Status:** 🔴 CRITICAL - Major rewrite required

### Delta Analysis

#### 2.1 Order Placement Logic - 🔴 CRITICAL

**Current Code Pattern:**
```solidity
uint256 orderId = ITempoOrderbook(dex).placeOrder(
    tokenIn,    // Wrong: uses two tokens
    tokenOut,   // Wrong: uses two tokens
    tick,       // Wrong: int24 instead of int16
    amount,     // Wrong: uint256 instead of uint128
    isFlip      // Wrong: flip orders need separate function
);
```

**Required Pattern:**
```solidity
// For regular orders:
uint128 orderId = ITempoOrderbook(dex).place(
    token,              // Single token (base or quote depending on isBid)
    uint128(amount),    // Cast to uint128
    isBid,              // Direction: true = bid, false = ask
    int16(tick)         // Cast to int16, validated ±2000
);

// For flip orders:
uint128 orderId = ITempoOrderbook(dex).placeFlip(
    token,
    uint128(amount),
    isBid,
    int16(tick),
    int16(flipTick)     // Must satisfy: bid ? flipTick > tick : flipTick < tick
);
```

**Deltas:**
| Element | Current Code | Required | Severity |
|---------|--------------|----------|----------|
| Function name | `placeOrder` | `place` or `placeFlip` | 🔴 CRITICAL |
| Token semantics | tokenIn/tokenOut model | token + isBid direction | 🔴 CRITICAL |
| Flip handling | Single function with flag | Separate functions | 🔴 CRITICAL |
| Type conversions | Direct assignment | Must cast uint256→uint128, int24→int16 | 🔴 CRITICAL |

---

#### 2.2 Token Selection Logic - 🔴 CRITICAL

**Current Approach:**
```solidity
// We assume arbitrary tokenA/tokenB pairs
address tokenIn = /* user picks */;
address tokenOut = /* user picks */;
```

**Required Approach:**
```solidity
// Must understand base/quote relationship from TIP-20 token
// Only one token parameter needed
// isBid determines if we're bidding quote for base (buy) or offering base for quote (sell)

// Example: USDC/pathUSD pair
address base = USDC;
address quote = pathUSD; // From IERC20(USDC).quoteToken()

// To buy USDC with pathUSD (bid):
place(USDC, amount, true, tick);  // Bid quote (pathUSD) for base (USDC)

// To sell USDC for pathUSD (ask):
place(USDC, amount, false, tick); // Offer base (USDC) for quote (pathUSD)
```

**Impact:**
- 🔴 Current logic assumes wrong pair model
- 🔴 Must query quote token relationship
- 🔴 Must translate our "swap direction" to Tempo's isBid logic

---

#### 2.3 Internal Balance Management - 🔴 CRITICAL (MISSING)

**Current Code:**
```solidity
// We assume direct ERC20 transfers per order
IERC20(token).approve(dex, amount);
// Order placed, tokens transferred
```

**Required Flow:**
```solidity
// 1. Check DEX internal balance
uint128 dexBalance = ITempoOrderbook(dex).balanceOf(address(this), token);

// 2. If insufficient, deposit to DEX (via transfer + place, or pre-deposit)
if (dexBalance < amount) {
    IERC20(token).approve(dex, amount - dexBalance);
    // Transfer happens automatically in place() call
}

// 3. Place order (deducts from internal balance)
uint128 orderId = dex.place(token, amount, isBid, tick);

// 4. After fill or cancel, proceeds in internal balance
// Query balance: dex.balanceOf(address(this), token)

// 5. Withdraw proceeds when needed
uint128 proceeds = dex.balanceOf(address(this), token);
dex.withdraw(token, proceeds);
// Now in our contract, return to TreasuryVault
```

**Deltas:**
| Element | Current Code | Required | Severity |
|---------|--------------|----------|----------|
| Balance tracking | ❌ None | Track DEX internal balances | 🔴 CRITICAL |
| Deposit flow | ❌ None | Explicit deposit or auto via place | 🔴 CRITICAL |
| Withdraw flow | ❌ None | Must withdraw proceeds to return to vault | 🔴 CRITICAL |
| Balance queries | ❌ Never used | balanceOf() before/after operations | 🔴 CRITICAL |

**Impact:**
- 🔴 Funds will be stuck in DEX internal balances
- 🔴 Cannot return capital to TreasuryVault without withdraw()
- 🔴 PnL calculations wrong (don't account for DEX balances)

---

#### 2.4 Order Cancellation - 🔴 CRITICAL

**Current Code:**
```solidity
uint256 refundedAmount = ITempoOrderbook(dex).cancelOrder(orderId);
// Use refundedAmount for accounting
```

**Required Code:**
```solidity
// 1. Query balance before cancel
uint128 balanceBefore = dex.balanceOf(address(this), token);

// 2. Cancel order (void return)
dex.cancel(uint128(orderId));

// 3. Query balance after cancel
uint128 balanceAfter = dex.balanceOf(address(this), token);

// 4. Calculate refund
uint128 refundedAmount = balanceAfter - balanceBefore;

// 5. Withdraw if needed
if (shouldWithdraw) {
    dex.withdraw(token, refundedAmount);
}
```

**Deltas:**
| Element | Current Code | Required | Severity |
|---------|--------------|----------|----------|
| Function name | `cancelOrder` | `cancel` | 🔴 CRITICAL |
| Return value | Expects uint256 refund | Void return | 🔴 CRITICAL |
| Refund tracking | From return value | Must query balanceOf() before/after | 🔴 CRITICAL |

---

#### 2.5 Flip Order Logic - 🔴 CRITICAL

**Current Code:**
```solidity
bool useFlip = pairConfig.useFlipOrders;
uint256 orderId = dex.placeOrder(tokenIn, tokenOut, tick, amount, useFlip);
```

**Required Code:**
```solidity
bool useFlip = pairConfig.useFlipOrders;

uint128 orderId;
if (useFlip) {
    // Calculate flipTick based on direction
    int16 flipTick;
    if (isBid) {
        // Bid flip: must flip to higher ask
        flipTick = tick + int16(pairConfig.flipSpread);
        require(flipTick > tick, "Invalid bid flip");
    } else {
        // Ask flip: must flip to lower bid
        flipTick = tick - int16(pairConfig.flipSpread);
        require(flipTick < tick, "Invalid ask flip");
    }

    orderId = dex.placeFlip(token, uint128(amount), isBid, int16(tick), flipTick);
} else {
    orderId = dex.place(token, uint128(amount), isBid, int16(tick));
}

// CRITICAL: Monitor for silent flip failures
// Flip can fail if:
// - Insufficient DEX balance after first fill
// - Lost TIP-403 authorization
// No revert, no event - must monitor manually
```

**Deltas:**
| Element | Current Code | Required | Severity |
|---------|--------------|----------|----------|
| Function | `placeOrder` with flag | `placeFlip` separate | 🔴 CRITICAL |
| flipTick param | ❌ Missing | Required with validation | 🔴 CRITICAL |
| Flip constraints | ❌ No validation | Must enforce flipTick > tick (bid) or < tick (ask) | 🔴 CRITICAL |
| Silent failure handling | ❌ None | Must monitor balance + authorization | 🔴 CRITICAL |

---

#### 2.6 Tick Validation - 🟡 MAJOR

**Current Code:**
```solidity
int24 tick = calculateTickFromPrice(price);
// Assume tick is valid
```

**Required Code:**
```solidity
int16 tick = int16(calculateTickFromPrice(price));

// Validate against Tempo constraints
require(tick >= -2000 && tick <= 2000, "TICK_OUT_OF_BOUNDS");
require(tick % 10 == 0, "TICK_NOT_MULTIPLE_OF_SPACING");
```

**Deltas:**
| Element | Current Code | Required | Severity |
|---------|--------------|----------|----------|
| Type | `int24` | `int16` | 🟡 MAJOR |
| Range check | ❌ Missing | ±2000 enforced | 🟡 MAJOR |
| Spacing check | ❌ Missing | Divisible by 10 | 🟡 MAJOR |

---

#### 2.7 Order Storage - 🟡 MAJOR

**Current Code:**
```solidity
mapping(uint256 pairId => uint256[] orderIds) public activeOrders;
```

**Required Code:**
```solidity
mapping(uint256 pairId => uint128[] orderIds) public activeOrders;
```

**Impact:**
- 🟡 Type mismatch but doesn't cause reverts (implicit conversion)
- 🟢 Wasteful storage (uint256 vs uint128)

---

### Required Changes: DexStrategy.sol

**Major Rewrites:**

1. **replaceOrderPlacement():**
   - Remove tokenIn/tokenOut parameters
   - Add token + isBid parameters
   - Add pair quote token resolution
   - Add type conversions (uint256→uint128, int24→int16)
   - Split into place() vs placeFlip() logic

2. **Add Internal Balance Management:**
   ```solidity
   function _depositToDex(address token, uint128 amount) internal {
       uint128 dexBalance = dex.balanceOf(address(this), token);
       if (dexBalance < amount) {
           IERC20(token).approve(address(dex), amount - dexBalance);
       }
   }

   function _withdrawFromDex(address token, uint128 amount) internal {
       dex.withdraw(token, amount);
   }

   function getDexBalance(address token) public view returns (uint128) {
       return dex.balanceOf(address(this), token);
   }
   ```

3. **Fix Order Cancellation:**
   ```solidity
   function _cancelOrder(uint128 orderId, address token) internal returns (uint128 refunded) {
       uint128 balanceBefore = dex.balanceOf(address(this), token);
       dex.cancel(orderId);
       uint128 balanceAfter = dex.balanceOf(address(this), token);
       refunded = balanceAfter - balanceBefore;
   }
   ```

4. **Add Flip Monitoring:**
   ```solidity
   // Track flip orders separately
   mapping(uint128 => FlipOrderData) public flipOrders;

   struct FlipOrderData {
       address token;
       uint128 amount;
       bool isBid;
       int16 originalTick;
       int16 flipTick;
       uint256 createdAt;
   }

   // Periodic check for silent flip failures
   function checkFlipStatus(uint128 orderId) external view returns (bool flipped) {
       // Query if new order exists at flipTick
       // Complex - may need event monitoring offchain
   }
   ```

---

## Module 3: RiskController.sol

**File:** `src/RiskController.sol`
**Current Status:** 🟡 MAJOR - Tick validation needs update

### Delta Analysis

#### 3.1 Oracle Signal Validation - 🟡 MAJOR

**Current Code:**
```solidity
// Oracle provides pegDeviation in basis points
// We convert to tick for validation
int24 tick = convertDeviationToTick(pegDeviation);
```

**Required:**
```solidity
// Tick is int16, range ±2000
int16 tick = int16(convertDeviationToTick(pegDeviation));
require(tick >= -2000 && tick <= 2000, "Invalid tick range");
```

**Impact:**
- 🟡 Type mismatch (int24 vs int16) but values within range
- 🟢 Functional issue only if oracle sends out-of-range ticks

---

#### 3.2 Order Size Limits - ✅ NO CHANGE NEEDED

**Current Code:**
```solidity
uint256 maxOrderSize = pairParams.maxOrderSize;
require(amount <= maxOrderSize, "Exceeds max order size");
```

**Analysis:**
- ✅ Our validation happens before DEX call
- ✅ uint256 internally, cast to uint128 at DEX boundary
- ✅ No changes required

---

#### 3.3 Exposure Tracking - ✅ NO CHANGE NEEDED

**Current Code:**
```solidity
mapping(uint256 pairId => uint256 exposure) public pairExposure;
```

**Analysis:**
- ✅ Internal accounting, not DEX-facing
- ✅ uint256 acceptable for internal use
- ✅ No changes required

---

### Required Changes: RiskController.sol

**Minor Updates:**

1. Change tick type in oracle signal:
   ```solidity
   struct OracleSignal {
       uint256 pegDeviation;
       int16 referenceTick;  // Changed from int24
       uint256 timestamp;
       uint256 nonce;
   }
   ```

2. Update validation:
   ```solidity
   function validateTick(int16 tick) internal pure {
       require(tick >= -2000 && tick <= 2000, "TICK_OUT_OF_BOUNDS");
       require(tick % 10 == 0, "TICK_NOT_MULTIPLE_OF_SPACING");
   }
   ```

---

## Module 4: TreasuryVault.sol

**File:** `src/TreasuryVault.sol`
**Current Status:** 🟢 MINOR - Awareness updates needed

### Delta Analysis

#### 4.1 Capital Deployment - 🟢 MINOR

**Current Code:**
```solidity
function deployToStrategy(address strategy, uint256 amount) external {
    IERC20(asset).transfer(strategy, amount);
    deployedCapital[asset] += amount;
}
```

**Awareness Needed:**
- Strategy will hold funds in DEX internal balance
- Proceeds may not return immediately
- Need to account for DEX balance vs strategy wallet balance

**Suggested Enhancement:**
```solidity
function recallFromStrategy(address strategy, uint256 amount) external {
    // Strategy must:
    // 1. Cancel orders
    // 2. Withdraw from DEX
    // 3. Transfer back to vault
    IStrategy(strategy).recallCapital(amount);
}
```

**Impact:**
- 🟢 No breaking changes
- 💡 Document that strategies use DEX internal balances

---

#### 4.2 Emergency Unwind - ✅ NO CHANGE NEEDED

**Current Code:**
```solidity
function receiveEmergencyReturn(address token, uint256 amount) external {
    require(msg.sender == strategy, "Only strategy");
    // Token already transferred
}
```

**Analysis:**
- ✅ Strategy will withdraw from DEX before transfer
- ✅ Vault doesn't need DEX awareness
- ✅ No changes required

---

### Required Changes: TreasuryVault.sol

**Documentation Updates:**
- Add comments about DEX internal balance model
- Document strategy capital flow: vault → strategy wallet → DEX balance → orders

---

## Module 5: Oracle & ReportingAdapter

**Files:** `src/ReportingAdapter.sol`, `offchain/oracle_relay.py`
**Current Status:** 🟢 MINOR - Type updates only

### Delta Analysis

#### 5.1 Oracle Signal Structure - 🟢 MINOR

**Current Code:**
```solidity
struct RiskMetrics {
    uint256 pegDeviation;      // Basis points
    uint256 orderbookDepthBid;
    uint256 orderbookDepthAsk;
}
```

**Consideration:**
- Tick conversion happens in RiskController
- Oracle provides basis points, not ticks
- ✅ No changes needed to oracle structure

---

#### 5.2 Offchain Oracle Relay - 🟢 MINOR

**Current Implementation:**
- Fetches orderbook data from Tempo API
- Computes peg deviation
- Signs and submits to RiskController

**Tempo Integration:**
- Must query Tempo DEX contract for orderbook state
- Use `books(pairKey)` to get best bid/ask
- Use `getTickLevel()` to get liquidity depths

**Required Updates:**
```python
# Instead of generic API:
best_bid_tick = dex.functions.books(pair_key).call()[2]
best_ask_tick = dex.functions.books(pair_key).call()[3]

# Get liquidity at best levels:
bid_liquidity = dex.functions.getTickLevel(base, best_bid_tick, True).call()[2]
ask_liquidity = dex.functions.getTickLevel(base, best_ask_tick, False).call()[2]
```

**Impact:**
- 🟢 Minor - change data source, same structure
- 💡 More accurate data directly from DEX

---

### Required Changes: Oracle System

**Minor Updates:**
1. Update oracle relay to query Tempo DEX contract
2. Use `books()` and `getTickLevel()` for orderbook data
3. Change tick type to int16 in any internal calculations

---

## Summary: Changes Required by Severity

### 🔴 CRITICAL (Blocking Deployment)

1. **ITempoOrderbook.sol** - Complete rewrite
   - Change all function signatures
   - Change all types (uint256→uint128, int24→int16)
   - Add missing functions (balanceOf, withdraw, etc.)

2. **DexStrategy.sol** - Major rewrite
   - Fix order placement (place/placeFlip)
   - Add internal balance management
   - Fix order cancellation
   - Fix flip order logic
   - Update token semantics (tokenIn/Out → token + isBid)

### 🟡 MAJOR (Functional Issues)

3. **DexStrategy.sol** - Type validations
   - Add tick range validation (±2000)
   - Add tick spacing validation (divisible by 10)
   - Update order ID storage (uint256→uint128)

4. **RiskController.sol** - Type updates
   - Change tick type (int24→int16)
   - Add Tempo-specific tick validation

### 🟢 MINOR (Enhancements)

5. **TreasuryVault.sol** - Documentation
   - Document DEX internal balance model
   - No code changes required

6. **Oracle System** - Data source
   - Query DEX contract instead of API
   - Use books() and getTickLevel()

---

## Next Steps: Phase 3

**Phase 3:** Create TEMPO_REFACTOR_PLAN.md
- Exact line-by-line changes for each file
- Migration path from old to new interface
- Test updates required
- Deployment sequence

**Approval Gate:**
- User must approve this delta analysis before Phase 3
- Confirm severity assessments
- Confirm scope of changes

---

*Status: Phase 2 COMPLETE - Architecture delta analysis finished. Awaiting approval to proceed to Phase 3: Detailed Refactor Plan*

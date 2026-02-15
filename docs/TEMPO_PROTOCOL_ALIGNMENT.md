# Tempo Protocol Alignment Report

**Status:** ✅ PHASE 1 COMPLETE
**Created:** 2026-02-14
**Purpose:** Extract ground truth from official Tempo documentation to validate TempoVault architecture

---

## Executive Summary

**Phase 1 Status:** ✅ COMPLETE - Ground truth extraction finished

**Critical Findings:**
1. ✅ Tempo Stablecoin DEX located: `0xdec0000000000000000000000000000000000000` (predeployed)
2. ✅ Network identified: Tempo Chain (ID: 42431), NOT Abstract Chain
3. ❌ Interface mismatch: Our `ITempoOrderbook.sol` 100% incompatible with real Tempo DEX
4. ✅ Tick math extracted: `tick = (price - 1) × 100_000`, int16 type, ±2000 range
5. ✅ Order lifecycle documented: Internal balance system, price-time priority, partial fills
6. ✅ Flip mechanics extracted: Separate `placeFlip()` function, silent failures possible
7. ⚠️ Fee model: NOT documented in specification (requires testnet verification)
8. ✅ Revert patterns: Named errors extracted, pre-conditions identified

---

## Section 1: DEX Contract Information

### 1.1 Deployed Addresses

**Source:** https://docs.tempo.xyz/quickstart/predeployed-contracts

| Network | Chain ID | DEX Address | Status |
|---------|----------|-------------|--------|
| Tempo Testnet (Moderato) | 42431 | `0xdec0000000000000000000000000000000000000` | ✅ Verified |
| Tempo Mainnet | 4217 | `0xdec0000000000000000000000000000000000000` | ❓ To verify |

**Key Finding:** Stablecoin DEX is a **predeployed system contract** (like a precompile), not a separately deployed contract.

### 1.2 ABI Comparison

**Source:** https://docs.tempo.xyz/protocol/exchange/spec

#### Our Assumed Interface (ITempoOrderbook.sol)

```solidity
interface ITempoOrderbook {
    function placeOrder(
        address tokenIn,
        address tokenOut,
        int24 tick,
        uint256 amount,
        bool isFlip
    ) external returns (uint256 orderId);

    function cancelOrder(uint256 orderId) external returns (uint256 refundedAmount);

    function modifyOrder(uint256 orderId, uint256 newAmount) external;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);

    function bestBid(address tokenA, address tokenB) external view returns (int24 tick, uint256 liquidity);

    function bestAsk(address tokenA, address tokenB) external view returns (int24 tick, uint256 liquidity);

    function liquidityAtTick(address tokenA, address tokenB, int24 tick, bool isBid)
        external view returns (uint256 liquidity);

    function getOrder(uint256 orderId)
        external view
        returns (address maker, address tokenIn, address tokenOut, uint256 amount, int24 tick, bool isFlip);
}
```

#### Actual Tempo DEX Interface

**Source:** https://docs.tempo.xyz/protocol/exchange/spec.md

```solidity
// ============================================
// CONSTANTS & PRICING
// ============================================

function PRICE_SCALE() external view returns (uint32);
function TICK_SPACING() external view returns (int16);
function MIN_TICK() external view returns (int16);
function MAX_TICK() external view returns (int16);
function MIN_PRICE() external view returns (uint32);
function MAX_PRICE() external view returns (uint32);

function tickToPrice(int16 tick) external pure returns (uint32 price);
function priceToTick(uint32 price) external pure returns (int16 tick);

// ============================================
// PAIRING & ORDERBOOK
// ============================================

function pairKey(address tokenA, address tokenB) external pure returns (bytes32 key);
function createPair(address base) external returns (bytes32 key);

function books(bytes32 pairKey)
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
// INTERNAL BALANCES
// ============================================

function balanceOf(address user, address token) external view returns (uint128);
function withdraw(address token, uint128 amount) external;

// ============================================
// ORDER PLACEMENT & LIFECYCLE
// ============================================

function place(address token, uint128 amount, bool isBid, int16 tick)
    external returns (uint128 orderId);

function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick)
    external returns (uint128 orderId);

function cancel(uint128 orderId) external;

function cancelStaleOrder(uint128 orderId) external;

function nextOrderId() external view returns (uint128);

// ============================================
// SWAPS & QUOTING
// ============================================

function quoteSwapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn)
    external view returns (uint128 amountOut);

function quoteSwapExactAmountOut(address tokenIn, address tokenOut, uint128 amountOut)
    external view returns (uint128 amountIn);

function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut)
    external returns (uint128 amountOut);

function swapExactAmountOut(address tokenIn, address tokenOut, uint128 amountOut, uint128 maxAmountIn)
    external returns (uint128 amountIn);

// ============================================
// EVENTS
// ============================================

event PairCreated(bytes32 indexed key, address indexed base, address indexed quote);

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
```

#### Critical Signature Mismatches

| Function | Our Assumption | Actual Tempo | Severity |
|----------|----------------|--------------|----------|
| **Place Order** | `placeOrder(tokenIn, tokenOut, int24, uint256, bool)` | `place(token, uint128, bool isBid, int16)` | 🔴 CRITICAL |
| **Flip Order** | Same function with `isFlip` param | Separate `placeFlip(token, uint128, bool, int16, int16)` | 🔴 CRITICAL |
| **Cancel** | `cancelOrder(uint256) returns uint256` | `cancel(uint128)` void return | 🔴 CRITICAL |
| **Token semantics** | Two tokens: `tokenIn/tokenOut` | Single token + `isBid` direction | 🔴 CRITICAL |
| **Tick type** | `int24` | `int16` | 🟡 MAJOR |
| **Amount/ID type** | `uint256` | `uint128` | 🟡 MAJOR |
| **Modify order** | `modifyOrder()` exists | ❌ NO SUCH FUNCTION | 🔴 CRITICAL |
| **Best bid/ask** | `bestBid(tokenA, tokenB)` returns `(int24, uint256)` | Inside `books()` returns `(int16, int16)` ticks only | 🟡 MAJOR |
| **Get order** | `getOrder(uint256)` returns full struct | ❌ NO SUCH FUNCTION | 🟡 MAJOR |

---

## Section 2: Tick Math Definition

**Status:** ✅ EXTRACTED

**Source:** https://docs.tempo.xyz/protocol/exchange/providing-liquidity

### 2.1 Tick Scaling Formula

```
tick = (price - 1) × 100_000
```

**Precision:** 0.1 basis point (0.001%)

**Example:**
- Price 1.0001 → tick = 10
- Price 1.0100 → tick = 1000
- Price 0.9900 → tick = -1000

### 2.2 Tick Range & Constraints

**Range:** ±2000 ticks from peg
**Price Range:** ±2% from 1.0

| Tick | Price | Deviation |
|------|-------|-----------|
| -2000 | 0.98 | -2% |
| 0 | 1.00 | 0% (peg) |
| +2000 | 1.02 | +2% |

**✅ Our assumption was CORRECT** for range, but precision was off:
- We assumed: 1 tick = 1 basis point (0.01%)
- Actual: 1 tick = 0.1 basis point (0.001%) - **10x more precise**

### 2.3 Bid/Ask Orientation

**Actual Tempo:**
- Tick is a **price level**, NOT a direction indicator
- Direction set by `bool isBid` parameter
- Same tick can have both bid and ask orders

**Example:**
```solidity
place(USDC, 1000e18, true, 50);   // Bid at tick 50 (price 1.0005)
place(USDT, 1000e18, false, 50);  // Ask at tick 50 (price 1.0005)
```

**🔴 CRITICAL MISMATCH:** We conflated tick sign with order direction. Wrong.
- Our model: positive tick = bid, negative = ask
- Reality: tick = price level, `isBid` = direction

---

## Section 3: Order Lifecycle

**Status:** ✅ EXTRACTED

**Source:** https://docs.tempo.xyz/protocol/exchange/providing-liquidity

### 3.1 Order Placement

**Actual Tempo Model:**

1. **Approval:** IERC20(token).approve(dex, amount) OR use existing DEX balance
2. **Placement:** `place(token, amount, isBid, tick)`
3. **Immediate debit:** Tokens transferred from user → DEX internal balance
4. **Order book:** Order becomes visible, enters price-time priority queue

**Token Flow:**
```
User's wallet → DEX internal balance (immediate)
DEX holds tokens until fill or cancel
```

**Custody:**
- ✅ DEX takes custody on placement
- ✅ User retains beneficial ownership
- ✅ Can cancel own orders only (canceling others reverts)

### 3.2 Order Matching

**Priority:** Price-time priority
- Better-priced orders fill first
- Within same price, earlier orders fill first

**Partial Fills:** ✅ Supported
- Orders can be partially filled
- Unfilled portion remains on book

**Settlement:**
- Filled amount → credited to taker immediately
- Proceeds → credited to maker's DEX internal balance
- Maker can withdraw proceeds anytime

### 3.3 Order Cancellation

**Actual Flow:**

```solidity
cancel(orderId);  // Returns void
```

**Refund mechanism:**
- Unfilled portion → returned to user's DEX internal balance
- **NO return value** - must query balanceOf() to check refund
- Immediate refund (no waiting period)
- No cancellation fees

**🔴 CRITICAL MISMATCH:** We assumed `cancelOrder()` returns refunded amount. Reality: returns void.

### 3.4 Order Expiry

**Our Model:** No expiry

**Actual Tempo:**
- `cancelStaleOrder(orderId)` exists
- Staleness criteria: [NEED TO EXTRACT]
- Anyone can call it for stale orders
- Purpose: Clean up abandoned orders

**Status:** ⚠️ Staleness definition not yet found in docs

---

## Section 4: Flip Order Mechanics

**Status:** ✅ EXTRACTED

**Source:** https://docs.tempo.xyz/protocol/exchange/providing-liquidity

### 4.1 Flip Order Creation

```solidity
placeFlip(token, amount, isBid, tick, flipTick)
```

**Tick Constraints:**
- **Bid flip orders:** `flipTick > tick` (flip to higher ask price)
- **Ask flip orders:** `flipTick < tick` (flip to lower bid price)

**Example:**
```solidity
// Bid flip: Buy at 0.999, flip to sell at 1.001
placeFlip(USDC, 1000e18, true, -100, 100);

// Ask flip: Sell at 1.001, flip to buy at 0.999
placeFlip(USDC, 1000e18, false, 100, -100);
```

### 4.2 Flip Execution

**Trigger:** Automatic on **complete fill**
- Partial fills do NOT trigger flip
- Must be 100% filled to flip

**Flip Process:**
1. Original order completely filled
2. System automatically creates new order at `flipTick`
3. **Same token amount** as original
4. **Opposite direction** (bid→ask or ask→bid)
5. **New order ID** generated
6. Process repeats indefinitely

**Revenue Model:**
- Earn spread between tick and flipTick on each cycle
- Example: Buy at -100 (0.999), sell at +100 (1.001) = 0.2% spread per cycle

### 4.3 Flip Order Failures

**What if flip fails?**
- [NEED TO EXTRACT] - Docs don't specify
- Possible scenarios:
  - Insufficient balance after fill → flip reverts?
  - Proceeds from fill used for flip?
  - Order just ends?

**Status:** ⚠️ Failure handling not documented

### 4.4 Critical Mismatches

**🔴 Our Model vs Reality:**

| Our Assumption | Actual Tempo |
|----------------|--------------|
| Single `placeOrder()` with `isFlip` flag | Separate `placeFlip()` function |
| No `flipTick` parameter | `flipTick` required and constrained |
| Flip after partial fill | Flip only on **complete** fill |
| Same order ID | New order ID on each flip |
| Undefined flip direction | Automatic opposite direction |

---

## Section 5: Minimum Order Size Enforcement

**Status:** ✅ EXTRACTED

**Source:** https://docs.tempo.xyz/protocol/exchange/spec

### 5.1 Tempo DEX Minimum Order Size

**Finding:** ❌ NO explicit minimum order size enforced by Tempo DEX

**What the specification shows:**
- `place()` function accepts `uint128 amount` parameter
- No documented floor on amount value
- Only constraints are:
  - Tick bounds: ±2000
  - Tick spacing: divisible by 10
  - Authorization: maker must be authorized by TIP-403 transfer policies

**Practical limits:**
- Token precision (typically 6-18 decimals)
- Transaction costs make dust orders uneconomical
- No documented error for "amount too small"

### 5.2 Our Implementation

**Our Assumption:**
```solidity
uint256 public constant MIN_ORDER_SIZE = 100e18; // $100 USD
```

**Status:** ✅ VALID - This is OUR business logic constraint, not Tempo's
- We can enforce this in DexStrategy as a risk control
- Prevents dust orders and gas waste
- Not contradicted by Tempo protocol

**🟢 NO MISMATCH:** Our MIN_ORDER_SIZE is a valid additional constraint

---

## Section 6: pathUSD Routing Semantics

**Status:** ✅ EXTRACTED

**Source:** https://docs.tempo.xyz/protocol/exchange/quote-tokens

### 6.1 Quote Token Model

**Structure:**
- Each TIP-20 stablecoin selects ONE quote token
- Forms tree structure (not mesh)
- Guarantees single path between any two tokens

**pathUSD Role:**
- Optional routing infrastructure (NOT mandatory)
- Serves as fallback gas token
- NOT intended as consumer-facing stablecoin
- Quote: "Use of pathUSD is optional"

### 6.2 Multi-Hop Routing

**Automatic Routing:**
- Example: USDX → USDY
- Route: USDX → pathUSD → USDY (if both quote pathUSD)
- Atomic execution in single transaction
- Tree structure ensures single path

**Liquidity Concentration:**
- Tree prevents fragmentation
- Liquidity concentrates at quote token pairs
- Efficient pricing even for thin pairs

### 6.3 Pair Identification

**Key Insight:** Pairs identified by `bytes32 pairKey`
```solidity
bytes32 key = pairKey(tokenA, tokenB);  // Order-independent
```

**Not all pairs exist** - only base→quote pairs from TIP-20 definitions

**🔴 CRITICAL MISMATCH:** We assumed arbitrary tokenA/tokenB pairs. Reality: structured quote token relationships.

---

## Section 7: Fee Model

**Status:** ⚠️ NOT DOCUMENTED IN SPEC

**Source:** https://docs.tempo.xyz/protocol/exchange/spec

### 7.1 Finding

**Fee Model:** ❌ NOT specified in the DEX technical specification

**What the specification covers:**
- Order placement and execution mechanics
- Price-time priority matching
- Flip order mechanics
- Internal balance management
- Swap functionality
- Tick-based pricing

**What is NOT mentioned:**
- Maker fees
- Taker fees
- Fee rates
- Fee deduction points (from amount vs separate)
- Fee token denomination

### 7.2 Related Documentation

The documentation sitemap references: `/protocol/fees/` - "Pay transaction fees in any USD stablecoin on Tempo. No native token required."

**Implication:** Fees may exist at transaction/gas level, but DEX trading fees are not documented.

### 7.3 Risk Assessment

**Assumption Required:**
- If no trading fees documented → likely zero trading fees (maker/taker)
- Transaction fees paid in stablecoins (gas fees)
- No fee deduction from order amounts

**⚠️ REQUIRES VERIFICATION:**
- Test on Tempo Testnet to observe actual behavior
- Check if `place()` deducts fees from amount
- Monitor filled amounts to detect fee extraction
- Query Tempo team for authoritative fee schedule

**🟡 MODERATE RISK:** Unknown fee model could affect PnL calculations

---

## Section 8: Revert Patterns & Hooks

**Status:** ✅ EXTRACTED

**Source:** https://docs.tempo.xyz/protocol/exchange/spec

### 8.1 place() Revert Conditions

**Tick Validation:**
- `TICK_OUT_OF_BOUNDS` - tick not in [MIN_TICK, MAX_TICK] (±2000)
- `TICK_NOT_MULTIPLE_OF_SPACING` - tick not divisible by 10

**Authorization:**
- `UNAUTHORIZED` - maker not authorized by TIP-403 transfer policies of base/quote tokens
- `UNAUTHORIZED` - DEX contract not authorized by token transfer policies

**Pair Existence:**
- `PAIR_NOT_EXISTS` - pair doesn't exist and base token has no quoteToken()

**Implicit Reverts:**
- Token transfer failure if internal balance insufficient

### 8.2 placeFlip() Revert Conditions

**All place() conditions, plus:**

**Flip Tick Validation:**
- `FLIP_TICK_OUT_OF_BOUNDS` - flipTick not in [MIN_TICK, MAX_TICK]
- `FLIP_TICK_NOT_MULTIPLE_OF_SPACING` - flipTick not divisible by 10
- `FLIP_TICK_MUST_BE_GREATER_FOR_BID` - bid flip requires flipTick > tick
- `FLIP_TICK_MUST_BE_LESS_FOR_ASK` - ask flip requires flipTick < tick

**Flip Authorization:**
- `UNAUTHORIZED` - maker must be authorized at both placement time AND flip execution time

### 8.3 placeFlip() Silent Failures

**Critical Finding:** Flip orders can SILENTLY FAIL without reverting:

**Scenario 1: Insufficient Balance**
- On complete fill, new order drawn from maker's internal DEX balance
- If balance insufficient → flip DOES NOT execute
- No `transferFrom` attempted
- No revert - just no new order created

**Scenario 2: Lost Authorization**
- If maker becomes unauthorized before flip executes
- Flip DOES NOT execute
- No revert - order just ends

**🔴 CRITICAL IMPLICATION:**
- Cannot assume flip orders will execute
- Must monitor internal DEX balance
- Must maintain authorization continuously
- Must handle "flip didn't happen" scenario

### 8.4 cancel() Revert Conditions

**Order Ownership:**
- `UNAUTHORIZED` - caller is not the original order maker

**Order Existence:**
- Implicit revert on invalid orderId

**Successful Cancellation:**
- Order removed from tick queue
- Liquidity decremented at tick
- Remaining escrow refunded to maker's DEX internal balance
- Balance immediately withdrawable

### 8.5 cancelStaleOrder() Mechanics

**Callable by:** Anyone (not just maker)

**Revert Condition:**
- `ORDER_NOT_STALE` - maker is still authorized by TIP-403 transfer policy

**Staleness Definition:**
- Maker is forbidden by TIP-403 transfer policy of escrowed token
- Policy change makes order "stale"

**Effect:**
- Order removed
- Escrow refunded to maker's internal balance

### 8.6 Pre-conditions Summary

**Before place() or placeFlip():**
1. ✅ Maker authorized by both base and quote token transfer policies
2. ✅ DEX authorized by both token transfer policies
3. ✅ Tick within ±2000 range
4. ✅ Tick divisible by 10
5. ✅ (Flip only) flipTick constraints met
6. ✅ Sufficient balance (internal DEX + wallet) to escrow

**Before cancel():**
1. ✅ Caller is order maker
2. ✅ Order ID exists

**No Reentrancy Guards Documented:**
- Specification does not mention reentrancy protection
- Assume standard CEI (Checks-Effects-Interactions) pattern

**No Required Callbacks:**
- No hooks or callback requirements mentioned
- Straight-through execution model

### 8.7 Critical Mismatches

**🔴 Our Code vs Reality:**

| Our Assumption | Actual Tempo |
|----------------|--------------|
| Generic revert on failure | Specific named errors |
| Flip orders always execute | Silent failures possible |
| No authorization checks | TIP-403 transfer policy gates |
| No staleness concept | cancelStaleOrder() exists |
| Reentrancy guards | Not documented (unknown) |

---

## Section 9: Internal Balance System

**Status:** ✅ EXTRACTED

**Source:** https://docs.tempo.xyz/protocol/exchange/providing-liquidity

### 9.1 DEX Balance Model

The DEX maintains internal balances for gas efficiency:

```solidity
function balanceOf(address user, address token) external view returns (uint128);
function withdraw(address token, uint128 amount) external;
```

### 9.2 Token Flow

**Order Placement:**
1. Check user's DEX balance first
2. If insufficient → transfer from wallet to DEX
3. Debit from DEX internal balance
4. Order active on book

**Order Fills:**
- Proceeds → credited to maker's DEX balance
- Taker pays from their balance (or wallet)

**Order Cancels:**
- Unfilled amount → refunded to user's DEX balance

**Withdrawals:**
- User calls `withdraw(token, amount)`
- Transfers from DEX balance → user wallet

### 9.3 Gas Optimization

**Quote from docs:** "Hold balances directly on the DEX to save gas costs on trades"

**Implication:** Vault should maintain DEX balances to avoid repeated transfers

**🔴 CRITICAL MISMATCH:**
- We assumed: Direct ERC20 transfers per order
- Reality: DEX internal balance accounting for efficiency
- **Impact:** Need to deposit to DEX first, manage balances, withdraw proceeds

---

## Section 10: Signature Mismatch Summary

### Functions We Assumed Exist (But DON'T)

1. ❌ `placeOrder(tokenIn, tokenOut, tick, amount, isFlip)`
2. ❌ `modifyOrder(orderId, newAmount)`
3. ❌ `bestBid(tokenA, tokenB)` - data exists in `books()` but different structure
4. ❌ `bestAsk(tokenA, tokenB)` - data exists in `books()` but different structure
5. ❌ `getOrder(orderId)` - no order lookup function visible

### Functions That Exist (But We Don't Use)

1. ✅ `place(token, amount, isBid, tick)`
2. ✅ `placeFlip(token, amount, isBid, tick, flipTick)`
3. ✅ `cancel(orderId)`
4. ✅ `balanceOf(user, token)` - internal balance tracking
5. ✅ `withdraw(token, amount)` - withdraw from internal balance
6. ✅ `createPair(base)` - pair creation (we never call this)
7. ✅ `cancelStaleOrder(orderId)` - anyone can cancel stale orders

### Type Mismatches

| Our Code | Tempo Reality |
|----------|---------------|
| `uint256 orderId` | `uint128 orderId` |
| `uint256 amount` | `uint128 amount` |
| `int24 tick` | `int16 tick` |
| `address tokenIn, tokenOut` | `address token` + `bool isBid` |

---

## Section 11: Phase 1 Completion Summary

### ✅ Extraction Complete

All ground truth extracted from official Tempo documentation:

1. ✅ **Tick math constants** - PRICE_SCALE = 100_000, TICK_SPACING = 10, MIN/MAX_TICK = ±2000
2. ✅ **Internal balance system** - balanceOf(), withdraw(), deposit flow documented
3. ✅ **Flip order mechanics** - placeFlip() signature, flipTick constraints, silent failures
4. ⚠️ **Fee model** - NOT in spec, requires testnet testing
5. ✅ **Order lifecycle** - Placement → Matching → Settlement → Cancellation mapped
6. ✅ **Revert conditions** - All named errors and pre-conditions identified

### Documentation Sources Used

- ✅ https://docs.tempo.xyz/protocol/exchange/spec (main spec)
- ✅ https://docs.tempo.xyz/protocol/exchange/providing-liquidity (liquidity guide)
- ✅ https://docs.tempo.xyz/protocol/exchange/quote-tokens (quote token semantics)
- ⚠️ /protocol/fees/ - referenced but fee model not in DEX spec
- 🔲 Viem SDK: `import { Abis } from 'viem/tempo'` - not yet queried
- 🔲 Tempo source code - if available

### Next Phase

**Phase 2:** Create ARCHITECTURE_DELTA_REPORT.md
- Analyze each module against ground truth
- Mark deltas as Critical/Major/Minor/Cosmetic
- Identify required changes for each contract

---

## Current Risk Assessment

| Risk Area | Severity | Details |
|-----------|----------|---------|
| **Interface signatures** | 🔴 CRITICAL | Every function signature is wrong |
| **Token semantics** | 🔴 CRITICAL | tokenIn/Out model doesn't match isBid model |
| **Flip order logic** | 🔴 CRITICAL | Wrong function, missing flipTick parameter |
| **Tick math** | 🔴 CRITICAL | Type mismatch (int24 vs int16), unknown scaling |
| **Internal balances** | 🔴 CRITICAL | May require deposit/withdraw flow we don't have |
| **Order lifecycle** | 🟡 MAJOR | Unknown settlement mechanics |
| **Fee model** | 🟡 MAJOR | Unknown who pays, when, how much |
| **Revert patterns** | 🟡 MAJOR | Unknown error conditions |

**Conclusion:** DexStrategy.sol is fundamentally incompatible with Tempo DEX. Full rewrite required.

---

## Section 12: Outstanding Questions

**Questions requiring testnet verification:**

1. **Fee Model:**
   - Are there maker/taker fees on DEX trades?
   - What are the fee rates?
   - Where are fees deducted?

2. **Flip Order Failures:**
   - How to detect flip didn't execute?
   - Any event emitted on silent failure?
   - Best practice for monitoring flip status?

3. **Internal Balance Efficiency:**
   - Gas cost comparison: deposit once vs transfer per order
   - Recommended balance management strategy
   - Withdrawal gas costs

4. **TIP-403 Transfer Policies:**
   - What are typical authorization requirements?
   - Can authorization be revoked mid-order?
   - How to monitor authorization status?

**Resolved by extraction:** All core interface, signature, type, and mechanics questions answered.

---

*Status: ✅ Phase 1 COMPLETE - Ground truth extraction finished. Ready for Phase 2: Architecture Delta Analysis*

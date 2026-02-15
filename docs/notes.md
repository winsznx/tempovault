# Notes: TempoVault Production Readiness

## Sources

### Source 1: VERIFICATION_CHECKLIST.md
- Location: /Users/macbook/tempovault/VERIFICATION_CHECKLIST.md
- Key requirements:
  - Integration tests required (TreasuryVault ↔ DexStrategy, RiskController ↔ DexStrategy, TreasuryVault ↔ LendingModule)
  - Offchain services must be tested (Risk Signal Engine, Oracle Relay)
  - Testnet deployment required
  - End-to-end flow required: deposit → deploy → adjust → unwind → withdraw
  - Gas usage targets defined
  - Event emission verification required

### Source 2: TEMPO_VERIFICATION_STATUS.md
- Location: /Users/macbook/tempovault/TEMPO_VERIFICATION_STATUS.md
- **CRITICAL**: ITempoOrderbook.sol is 100% UNVERIFIED
- All assumptions about Tempo DEX interface need verification:
  - Function signatures (placeOrder, cancelOrder)
  - Parameter types (uint256 vs bytes32 for orderId)
  - Return types
  - Tick mechanics (range, spacing, bid/ask)
  - Order requirements (min/max sizes)
  - Flip order behavior
- Risks if interface is wrong:
  - DexStrategy.deployLiquidity() will fail
  - Cannot place or cancel orders
  - Potential fund loss if approval succeeds but calls fail

### Source 3: Tempo Chain Configuration (CORRECTED)
- **Deployment Target:** Tempo Chain (its own payments-optimized blockchain)
- **NOT Abstract Chain** - Tempo is a standalone blockchain
- **Testnet Chain ID:** 42431
- **Testnet RPC:** https://rpc.moderato.tempo.xyz
- **Testnet Explorer:** https://explore.tempo.xyz
- **Testnet Currency:** USD (fees paid in stablecoins)
- **Block time:** ~0.5 seconds (fast finality)
- **Consensus:** Simplex BFT (deterministic finality)
- **CRITICAL:** Tempo Stablecoin DEX is a **predeployed system contract** at `0xdec0000000000000000000000000000000000000`

### Source 4: Offchain Services
- Risk Signal Engine: FastAPI service on port 8080
  - Endpoints: /health, /risk-signal/{pair_id}
  - Computes pegDeviation, orderbookDepthBid, orderbookDepthAsk
  - Requires TEMPO_API_URL environment variable
- Oracle Relay: Python service
  - Signs oracle signals with EIP-712
  - Submits to RiskController.updateOracleSignal
  - Requires: RPC_URL, ORACLE_PRIVATE_KEY, RISK_CONTROLLER_ADDRESS, RISK_ENGINE_URL

## Current Understanding

### What We Have
- ✅ 196 unit tests passing (90.48% branch coverage)
- ✅ All fuzz tests passing (10 properties)
- ✅ All invariant tests passing (8 invariants)
- ✅ Deployment scripts (Deploy.s.sol, ConfigureRoles.s.sol)
- ✅ Offchain services written (oracle_relay.py, risk_signal_engine.py)
- ✅ Dashboard frontend (React/Vite)

### What We're Missing
- ❌ Tempo DEX interface verification (BLOCKER)
- ❌ Integration tests (0 written)
- ❌ Testnet deployment (not done)
- ❌ Offchain services testing (not tested)
- ❌ End-to-end flow testing (not done)

### Critical Path
1. Verify Tempo DEX interface FIRST (if wrong, everything else fails)
2. Deploy to testnet
3. Test e2e flow with real Tempo DEX
4. Validate offchain services work
5. Add integration tests for safety

## Tempo DEX Interface - What to Verify

### placeOrder Function
Current assumption in ITempoOrderbook.sol:
```solidity
function placeOrder(
    address tokenIn,
    address tokenOut,
    int24 tick,
    uint256 amount,
    bool isFlip
) external returns (uint256 orderId);
```

Need to verify:
- [ ] Function name is "placeOrder"
- [ ] Parameter 1: tokenIn (address)
- [ ] Parameter 2: tokenOut (address)
- [ ] Parameter 3: tick (int24 or different type?)
- [ ] Parameter 4: amount (uint256)
- [ ] Parameter 5: isFlip (bool or does flip work differently?)
- [ ] Return type: uint256 or bytes32?
- [ ] Is it payable or non-payable?

### cancelOrder Function
Current assumption:
```solidity
function cancelOrder(uint256 orderId) external returns (uint256 refundedAmount);
```

Need to verify:
- [ ] Function name is "cancelOrder"
- [ ] Parameter: orderId (uint256 or bytes32?)
- [ ] Return type: uint256 refundedAmount or bool or void?
- [ ] Who can call: only order owner or permissionless?

### Tick Mechanics
Current assumptions:
- Range: -2000 to +2000 (±2% from peg)
- Positive tick = bid side
- Negative tick = ask side

Need to verify:
- [ ] Actual tick range
- [ ] Tick spacing requirements
- [ ] Bid vs ask orientation
- [ ] How ticks map to prices

### Order Requirements
Current assumptions:
- MIN_ORDER_SIZE = 100e18 (our constant)
- maxOrderSize from RiskController

Need to verify:
- [ ] Tempo's minimum order size (USD value or token amount?)
- [ ] Tempo's maximum order size (if any)
- [ ] Approval requirements
- [ ] Fee structure

## Findings (To Be Updated)

### Phase 1 Findings - ✅ COMPLETE

**Phase 1.1: Locate Tempo DEX Contract Address - ✅ RESOLVED**

**Phase 1.2: Extract Real Tempo DEX Interface - ✅ COMPLETE**

Real interface fetched from https://docs.tempo.xyz/protocol/exchange/spec:

```solidity
// Order placement
function place(address token, uint128 amount, bool isBid, int16 tick)
    external returns (uint128 orderId);

function placeFlip(address token, uint128 amount, bool isBid, int16 tick, int16 flipTick)
    external returns (uint128 orderId);

// Order cancellation
function cancel(uint128 orderId) external;

// Swaps
function swapExactAmountIn(address tokenIn, address tokenOut, uint128 amountIn, uint128 minAmountOut)
    external returns (uint128 amountOut);

// Internal balances
function balanceOf(address user, address token) external view returns (uint128);
function withdraw(address token, uint128 amount) external;
```

**Phase 1.3: Compare with ITempoOrderbook.sol - ❌ MAJOR MISMATCHES FOUND**

| What We Assumed | What's Real | Status |
|----------------|-------------|--------|
| `placeOrder(tokenIn, tokenOut, int24 tick, uint256 amount, bool isFlip)` | `place(token, uint128 amount, bool isBid, int16 tick)` | ❌ WRONG |
| `cancelOrder(uint256 orderId) returns uint256` | `cancel(uint128 orderId)` void | ❌ WRONG |
| Single function for flip orders | Separate `placeFlip(...)` function | ❌ WRONG |
| `tokenIn/tokenOut` semantics | Single `token` + `isBid` boolean | ❌ WRONG |
| `int24 tick` | `int16 tick` | ⚠️ Type mismatch |
| `uint256 amounts/IDs` | `uint128 amounts/IDs` | ⚠️ Type mismatch |

**CONCLUSION:** Our ITempoOrderbook.sol is **100% incompatible** with real Tempo DEX.

**Phase 1.1: Locate Tempo DEX Contract Address - RESOLVED**

**✅ FOUND: Tempo Stablecoin DEX is a PREDEPLOYED SYSTEM CONTRACT**

From Tempo documentation (https://docs.tempo.xyz/quickstart/predeployed-contracts):

| Contract | Address | Description |
|----------|---------|-------------|
| **Stablecoin DEX** | `0xdec0000000000000000000000000000000000000` | Enshrined DEX for stablecoin swaps |
| **Fee Manager** | `0xfeec000000000000000000000000000000000000` | Handle fee payments and conversions |
| **TIP-20 Factory** | `0x20fc000000000000000000000000000000000000` | Create new TIP-20 tokens |
| **pathUSD** | `0x20c0000000000000000000000000000000000000` | First stablecoin deployed |

**Key Insights:**
1. **Tempo DEX is NOT a separate deployment** - it's built into the protocol
2. **Address:** `0xdec0000000000000000000000000000000000000` (predeployed)
3. **Network:** Tempo Chain (42431), NOT Abstract Chain
4. **Interface available in:**
   - Viem SDK: `import { Abis } from 'viem/tempo'` → `Abis.stablecoinDex`
   - Protocol spec: https://docs.tempo.xyz/protocol/exchange/spec
5. **Features:**
   - Price-time priority orderbook
   - Limit orders and flip orders
   - Multi-hop routing for stablecoin trading
   - Functions: placeOrder, cancelOrder, swap, etc.

**Verification Path:**
- ✅ Use Viem SDK to get official ABI: `Abis.stablecoinDex`
- ✅ Compare with our ITempoOrderbook.sol interface
- ✅ Test on Tempo Testnet (chain 42431) at address `0xdec0000000000000000000000000000000000000`

**Phase 1.4: Complete Ground Truth Extraction - ✅ COMPLETE**

All sections of TEMPO_PROTOCOL_ALIGNMENT.md completed:
- ✅ Section 1: DEX Contract Information
- ✅ Section 2: Tick Math Definition
- ✅ Section 3: Order Lifecycle
- ✅ Section 4: Flip Order Mechanics
- ✅ Section 5: Minimum Order Size Enforcement
- ✅ Section 6: pathUSD Routing Semantics
- ✅ Section 7: Fee Model (NOT in spec, requires testing)
- ✅ Section 8: Revert Patterns & Hooks
- ✅ Section 9: Internal Balance System

**Key Findings:**
1. ✅ Our MIN_ORDER_SIZE (100e18) is valid - Tempo has no documented minimum
2. ⚠️ Fee model NOT documented in DEX spec - requires testnet verification
3. 🔴 Flip orders can SILENTLY FAIL without reverting (insufficient balance or lost authorization)
4. ✅ Named error patterns extracted: TICK_OUT_OF_BOUNDS, UNAUTHORIZED, etc.
5. ✅ TIP-403 transfer policies gate order placement and execution
6. ✅ cancelStaleOrder() exists for cleaning up unauthorized orders

**Outstanding Questions (requires testnet):**
- Are there maker/taker fees?
- How to detect silent flip failures?
- Gas efficiency of internal balance management

### Phase 2 Findings - ✅ COMPLETE

**Phase 2: Architecture Delta Analysis - ✅ COMPLETE**

Created ARCHITECTURE_DELTA_REPORT.md analyzing all modules against Tempo protocol ground truth:

**🔴 CRITICAL Issues (Blocking):**
1. **ITempoOrderbook.sol** - 100% wrong interface
   - Every function signature wrong
   - All types wrong (uint256→uint128, int24→int16)
   - Missing functions: balanceOf(), withdraw(), placeFlip()
   - Functions that don't exist: modifyOrder(), bestBid(), bestAsk()

2. **DexStrategy.sol** - Major rewrite required
   - Order placement wrong (placeOrder → place/placeFlip)
   - Token semantics wrong (tokenIn/Out → token + isBid)
   - Missing internal balance management (balanceOf, withdraw)
   - Order cancellation wrong (expects return value, gets void)
   - Flip orders completely broken (wrong function, missing flipTick)

**🟡 MAJOR Issues:**
3. **DexStrategy.sol** - Validations missing
   - No tick range validation (±2000)
   - No tick spacing validation (÷10)
   - Order ID storage type mismatch

4. **RiskController.sol** - Type mismatches
   - Tick type wrong (int24 → int16)
   - Missing Tempo-specific validations

**🟢 MINOR Issues:**
5. **TreasuryVault.sol** - Documentation only
   - Need to document DEX internal balance model
   - No code changes required

6. **Oracle System** - Data source change
   - Should query DEX contract directly
   - Use books() and getTickLevel() functions

**Key Architectural Discoveries:**
- DEX internal balance system requires explicit deposit/withdraw flow
- Flip orders can silently fail (insufficient balance or lost authorization)
- Pair model is base/quote tree, not arbitrary tokenA/tokenB mesh
- Must use pairKey(tokenA, tokenB) for pair identification
- No order modification - must cancel + place new

### Phase 3 Findings - ✅ COMPLETE

**Phase 3: Detailed Refactor Plan - ✅ COMPLETE**

Created TEMPO_REFACTOR_PLAN.md with exact line-by-line changes for all files:

**Files to Modify:**
1. ✅ ITempoOrderbook.sol - Complete rewrite (delete old, create new)
2. ✅ DexStrategy.sol - Major rewrite (7 sections)
   - State variables (type updates)
   - Internal balance management (new functions)
   - Tick validation (new functions)
   - Order placement (complete rewrite)
   - Order cancellation (complete rewrite)
   - Flip order monitoring (new functions)
   - Event signatures (updates)
3. ✅ RiskController.sol - Type updates (4 sections)
4. ✅ oracle_relay.py - Data source change (query DEX contract)
5. ✅ MockTempoOrderbook.sol - New test mock
6. ✅ All test files - Complete rewrite needed (~30 files)
7. ✅ Deploy.s.sol - Minor updates
8. ✅ README.md - Documentation updates

**Implementation Estimates:**
- 🔴 Critical changes: ~4-6 hours
- 🟡 Major changes: ~2-3 hours
- 🟢 Minor changes: ~1 hour
- ✅ Test updates: ~3-4 hours
- **Total: ~10-14 hours**

**Migration Sequence:**
1. Create new ITempoOrderbook.sol
2. Update type definitions
3. Add internal balance management
4. Rewrite order placement
5. Rewrite order cancellation
6. Update RiskController
7. Update oracle relay
8. Rewrite tests
9. Deploy to Tempo Testnet
10. Verify e2e flow

**Risk Mitigation:**
- Internal balance management (funds stuck risk)
- Flip order silent failures (monitoring required)
- Type conversions (overflow checks)
- Tick validation (boundary testing)

**Success Criteria:**
- All contracts deploy to Tempo Testnet
- Orders place/cancel successfully
- Flip orders execute when funded
- Emergency unwind returns all capital
- Oracle updates work
- Full e2e flow: deposit → deploy → unwind → withdraw

**Next Steps:**
- User approval required before implementation
- No coding until all 3 phases approved
- Ready to implement when authorized

### Phase 3 Findings
(Will be populated during deployment)

### Phase 4 Findings
(Will be populated during offchain services setup)

### Phase 5 Findings
(Will be populated during e2e testing)

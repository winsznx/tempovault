# Implementation Notes: TempoVault Production Completion

## Key Findings from Documentation Review

### Current State (Verified)
- **Contracts**: All 6 deployed to Tempo Testnet (addresses in .env)
- **Oracle**: Querying DEX directly via RPC, signing EIP-712, submitting signals
- **API**: All endpoints working (balance, exposure, P&L, risk, events, WebSocket)
- **Dashboard**: React + wagmi framework exists with 5 read-only components

### Critical Gaps (Must Fix)
1. **Event Indexer Stubbed**: Lines 230-233 in `offchain/event_indexer.py` just have `pass`
2. **ActiveOrders Broken**: Component renders but never fetches data (orders[] always empty)
3. **No Write Operations**: Users cannot deposit, withdraw, deploy, or unwind via UI
4. **No Auth Options**: Only WalletConnect (high friction for demos)
5. **No Role Awareness**: UI doesn't know if user is strategist/emergency

## Hackathon Context (CRITICAL)

### Track: Stablecoin Infrastructure (Track 2)
**TempoVault's Position**:
- **Primary Category**: Treasury & Corporate → "DAO Treasury Management"
- **Secondary Categories**:
  - DEX Tools → "Market Making Bot" (our automated flip orders)
  - Yield & Lending → "Fixed-Rate Lending Protocol" (our lending module)

**Why This Wins**:
- ✅ Solves real problem: Institutional treasuries need yield without complexity
- ✅ Multi-strategy approach: MM + Lending (not just one feature)
- ✅ Production-grade: Risk controls, governance, emergency stops
- ✅ Tempo-native: Uses flip orders, internal balances, parallel transactions
- ✅ Demonstrates all Track 2 features: DEX, lending, treasury management

**Competition Analysis**:
Most projects will be single-feature (just MM bot OR just lending). TempoVault combines:
1. Treasury management (deposits, withdrawals, fee accrual)
2. Automated market making (flip orders, spread capture)
3. Fixed-rate lending (overcollateralized, liquidation)
4. Risk management (exposure limits, circuit breakers)
5. Institutional governance (multi-role, emergency controls)

### Hackathon Requirements (NON-NEGOTIABLE)

**MUST Use Privy**:
> "We require you to use **Privy** for your wallet infrastructure in this track!"

This is not optional. Every project MUST integrate Privy.

**Key Features to Leverage** (from hackathon guide):
| Feature | How TempoVault Uses It |
|---------|----------------------|
| Limit orders | Deploy liquidity at specific ticks |
| **Flip orders** | **Core strategy - automated market making** |
| Swaps | Emergency liquidations, rebalancing |
| TIP-20 creation | Could create institutional treasury token |
| Role-based access | **Already implemented** - Admin/Strategist/Emergency roles |

**Judging Criteria** (from problem statement):
1. **Technical Implementation** (30%) - Does it work? Good code quality?
2. **Innovation** (25%) - Is it meaningfully different?
3. **User Experience** (20%) - Low friction, clear value prop?
4. **Ecosystem Impact** (25%) - Does Tempo ecosystem benefit?

**How TempoVault Scores**:
- **Technical**: ✅ All contracts deployed, oracle working, E2E flow functional
- **Innovation**: ✅ Multi-strategy institutional vault (unique combination)
- **UX**: ⚠️ Needs Privy for low-friction login, polished dashboard
- **Ecosystem**: ✅ Brings institutional capital to Tempo, demonstrates advanced DEX features

## External Sources Analysis

### Tempo Documentation (docs.tempo.xyz)
**Key Insights**:
- DEX at predeployed address: `0xdec0000000000000000000000000000000000000`
- Chain ID: 42431 (testnet), 4217 (mainnet)
- RPC: `https://rpc.moderato.tempo.xyz`
- Internal balance system: must explicitly deposit/withdraw from DEX
- **Flip orders**: Core feature for market making (auto-reverse on fill)
- Tick math: `tick = (price - 1) × 100_000`, range ±2000, 0.1bp precision
- Minimum order: $100 USD equivalent

### Privy Documentation (docs.privy.io)
**Key Insights**:
- **REQUIRED for hackathon** - not optional
- Supports email, phone, social, passkeys for login
- Embedded wallet creation (no seed phrases needed)
- Can look up existing wallets by email/phone
- Works with wagmi v2 + viem v2
- Configuration for custom chains supported

### Example Repo (privy-next-tempo)
**Official Reference Implementation**:
- Next.js 15 with App Router
- PrivyProvider wraps entire app
- Uses `@privy-io/wagmi` connector
- Tempo chain configured in Privy config
- TIP-20 memo transfers with `stringToHex(memo)`
- Server-side user lookup via Privy API

**Dependency Versions** (MUST MATCH):
```json
{
  "@privy-io/react-auth": "latest",
  "@privy-io/wagmi": "latest",
  "viem": "2.x",
  "wagmi": "2.x",
  "tempo.ts": "latest"
}
```

### Technical Cheatsheet (from hackathon guide)

**Tempo SDK Patterns to Use**:
```typescript
// Use tempo.ts, not raw viem
import { Actions, Hooks } from 'tempo.ts/wagmi'
import { Tick } from 'viem/tempo'

// Flip orders (our core feature)
await client.dex.placeFlipSync({
  amount: parseUnits('100', 6),
  flipTick: Tick.fromPrice('1.01'),  // Where to flip to after fill
  tick: Tick.fromPrice('0.99'),      // Initial price
  token: alphaUsd,
  type: 'buy',
})

// Watch DEX events (for our ActiveOrders)
client.dex.watchOrderFilled({
  onOrderFilled: (args, log) => {
    // Update UI when orders fill
  }
})
```

**Privy Server-Side Pattern** (for institutional users):
```typescript
// Backend: Look up or create user wallet
const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET,
});

const user = await privy.users().getByEmailAddress({
  address: 'treasurer@institution.com'
});

const wallet = user.linked_accounts?.find(
  (account) => account.type === 'wallet'
);
```

## Architecture Decisions

### Decision 1: Keep Vite (Don't Switch to Next.js)
**Rationale**:
- Current dashboard already on Vite
- Privy works with any React framework
- Migration would add 4-6 hours with no UX benefit
- Can still use Privy patterns from example repo

### Decision 2: Dual Auth Strategy
**Implementation**:
```typescript
// Privy Provider wraps app
<PrivyProvider config={privyConfig}>
  <WagmiProvider>
    <App />
  </WagmiProvider>
</PrivyProvider>

// Auth selector component
<AuthModal>
  <button onClick={privy.login}>Login with Email/Social</button>
  <button onClick={connectWallet}>Connect Wallet</button>
</AuthModal>
```

### Decision 3: Role Detection via Contract Queries
**Implementation**:
```typescript
const useUserRole = (address: Address) => {
  const { data: isStrategist } = useReadContract({
    address: GOVERNANCE_ROLES_ADDRESS,
    abi: governanceAbi,
    functionName: 'hasRole',
    args: [STRATEGIST_ROLE, address]
  });

  const { data: isEmergency } = useReadContract({
    address: GOVERNANCE_ROLES_ADDRESS,
    abi: governanceAbi,
    functionName: 'hasRole',
    args: [EMERGENCY_ROLE, address]
  });

  return { isStrategist, isEmergency, isRegular: !isStrategist && !isEmergency };
};
```

### Decision 4: Tab-Based Navigation
**Structure**:
```
Dashboard
├── Overview (all users)
│   ├── VaultBalance
│   ├── ActiveOrders
│   ├── PnLChart
│   └── RiskStatus
├── Strategy (strategist only)
│   ├── ConfigureStrategy
│   ├── DeployLiquidity
│   └── ActiveDeployments
├── Risk (emergency only)
│   ├── RiskMetrics
│   ├── CircuitBreakerStatus
│   └── EmergencyUnwindButton
└── Admin (admin only)
    ├── RoleManagement
    └── SystemHealth
```

### Decision 5: Data Flow Pattern
```
Component → useQuery(API) → Initial Load
         ↓
WebSocket → Real-time Updates → State Update → Re-render
```

## Implementation Priorities (Revised for Hackathon)

### P0 (MUST HAVE - Required for Submission)
**These are non-negotiable for hackathon judging:**

1. **Privy Integration** (3 hours) - REQUIRED BY HACKATHON
   - Server-side: PrivyClient for user lookup
   - Client-side: PrivyProvider + wagmi integration
   - Email/phone login working
   - Institutional user flow (treasurer@company.com → wallet)

2. **Fix Event Indexer** (2 hours) - For P&L credibility
   - Implement proper event decoding
   - Populate database with historical data
   - API endpoints return real data

3. **User Flows - Institutional Focus** (4 hours)
   - Deposit modal (approve + deposit)
   - Withdraw modal (to treasurer address)
   - Deploy liquidity modal (strategist role)
   - Emergency unwind button (risk officer role)

4. **DEX Integration Showcase** (2 hours)
   - Fix ActiveOrders to show real flip orders
   - Add flip order status indicator
   - Show spread capture in real-time
   - Demonstrate Tempo-specific features

5. **Landing Page** (1.5 hours) - For judges
   - Clear value prop: "Institutional Treasury → Tempo DEX → Yield"
   - Live stats: TVL, Active Strategies, APY
   - Role-based signup: Treasurer, CFO, DAO Treasury Manager
   - Demo walkthrough

**Total: 12.5 hours**

### P1 (Should Have for Good Demo)
7. Add role detection (1 hour)
8. Build strategist panel (2 hours)
9. Add emergency unwind button (1 hour)
10. Add oracle health indicator (30 min)
**Total: 4.5 hours**

### P2 (Nice to Have for Polish)
11. Build landing page (2 hours)
12. Design system implementation (2 hours)
13. Empty states + error handling (1 hour)
14. Mobile responsive (1 hour)
**Total: 6 hours**

**Grand Total: 19 hours** (aligns with 21-hour estimate in plan)

## Technical Implementation Details

### Event Indexer Fix (Critical Path)
**File**: `offchain/event_indexer.py`
**Problem**: Lines 230-233 have stub implementations

**Solution Pattern**:
```python
# Load contract ABIs once at module level
vault_contract = w3.eth.contract(
    address=Web3.to_checksum_address(os.getenv("TREASURY_VAULT_ADDRESS")),
    abi=vault_abi
)

def index_block(conn, block_number):
    block = w3.eth.get_block(block_number, full_transactions=False)
    block_timestamp = block["timestamp"]

    # Get all logs for this block
    logs = w3.eth.get_logs({
        "fromBlock": block_number,
        "toBlock": block_number
    })

    for log in logs:
        try:
            # Try each contract/event type
            # Vault events
            try:
                event = vault_contract.events.Deposited().process_log(log)
                event_id = insert_event(conn, {
                    "block_number": block_number,
                    "block_timestamp": block_timestamp,
                    "transaction_hash": log['transactionHash'].hex(),
                    "log_index": log['logIndex'],
                    "event_type": "Deposited",
                    "contract_address": log['address'],
                    "decoded_data": event['args']
                })
                if event_id:
                    process_deposit_event(conn, event_id, event['args'],
                        datetime.fromtimestamp(block_timestamp))
            except web3.exceptions.MismatchedABI:
                pass  # Not this event type

            # Withdrawn event
            try:
                event = vault_contract.events.Withdrawn().process_log(log)
                # ... similar pattern
            except web3.exceptions.MismatchedABI:
                pass

            # Repeat for all event types...

        except Exception as e:
            print(f"Error processing log: {e}")
            continue

    conn.commit()
```

### Privy Integration Steps
**Files to Create**:
1. `dashboard/src/providers/PrivyProvider.tsx`
2. `dashboard/src/config/chains.ts` (Tempo chain config)
3. `dashboard/src/components/AuthModal.tsx`

**Pattern**:
```typescript
// chains.ts
export const tempoTestnet = {
  id: 42431,
  name: 'Tempo Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] }
  },
  blockExplorers: {
    default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' }
  }
};

// PrivyProvider.tsx
<PrivyProvider
  appId={import.meta.env.VITE_PRIVY_APP_ID}
  config={{
    loginMethods: ['email', 'sms', 'google', 'twitter', 'wallet'],
    appearance: {
      theme: 'dark',
      accentColor: '#3b82f6'
    },
    embeddedWallets: {
      createOnLogin: 'users-without-wallets'
    },
    supportedChains: [tempoTestnet]
  }}
>
  <WagmiConfig config={wagmiConfig}>
    {children}
  </WagmiConfig>
</PrivyProvider>
```

### Modal Component Pattern
**Reusable for Deposit, Withdraw, Deploy**:
```typescript
interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen, onClose, title, children
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

// Usage in DepositModal.tsx
const [step, setStep] = useState<'input' | 'approve' | 'deposit' | 'success'>('input');

return (
  <TransactionModal isOpen={isOpen} onClose={onClose} title="Deposit">
    {step === 'input' && <AmountInput onNext={() => setStep('approve')} />}
    {step === 'approve' && <ApproveStep onNext={() => setStep('deposit')} />}
    {step === 'deposit' && <DepositStep onSuccess={() => setStep('success')} />}
    {step === 'success' && <SuccessMessage />}
  </TransactionModal>
);
```

## Testing Strategy

### Unit Testing
- [ ] Test role detection hook with mock contract
- [ ] Test modal state transitions
- [ ] Test amount validation logic

### Integration Testing
- [ ] Test auth flow (Privy login → wallet creation)
- [ ] Test deposit flow (approve → deposit → balance update)
- [ ] Test withdraw flow (withdraw → balance update)
- [ ] Test deploy flow (deploy → orders appear)

### E2E Testing (Manual)
- [ ] Fresh user flow (email login → deposit → withdraw)
- [ ] Strategist flow (wallet login → deploy → monitor → recall)
- [ ] Emergency flow (unwind → verify funds returned)
- [ ] Oracle visibility (check health indicator updates)

## Risk Mitigation

### Risk 1: Privy + wagmi Version Conflicts
**Mitigation**: Use exact versions from privy-next-tempo example
**Fallback**: If issues persist, create minimal Privy wrapper without wagmi integration

### Risk 2: Event Indexer Complexity
**Mitigation**: Start with Deposited/Withdrawn events only, expand incrementally
**Fallback**: Use direct RPC queries if indexer proves too complex

### Risk 3: Time Overrun
**Mitigation**: Implement P0 features first, P1/P2 are optional
**Acceptance Criteria**: Minimal demo (P0) is sufficient for "judge-usable"

## Winning Strategy (Hackathon-Specific)

### Narrative to Emphasize
**Problem**: Institutional treasuries (DAOs, companies, protocols) hold millions in stablecoins earning 0% yield.

**Solution**: TempoVault automates treasury management with:
1. **Yield from Market Making**: Earn spreads via Tempo's flip orders
2. **Yield from Lending**: Fixed-rate returns on idle capital
3. **Risk Controls**: Institutional-grade limits and emergency stops
4. **Governance**: Role-based access (treasury manager, strategist, risk officer)

**Why Tempo**:
- Native DEX flip orders enable automated MM without external bots
- Internal balance system = gas-efficient position management
- Instant finality = real-time P&L tracking
- No native token = simplified treasury operations

### Features to Demo (Judge-Facing)

**60-Second Demo Flow**:
1. Login as treasurer@institution.com (Privy)
2. Deposit $1M USDC to vault
3. Strategist deploys $500K liquidity (flip orders at ±10bps)
4. Live dashboard shows: orders filling, spread capture, P&L updating
5. Emergency officer unwinds positions instantly
6. Treasurer withdraws capital + yield

**What Judges Will See**:
- ✅ Privy integration (required)
- ✅ Flip orders in action (Tempo-native feature)
- ✅ Multi-role governance (institutional use case)
- ✅ Real-time risk management (production-grade)
- ✅ Working E2E flow (technical credibility)

### Differentiation from Competition

Most projects will be:
- Single-feature demos (just a swap interface OR just a lending pool)
- Generic DeFi clones ported to Tempo
- No institutional focus

**TempoVault is different**:
- **Multi-strategy**: MM + Lending in one vault
- **Production-ready**: Already deployed, working oracle, real governance
- **Institutional-grade**: Risk controls, emergency stops, role-based access
- **Tempo-optimized**: Uses flip orders, internal balances, parallel transactions
- **Complete system**: Contracts + Oracle + Indexer + Dashboard + API

### Technical Scorecard (Self-Assessment)

**Technical Implementation (30%)**: 9/10
- ✅ All contracts deployed
- ✅ Oracle working
- ✅ API functional
- ⚠️ Dashboard needs polish
- ⚠️ Need Privy integration

**Innovation (25%)**: 8/10
- ✅ First multi-strategy institutional vault on Tempo
- ✅ Combines MM + Lending (unique)
- ✅ Production-grade risk controls
- ⚠️ Concept exists elsewhere (not net-new idea)

**User Experience (20%)**: 6/10 → TARGET 9/10
- ❌ Currently CLI-only for write operations
- ❌ No Privy (high friction)
- ✅ Read-only dashboard works
- 🎯 With Privy + UI flows → 9/10

**Ecosystem Impact (25%)**: 9/10
- ✅ Brings institutional capital to Tempo
- ✅ Demonstrates advanced DEX features (flip orders)
- ✅ Provides infrastructure others can build on
- ✅ Real utility (not just a toy)

**Projected Score**: 75-80% (strong contender for top 3)

With P0 implementation complete: **85-90% (high probability winner)**

## Next Steps (Immediate)

### Phase 1: Privy Setup (BLOCKING - Do First)
1. **Get Privy API Key**:
   - Sign up at dashboard.privy.io
   - Create app for "TempoVault"
   - Get APP_ID and APP_SECRET
   - Add to .env

2. **Install Dependencies**:
   ```bash
   cd dashboard
   npm install @privy-io/react-auth @privy-io/wagmi @privy-io/node tempo.ts
   ```

3. **Configure for Tempo**:
   - Add Tempo Testnet to Privy config
   - Set up embedded wallet creation
   - Test login flow

### Phase 2: Core Implementation (Sequential)
1. Event indexer fix (enables P&L credibility)
2. Privy auth (required by hackathon)
3. Deposit/Withdraw modals (basic user flow)
4. Deploy liquidity modal (strategist flow)
5. Fix ActiveOrders (show flip orders working)
6. Landing page (judge-facing narrative)

### Phase 3: Polish & Demo Prep
1. Add role indicators in UI
2. Add oracle health status
3. Add emergency unwind button
4. Test full judge demo flow
5. Record 60-second demo video
6. Write submission description

**Timeline**: 12-15 hours for hackathon-ready submission

## Questions for User

1. **Privy Account**: Do you have APP_ID and APP_SECRET? (I can guide you to get them)
2. **Branding**: Institutional focus - should we use professional colors (navy/white) vs crypto aesthetic?
3. **Demo Priority**: Focus on treasurer flow OR strategist flow for main demo?
4. **Submission Deadline**: When is the hackathon due?

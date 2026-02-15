# Task Plan: TempoVault Hackathon Winning Implementation

## Goal
Transform TempoVault into a **hackathon-winning submission** that demonstrates institutional-grade treasury management on Tempo with Privy auth, multi-strategy yield, and production-ready risk controls.

## Hackathon Context

**Track**: Stablecoin Infrastructure (Track 2)
**Category**: Treasury & Corporate → DAO Treasury Management + DEX Tools → Market Making Bot
**Required**: Privy wallet infrastructure (non-negotiable)

**Winning Strategy**:
- **Problem**: Institutional treasuries hold millions in stablecoins earning 0% yield
- **Solution**: Automated treasury management with MM + Lending + Risk Controls
- **Differentiation**: Only multi-strategy institutional vault (vs single-feature demos)
- **Tempo-Native**: Uses flip orders, internal balances, parallel transactions

**Judging Scorecard Target**:
- Technical (30%): 9/10 - All contracts deployed, oracle working, E2E functional
- Innovation (25%): 8/10 - First multi-strategy institutional vault on Tempo
- UX (20%): 9/10 - Privy + polished dashboard (CURRENTLY 6/10, needs work)
- Ecosystem (25%): 9/10 - Brings institutional capital, demonstrates advanced features

**Projected Score**: 85-90% with P0 complete (high probability winner)

## Current State Assessment

### ✅ What Works (Foundation)
- All 6 smart contracts deployed to Tempo Testnet
- Oracle relay querying DEX and submitting signals
- API server with all endpoints operational
- Dashboard framework (React + TypeScript + wagmi/viem)
- Read-only components: VaultBalance, RiskStatus, PnLChart, WalletConnect

### ❌ Critical Gaps (Blockers for Demo)
- **Event indexer**: Lines 230-233 stubbed (`pass` statements) - NO historical data
- **ActiveOrders.tsx**: Never fetches data - always shows "No active orders"
- **NO deposit UI**: Users cannot deposit via dashboard
- **NO withdraw UI**: Users cannot withdraw via dashboard
- **NO deploy liquidity UI**: Strategists cannot deploy via dashboard
- **NO emergency controls**: No unwind button
- **NO oracle health indicator**: Judges can't see oracle working
- **NO Privy auth**: Only WalletConnect (high friction for demo)
- **NO role-based UI**: Can't distinguish regular user vs strategist vs emergency

## Phases

### Phase 1: Planning & Architecture [CURRENT]
- [x] Read all local documentation
- [x] Read CODE_AUDIT_REPORT.md gap analysis
- [x] Fetch external sources (Tempo docs, Privy docs, example repo)
- [ ] Design role-based UI architecture
- [ ] Design auth flow (Privy + WalletConnect)
- [ ] Map component hierarchy and data flow
- [ ] Identify reusable patterns from privy-next-tempo example
- [ ] Create implementation checklist

### Phase 2: Data Layer Fixes (Foundation)
- [ ] 2.1: Fix event_indexer.py
  - [ ] Implement event decoding (web3.py contract.events)
  - [ ] Implement process_deposit_event() calls
  - [ ] Implement process_withdrawal_event() calls
  - [ ] Implement process_deployment_event() calls
  - [ ] Implement process_recall_event() calls
  - [ ] Implement process_loss_event() calls
  - [ ] Implement process_oracle_update_event() calls
  - [ ] Test indexer on deployed contracts
  - [ ] Verify events populate database

- [ ] 2.2: Fix ActiveOrders.tsx
  - [ ] Add API endpoint GET /api/strategy/{address}/orders/{pairId}
  - [ ] Implement order fetching logic in component
  - [ ] Add WebSocket subscription for real-time updates
  - [ ] Test with real deployed orders

### Phase 3: Authentication Layer (Privy - REQUIRED BY HACKATHON)
- [ ] 3.1: Privy Account Setup (BLOCKING)
  - [ ] Sign up at dashboard.privy.io
  - [ ] Create app: "TempoVault - Institutional Treasury"
  - [ ] Get PRIVY_APP_ID and PRIVY_APP_SECRET
  - [ ] Add to .env (both client and server vars)
  - [ ] Configure redirect URLs for localhost

- [ ] 3.2: Install Privy Dependencies
  - [ ] `npm install @privy-io/react-auth @privy-io/wagmi @privy-io/node`
  - [ ] `npm install tempo.ts viem@2.x wagmi@2.x @tanstack/react-query`
  - [ ] Verify version compatibility (viem 2.x, wagmi 2.x)

- [ ] 3.3: Implement Privy Provider (Client-Side)
  - [ ] Create dashboard/src/providers/PrivyProvider.tsx
  - [ ] Configure Tempo Testnet chain (42431)
  - [ ] Set login methods: ['email', 'wallet'] (institutional focus)
  - [ ] Enable embedded wallet creation
  - [ ] Test: email login → wallet created → address shown

- [ ] 3.4: Implement Server-Side User Lookup (for institutional users)
  - [ ] Create dashboard/src/api/find-user.ts (or backend endpoint)
  - [ ] Use PrivyClient.users().getByEmailAddress()
  - [ ] Auto-create user if doesn't exist
  - [ ] Return embedded wallet address
  - [ ] Test: treasurer@institution.com → 0xAddress

- [ ] 3.5: Institutional Login Flow
  - [ ] Create AuthModal with email input
  - [ ] "Login as Treasurer" vs "Connect Wallet" options
  - [ ] Server lookup: email → wallet address
  - [ ] Client login: Privy embedded wallet
  - [ ] Role detection: check GovernanceRoles for permissions

### Phase 4: Core User Flows (Write Operations)
- [ ] 4.1: Deposit Flow
  - [ ] Create dashboard/src/components/DepositModal.tsx
  - [ ] Implement 2-step flow: Approve → Deposit
  - [ ] Add token selector (test USDC address from env)
  - [ ] Add amount input with balance validation
  - [ ] Add transaction status states (pending, success, error)
  - [ ] Integrate with VaultBalance to refresh on success
  - [ ] Test E2E: open modal → approve → deposit → see balance update

- [ ] 4.2: Withdraw Flow
  - [ ] Create dashboard/src/components/WithdrawModal.tsx
  - [ ] Implement withdraw transaction
  - [ ] Add recipient input (default: connected address)
  - [ ] Add available balance check
  - [ ] Add success/error handling
  - [ ] Test E2E: withdraw → see balance decrease

- [ ] 4.3: Deploy Liquidity Flow (Strategist Only)
  - [ ] Create dashboard/src/components/DeployLiquidityModal.tsx
  - [ ] Add pair selector (fetch from API or hardcode test pair)
  - [ ] Add base amount, quote amount inputs
  - [ ] Add center tick input (with tick validation ±2000, divisible by 10)
  - [ ] Call DexStrategy.deployLiquidity()
  - [ ] Show deployed orders in ActiveOrders after success
  - [ ] Test E2E: configure → deploy → see orders appear

### Phase 5: Role-Based UI Architecture
- [ ] 5.1: Role Detection System
  - [ ] Create dashboard/src/hooks/useUserRole.ts
  - [ ] Query GovernanceRoles contract for connected address
  - [ ] Return { isStrategist, isEmergency, isAdmin, isRegular }
  - [ ] Cache results with React Query

- [ ] 5.2: Tab-Based Navigation
  - [ ] Create dashboard/src/components/TabNavigation.tsx
  - [ ] Tabs: Overview | Strategy | Risk | Admin
  - [ ] Hide/show tabs based on role
  - [ ] Add "Request Access" state for disabled tabs

- [ ] 5.3: Strategist Panel
  - [ ] Create dashboard/src/components/StrategistPanel.tsx
  - [ ] Section 1: Configure Strategy
    - [ ] Pair selection dropdown
    - [ ] Tick width input
    - [ ] Order size inputs
    - [ ] Flip orders toggle
    - [ ] Save configuration button
  - [ ] Section 2: Deploy Liquidity
    - [ ] Shows current allocation per pair
    - [ ] Deploy/Recall buttons
    - [ ] Utilization % display
  - [ ] Section 3: Active Deployments
    - [ ] List of all active pairs
    - [ ] Exposure per pair
    - [ ] Risk metrics per pair

### Phase 6: Emergency & Oracle Features
- [ ] 6.1: Emergency Unwind UI
  - [ ] Create dashboard/src/components/EmergencyUnwindButton.tsx
  - [ ] Role-gated to EMERGENCY_ROLE only
  - [ ] Confirmation dialog with warnings
  - [ ] Call emergencyUnwind(pairId)
  - [ ] Show loading → success → orders canceled → funds returned

- [ ] 6.2: Oracle Health Indicator
  - [ ] Create dashboard/src/components/OracleHealthIndicator.tsx
  - [ ] Fetch latest oracle update from RiskController
  - [ ] Show: timestamp, oracle address, staleness
  - [ ] Status: ✅ Healthy (< 5min) | ⚠️ Stale (5-10min) | ❌ Dead (> 10min)
  - [ ] Place in header or Risk tab

### Phase 7: Landing Page & Judge-Facing UX (CRITICAL FOR SCORING)
- [ ] 7.1: Landing Page (Judge-Facing Narrative)
  - [ ] Hero: "Institutional Treasury Management on Tempo"
  - [ ] Problem statement: "$X billion in DAO treasuries earning 0% yield"
  - [ ] Solution: "Multi-strategy vault: MM + Lending + Risk Controls"
  - [ ] Live stats: Total TVL, Active Flip Orders, Current APY, Spread Captured
  - [ ] Use cases: DAOs, Protocol Treasuries, Corporate Treasuries
  - [ ] CTA: "Login as Treasurer" (Privy email) vs "Connect Wallet"

- [ ] 7.2: Demo Walkthrough Section
  - [ ] 60-second flow diagram:
    1. Treasurer deposits $1M USDC
    2. Strategist deploys $500K to flip orders
    3. Orders fill → spread capture → P&L updates
    4. Emergency officer can unwind instantly
  - [ ] Live demo link with pre-funded testnet wallet
  - [ ] Video walkthrough (optional but helpful)

- [ ] 7.3: Tempo Integration Showcase
  - [ ] "Powered by Tempo DEX" section
  - [ ] Highlight flip orders (unique to Tempo)
  - [ ] Show internal balance efficiency
  - [ ] Demonstrate parallel transactions
  - [ ] Link to contracts on Tempo Explorer

- [ ] 7.2: Design System
  - [ ] Define color palette (no crypto gradients)
  - [ ] Typography scale
  - [ ] Button variants (primary, secondary, danger)
  - [ ] Card/panel styles
  - [ ] Status badge styles (success, warning, error)
  - [ ] Loading states (spinners, skeletons)

- [ ] 7.3: Empty States & Error Handling
  - [ ] Empty vault: "Deposit funds to get started"
  - [ ] No orders: "Deploy liquidity to see active orders"
  - [ ] Network error: Retry button + clear message
  - [ ] Transaction failures: Error details + support link

### Phase 8: Integration & E2E Testing
- [ ] 8.1: Test Complete User Journey (Regular User)
  - [ ] Login with Privy (email)
  - [ ] Network gate prompts Tempo testnet
  - [ ] Deposit 1,000 USDC
  - [ ] See vault balance update
  - [ ] See risk status display
  - [ ] Withdraw 500 USDC
  - [ ] Logout

- [ ] 8.2: Test Strategist Journey
  - [ ] Login with strategist wallet
  - [ ] See "Strategy" tab available
  - [ ] Configure USDC/pathUSD pair
  - [ ] Deploy 500 USDC liquidity
  - [ ] See orders in ActiveOrders
  - [ ] Check risk exposure
  - [ ] Recall liquidity

- [ ] 8.3: Test Emergency Journey
  - [ ] Login with emergency wallet
  - [ ] See "Emergency Unwind" button
  - [ ] Trigger unwind
  - [ ] Confirm orders canceled
  - [ ] Verify funds returned to vault

- [ ] 8.4: Test Oracle Visibility
  - [ ] Check oracle health indicator shows "Healthy"
  - [ ] Stop oracle service
  - [ ] Confirm indicator shows "Stale" after 5 minutes
  - [ ] Restart oracle
  - [ ] Confirm indicator recovers

### Phase 9: Documentation & Demo Script
- [ ] 9.1: Update COMPLETE_SYSTEM_SETUP.md
  - [ ] Add Privy setup steps
  - [ ] Update all UI flow instructions
  - [ ] Add role-based access notes

- [ ] 9.2: Create DEMO_SCRIPT.md
  - [ ] 30-second demo flow
  - [ ] 5-minute full demo flow
  - [ ] Troubleshooting common issues
  - [ ] Reset instructions between demos

- [ ] 9.3: Update README.md
  - [ ] Product overview
  - [ ] Quick start (one command)
  - [ ] Feature highlights
  - [ ] Architecture diagram

### Phase 10: Final Verification Checklist
- [ ] 10.1: Functional Requirements
  - [ ] User can login (Privy OR WalletConnect)
  - [ ] User can deposit via UI
  - [ ] User can withdraw via UI
  - [ ] User can see vault balance
  - [ ] User can see active orders
  - [ ] User can see P&L
  - [ ] User can see risk status
  - [ ] Strategist can configure strategy
  - [ ] Strategist can deploy liquidity
  - [ ] Emergency can unwind positions
  - [ ] Oracle health is visible

- [ ] 10.2: Data Correctness
  - [ ] Event indexer populating database
  - [ ] Historical events queryable
  - [ ] P&L calculations accurate
  - [ ] Balance updates reflect on-chain state
  - [ ] Order status matches DEX contract

- [ ] 10.3: UX Quality
  - [ ] No blank screens (loading states everywhere)
  - [ ] Error messages are helpful
  - [ ] Transactions show clear status
  - [ ] Role-based features clearly indicated
  - [ ] Design feels cohesive (not generic template)

- [ ] 10.4: Performance
  - [ ] Dashboard loads in < 2s
  - [ ] Transaction confirmations appear < 1s after on-chain
  - [ ] No unnecessary re-renders
  - [ ] WebSocket updates work smoothly

## Key Technical Decisions

### Auth Architecture
**Decision**: Dual auth (Privy + WalletConnect)
**Rationale**:
- Privy: Low friction for judges/demos (email/social login)
- WalletConnect: Power users with existing wallets
- Both integrate with same wagmi/viem stack

### Role Detection
**Decision**: Query GovernanceRoles contract on-chain
**Rationale**:
- Single source of truth (contract roles)
- No backend role management needed
- Real-time permission updates

### Component Structure
**Decision**: Tab-based navigation with role gating
**Rationale**:
- Clear separation of concerns
- Easy to show/hide based on role
- Familiar UX pattern

### Data Flow
**Decision**: API + WebSocket hybrid
**Rationale**:
- API for initial data load
- WebSocket for real-time updates
- Reduces polling overhead

## Critical Implementation Notes

### Event Indexer Fix (Phase 2.1)
**File**: `offchain/event_indexer.py`
**Lines to fix**: 230-233
**Current code**:
```python
if "Deposited" in str(log):
    pass  # <--- STUB
elif "Withdrawn" in str(log):
    pass  # <--- STUB
```

**Correct implementation**:
```python
# Decode event using contract ABI
vault_contract = w3.eth.contract(address=VAULT_ADDRESS, abi=vault_abi)
receipt = w3.eth.get_transaction_receipt(log['transactionHash'])

for event_log in receipt['logs']:
    try:
        # Try to decode as Deposited event
        event = vault_contract.events.Deposited().process_log(event_log)
        process_deposit_event(conn, event_id, event['args'], timestamp)
    except:
        pass

    try:
        # Try to decode as Withdrawn event
        event = vault_contract.events.Withdrawn().process_log(event_log)
        process_withdrawal_event(conn, event_id, event['args'], timestamp)
    except:
        pass
    # ... repeat for all event types
```

### Privy Integration Pattern (Phase 3)
**Reference**: privy-next-tempo example repo
**Key points**:
- Use `@privy-io/react-auth` for provider
- Use `@privy-io/wagmi` connector
- Configure Tempo chain in Privy config:
  ```typescript
  {
    id: 42431,
    name: 'Tempo Testnet',
    nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.moderato.tempo.xyz'] } }
  }
  ```

### Role-Based Rendering Pattern (Phase 5)
```typescript
const { isStrategist } = useUserRole();

return (
  <Tabs>
    <Tab label="Overview">...</Tab>
    {isStrategist && <Tab label="Strategy">...</Tab>}
  </Tabs>
);
```

## Errors to Anticipate

### Error 1: Privy + wagmi Version Mismatch
**Symptom**: "Hook called outside of PrivyProvider"
**Solution**: Use exact versions from privy-next-tempo:
- `viem@2.x`
- `wagmi@2.x`
- `@privy-io/react-auth@latest`

### Error 2: Event Indexer No Events
**Symptom**: Database empty even though transactions exist
**Solution**:
- Check contract addresses in indexer match deployed addresses
- Verify RPC_URL is correct
- Check block range (START_BLOCK may be too high)

### Error 3: Transaction Not Confirming
**Symptom**: Deposit/withdraw hangs on "pending"
**Solution**:
- Check user has gas token (testnet ETH)
- Verify contract addresses correct
- Check network is Tempo Testnet (42431)

## Success Criteria

### Minimal Demo (Phase 1-6 Complete)
- [ ] User can login (Privy)
- [ ] User can deposit via UI
- [ ] User can see balance + active orders
- [ ] Strategist can deploy liquidity
- [ ] Emergency can unwind

### Full Demo (All Phases Complete)
- [ ] Above + polished landing page
- [ ] Above + role-based UI
- [ ] Above + oracle health indicator
- [ ] Above + comprehensive error states
- [ ] Above + demo script ready

### Judge-Ready (Acceptance)
- [ ] Can complete full flow in 2 minutes
- [ ] No broken links or blank screens
- [ ] Clear value proposition on landing
- [ ] Works on mobile (responsive)
- [ ] Documentation complete

## Time Estimates

| Phase | Estimated Time |
|-------|---------------|
| Phase 1: Planning | 1 hour ✅ |
| Phase 2: Data Layer | 2 hours |
| Phase 3: Auth | 2 hours |
| Phase 4: User Flows | 4 hours |
| Phase 5: Role-Based UI | 3 hours |
| Phase 6: Emergency/Oracle | 2 hours |
| Phase 7: UX Polish | 3 hours |
| Phase 8: Testing | 2 hours |
| Phase 9: Documentation | 1 hour |
| Phase 10: Verification | 1 hour |
| **Total** | **21 hours** |

## Current Status

**Phase 1: Planning & Architecture** - IN PROGRESS

**Next Steps**:
1. Design role-based UI architecture
2. Map component hierarchy
3. Begin Phase 2: Fix event indexer

**Blockers**: None

**Questions for User**:
1. Should we use Next.js App Router (like privy-next-tempo) or keep Vite?
2. Any specific branding/design preferences?
3. Priority: Speed (minimal demo) or completeness (full demo)?

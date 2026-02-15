# TempoVault - Production Implementation Plan

**Last Updated**: 2026-02-15
**Goal**: Transform TempoVault into production-grade full-stack treasury management system
**Approach**: Reproducible local dev → Complete feature set → Production deployment ready

---

## COMPLETED WORKSTREAMS

### ✅ WS0: Contracts & Deployment
- All 6 contracts deployed to Tempo Testnet
- Addresses documented and verified
- Oracle operational, submitting risk signals
- No contract changes needed (audit-approved)

### ✅ WS1: Offchain Reproducibility
**Completed**: 2026-02-15

#### What Was Done:
- Created `.env.example` with all required environment variables
- Added Privy credentials (APP_ID + SECRET)
- Created `docker-compose.yml` for PostgreSQL
- Auto-initialization of database schema on first boot
- Updated `scripts/dev.sh` for one-command startup
- Added health checks and graceful degradation
- Validated pinned Python dependencies

#### Verification:
```bash
./scripts/dev.sh  # Starts PostgreSQL + API + Oracle + Indexer
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

#### Documentation:
- See `WS1_REPRODUCIBILITY_COMPLETE.md` for details

---

## IN PROGRESS WORKSTREAMS

### ⏳ WS2: Privy Authentication (CURRENT)

**Goal**: Implement production-grade authentication with Privy as primary method

**Credentials Available**:
- PRIVY_APP_ID: `cmln0qtl4010i0ckwxdf280w2`
- PRIVY_APP_SECRET: (in .env)

#### WS2.1: Install Dependencies
- [ ] Install `@privy-io/react-auth@^1.0.0`
- [ ] Install `@privy-io/wagmi@^0.2.0`
- [ ] Install `tempo.ts` (Tempo chain config)
- [ ] Verify compatibility with existing wagmi@2.5.0, viem@2.7.0

#### WS2.2: Privy Provider Setup
- [ ] Create `dashboard/src/providers/PrivyProvider.tsx`
- [ ] Configure Tempo Testnet (chain ID 42431, RPC, Explorer)
- [ ] Set login methods: email, wallet, social
- [ ] Enable embedded wallet creation
- [ ] Add session persistence

#### WS2.3: Update Authentication UI
- [ ] Modify `WalletConnect.tsx` → `AuthModal.tsx`
- [ ] Add Privy login as primary option
- [ ] Keep WalletConnect as "Use external wallet" option
- [ ] Add email/social login buttons
- [ ] Show embedded wallet creation flow

#### WS2.4: Server-Side Verification (Optional)
- [ ] Add `/api/v1/auth/verify` endpoint in API server
- [ ] Validate Privy access tokens
- [ ] Store user identity in session
- [ ] Use for role-based API access

**Acceptance Criteria**:
- User can login with email, embedded wallet created
- User can login with social (Google, Twitter, etc.)
- WalletConnect still works as fallback
- Session persists across page refresh
- No auth state flicker on page load

---

### 🔜 WS3: Frontend Production UI

**Goal**: Transform read-only dashboard into production-grade UI with write operations

#### WS3.1: Theme System & Design Tokens
- [ ] Create `dashboard/src/styles/theme.css` with CSS variables
- [ ] Implement "Institutional Ledger + Paper" theme
- [ ] Light mode: warm off-white paper, ink-black text, deep teal accent
- [ ] Dark mode: near-black graphite, off-white text, faint ledger grid
- [ ] Load fonts: IBM Plex Serif (headlines), IBM Plex Sans (UI), JetBrains Mono (addresses)
- [ ] Add subtle ledger grid texture (performance-safe, CSS-only)

#### WS3.2: Design System Components
- [ ] Button (primary/secondary/ghost/destructive variants)
- [ ] Card/Panel with ledger aesthetic
- [ ] StatTile for KPI display
- [ ] Badge for status indicators
- [ ] Modal/Drawer for transaction flows
- [ ] Stepper for multi-step flows (Approve → Confirm)
- [ ] TxToast for transaction states (pending/success/error)
- [ ] AddressChip with copy + explorer link
- [ ] RiskMeter with bar + threshold markers

#### WS3.3: Landing Page (`/`)
- [ ] Hero section: narrative + live stats from API
- [ ] "How It Works" (3-4 step cards)
- [ ] Strategy showcase (MM + Lending with diagrams)
- [ ] Risk & Controls section
- [ ] Deployed contracts footer with explorer links
- [ ] "Open Dashboard" CTA

#### WS3.4: Write Operations - Deposit/Withdraw
- [ ] Create `DepositModal.tsx`
  - Step 1: Amount input + token selector
  - Step 2: Token approval (show pending tx)
  - Step 3: Deposit (show pending tx)
  - Step 4: Success (show explorer link, update balance)
- [ ] Create `WithdrawModal.tsx`
  - Check available balance (not deployed)
  - Input recipient (default: connected address)
  - Execute withdraw, show status
  - Update balance on success

#### WS3.5: Write Operations - Strategy Management
- [ ] Create `DeployLiquidityModal.tsx`
  - Pair selection dropdown
  - Base/quote amounts input
  - Center tick input with validation (±2000, divisible by 10)
  - Preview: order count, spread, utilization
  - Execute deployLiquidity()
  - Show new orders in ActiveOrders
- [ ] Create `RecallLiquidityButton.tsx`
  - Confirm dialog
  - Execute recallFromStrategy()
  - Update balances

#### WS3.6: Emergency Controls
- [ ] Create `EmergencyUnwindButton.tsx`
  - Role-gated (EMERGENCY_ROLE only)
  - Heavy confirmation dialog with warnings
  - Execute emergencyUnwind(pairId)
  - Show funds returned to vault

#### WS3.7: Fix ActiveOrders Component
- [ ] Add API endpoint `GET /api/v1/strategy/{address}/orders/{pairId}`
- [ ] Query DexStrategy contract for active flip orders
- [ ] Display orders with tick, amount, side (bid/ask)
- [ ] Add WebSocket subscription for real-time updates

**Acceptance Criteria**:
- Landing page looks institutional (no generic templates)
- Users can deposit → deploy → withdraw end-to-end via UI
- All modals have proper loading/error states
- Transaction explorer links work
- ActiveOrders shows real data
- Design is bespoke (not shadcn defaults)

---

### 🔜 WS4: Role Detection & Protocol Operations

**Goal**: Add role-based UI and advanced protocol controls

#### WS4.1: Role Detection System
- [ ] Create `dashboard/src/hooks/useUserRole.ts`
- [ ] Query GovernanceRoles contract: hasRole(STRATEGIST_ROLE, address)
- [ ] Return { isAdmin, isStrategist, isEmergency, isViewer }
- [ ] Cache with React Query (5-minute stale time)

#### WS4.2: Role-Based UI
- [ ] Show role badge in header (Viewer/Strategist/Emergency/Admin)
- [ ] Hide/show Strategy tab based on isStrategist
- [ ] Hide/show Emergency controls based on isEmergency
- [ ] Add "Request Access" messaging for non-privileged users

#### WS4.3: Oracle Health Widget
- [ ] Create `OracleHealthIndicator.tsx`
- [ ] Fetch latest oracle update timestamp from RiskController
- [ ] Calculate staleness (current time - last update)
- [ ] Status indicators:
  - ✅ Healthy: < 2 minutes old
  - ⚠️ Stale: 2-5 minutes old
  - ❌ Dead: > 5 minutes old
- [ ] Show oracle address, last nonce

#### WS4.4: Risk Parameter Display
- [ ] Create `RiskLimitsPanel.tsx`
- [ ] Fetch from RiskController:
  - maxExposurePerPairBps
  - maxImbalanceBps
  - maxTickDeviationBps
  - minOrderbookDepth
- [ ] Display current vs limit (progress bars)
- [ ] Highlight when approaching limits (> 80%)

**Acceptance Criteria**:
- UI adapts to user's on-chain role
- Oracle health visible and accurate
- Risk limits displayed clearly
- Non-strategists see appropriate messaging

---

### 🔜 WS5: Testing & Verification

**Goal**: Comprehensive end-to-end testing

#### WS5.1: Manual E2E Testing
- [ ] Test: Privy email login → embedded wallet created
- [ ] Test: WalletConnect login (external wallet)
- [ ] Test: Deposit 1000 USDC → balance updates
- [ ] Test: Deploy liquidity → orders appear in ActiveOrders
- [ ] Test: Oracle updates → risk status changes
- [ ] Test: Emergency unwind → funds returned
- [ ] Test: Withdraw → balance updates
- [ ] Test: Role detection → UI changes based on role
- [ ] Test: Mobile responsive (iPhone, iPad)

#### WS5.2: Integration Testing Script
- [ ] Create `scripts/test-e2e.sh`
- [ ] Start all services via dev.sh
- [ ] Run health checks (API, DB, Oracle)
- [ ] Verify event indexer populated DB
- [ ] Query API endpoints (expect non-empty)
- [ ] Check frontend builds (`npm run build`)

#### WS5.3: Error Scenarios
- [ ] Test: Insufficient balance for deposit
- [ ] Test: Token approval rejected
- [ ] Test: Transaction timeout
- [ ] Test: Network switch during transaction
- [ ] Test: Oracle staleness triggers warning
- [ ] Test: Exposure limit exceeded blocks deployment

**Acceptance Criteria**:
- Complete judge demo flow works end-to-end
- All error states handled gracefully
- Mobile responsive verified
- Integration test script passes

---

### 🔜 WS6: Documentation & Production Readiness

**Goal**: Complete documentation for local dev and production deployment

#### WS6.1: Update README.md
- [ ] Replace with production-grade README
- [ ] Sections:
  - What is TempoVault (1-2 paragraphs)
  - Quick Start (one command: `./scripts/dev.sh`)
  - Architecture Overview (diagram + component descriptions)
  - Environment Variables (reference .env.example)
  - Local Development (Docker + services)
  - API Documentation (link to /docs)
  - Testing (E2E + integration)
  - Production Deployment (checklist)
  - Troubleshooting (common issues)

#### WS6.2: Create DEPLOYMENT.md
- [ ] Production deployment guide
- [ ] Sections:
  - Prerequisites (domain, SSL, PostgreSQL, server)
  - Smart Contract Deployment (Tempo Mainnet)
  - Backend Deployment (PM2/systemd, nginx)
  - Frontend Deployment (Vercel/Netlify/S3)
  - Environment Configuration (production .env)
  - Monitoring Setup (logs, metrics, alerts)
  - Security Checklist (keys, CORS, rate limits)

#### WS6.3: Create RUNBOOK.md
- [ ] Operational runbook for production
- [ ] Sections:
  - Reindex from block (if corruption detected)
  - Recover from oracle failure (restart, verify nonce)
  - Debug stuck transaction (check gas, RPC health)
  - Rotate private keys (oracle, deployer)
  - Database backup/restore
  - Scale services (horizontal/vertical)
  - Emergency contacts/escalation

#### WS6.4: API Documentation
- [ ] Verify OpenAPI docs complete (`/docs`)
- [ ] Add example requests/responses
- [ ] Document authentication (if server-side Privy verification added)
- [ ] Document rate limits
- [ ] Document WebSocket subscriptions

**Acceptance Criteria**:
- README enables new developer to run locally in < 5 minutes
- DEPLOYMENT.md enables production deployment
- RUNBOOK.md enables operational support
- API docs are comprehensive

---

## VERIFICATION GATES

### Gate 1: Reproducibility ✅
- [x] `./scripts/dev.sh` starts all services
- [x] PostgreSQL auto-initializes with schema
- [x] All services healthy (`/health`, `/ready`)
- [x] `.env.example` comprehensive

### Gate 2: Authentication ⏳ IN PROGRESS
- [ ] Privy email login works
- [ ] Embedded wallet created
- [ ] WalletConnect still works
- [ ] Session persists across refresh

### Gate 3: Write Operations
- [ ] Deposit: approve → deposit → balance updates
- [ ] Withdraw: withdraw → balance updates
- [ ] Deploy: deployLiquidity → orders appear
- [ ] Emergency: unwind → funds returned

### Gate 4: Production UI
- [ ] Landing page looks institutional
- [ ] No generic Tailwind defaults
- [ ] Light + dark modes work
- [ ] Mobile responsive
- [ ] All write flows polished

### Gate 5: Production Ready
- [ ] Complete E2E test passes
- [ ] All docs written (README, DEPLOYMENT, RUNBOOK)
- [ ] All environment variables documented
- [ ] Security checklist complete
- [ ] Ready for mainnet deployment

---

## CURRENT STATUS

**Phase**: WS2 - Privy Integration ⏳ IN PROGRESS
**Last Completed**: WS1 - Offchain Reproducibility ✅
**Next After WS2**: WS3 - Frontend Production UI

**Progress**:
- WS0: ✅ Complete (contracts deployed)
- WS1: ✅ Complete (reproducible local dev)
- WS2: ⏳ Starting now (Privy integration)
- WS3: 🔜 Next (frontend UI)
- WS4: 🔜 Queued (roles & ops)
- WS5: 🔜 Queued (testing)
- WS6: 🔜 Queued (docs)

**Estimated Completion**: 2-3 days for full production-ready system

---

## NOTES

### Privy Integration Strategy
- Primary authentication method (email, social)
- WalletConnect as optional fallback
- Server-side verification recommended but not required for MVP
- Embedded wallets simplify onboarding

### Design Philosophy
- Institutional aesthetic (ledger + paper theme)
- Professional, not "crypto" (no gradients, no purple)
- Functional minimalism (clear, not cluttered)
- Accessibility first (WCAG AA compliance)

### Production Deployment Path
1. Complete WS2-WS6 (all features + docs)
2. Deploy contracts to Tempo Mainnet (Chain ID 4217)
3. Deploy frontend to Vercel
4. Deploy backend to DigitalOcean/AWS (Docker Compose or Kubernetes)
5. Configure domain + SSL
6. Monitor, iterate, scale

---

**Last Updated**: 2026-02-15 03:25 UTC
**Status**: Executing WS2 (Privy Integration)

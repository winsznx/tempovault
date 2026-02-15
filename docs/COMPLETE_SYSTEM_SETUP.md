# TempoVault - Complete System Setup & User Experience Guide

## 🎯 What You'll Get

A fully functional institutional stablecoin treasury management system with:

1. **📊 Real-time Dashboard** - Monitor vault balance, active orders, P&L, risk metrics
2. **🤖 Automated Market Making** - Deploy liquidity on Tempo DEX with risk controls
3. **📡 Oracle Service** - Live price feeds and risk signals
4. **🏦 Lending Integration** - Yield optimization through overcollateralized lending
5. **📈 Analytics API** - Historical performance, risk metrics, event logs

## 🚀 Quick Start (3 Steps)

### Step 1: Configure Environment

All contracts are already deployed! Update `.env` if needed:

```bash
# Already configured:
GOVERNANCE_ROLES_ADDRESS=0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565
RISK_CONTROLLER_ADDRESS=0xa5bec93b07b70e91074A24fB79C5EA8aF639a639
TREASURY_VAULT_ADDRESS=0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D
DEX_STRATEGY_ADDRESS=0x2f0b1a0c816377f569533385a30d2afe2cb4899e
LENDING_MODULE_ADDRESS=0xff9fe135d812ef03dd1164f71dd87734b30cf134
REPORTING_ADAPTER_ADDRESS=0x50b79e5e258c905fcc7e7a37a6c4cb1e0e064258
```

### Step 2: Start Backend Services

#### A. Install Python Dependencies
```bash
cd offchain
pip install -r requirements.txt
```

#### B. Set Up Database (PostgreSQL)
```bash
# Install PostgreSQL if needed
brew install postgresql@14  # macOS
# or: sudo apt install postgresql-14  # Linux

# Create database
createdb tempovault

# Initialize schema
psql tempovault < indexer_schema.sql
```

#### C. Start Services (in separate terminals)

**Terminal 1: Oracle Relay**
```bash
cd offchain
export RPC_URL="https://rpc.moderato.tempo.xyz"
export ORACLE_PRIVATE_KEY="0xbdcbaee7b3ad516dd3e5e58bdea682800f3040a4b660decddaa6b8798c1da767"
export RISK_CONTROLLER_ADDRESS="0xa5bec93b07b70e91074A24fB79C5EA8aF639a639"

python oracle_relay.py
```

**Terminal 2: Event Indexer**
```bash
cd offchain
export RPC_URL="https://rpc.moderato.tempo.xyz"
export INDEXER_DB_URL="postgresql://localhost:5432/tempovault"

python event_indexer.py
```

**Terminal 3: API Server**
```bash
cd offchain
export API_PORT=3000
export INDEXER_DB_URL="postgresql://localhost:5432/tempovault"

python api_server.py
```

### Step 3: Start Dashboard

```bash
cd dashboard

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

Dashboard will open at: **http://localhost:5173**

## 📱 User Experience Flow

### 1️⃣ Connect Wallet

1. Open dashboard at http://localhost:5173
2. Click "Connect Wallet"
3. Connect to **Tempo Testnet (Chain ID: 42431)**
4. Approve connection

### 2️⃣ Fund Wallet

Get testnet tokens from Tempo faucet:
```bash
# Request testnet funds
cast rpc tempo_fundAddress YOUR_WALLET_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz

# Or visit: https://faucet.tempo.xyz
```

### 3️⃣ Deposit to Vault

**Option A: Via Dashboard**
- Enter amount in "Deposit" section
- Click "Approve" (approve token spending)
- Click "Deposit"
- Confirm transaction in wallet

**Option B: Via CLI**
```bash
# Approve token spending
cast send 0xb012a28296A61842ED8d68f82618c9eBF0795cED \
  "approve(address,uint256)" \
  0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $PRIVATE_KEY

# Deposit to vault
cast send 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "deposit(address,uint256)" \
  0xb012a28296A61842ED8d68f82618c9eBF0795cED \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $PRIVATE_KEY
```

### 4️⃣ Configure Strategy

**Get pair ID for trading pair:**
```bash
cast call 0xDEc0000000000000000000000000000000000000 \
  "pairKey(address,address)" \
  0xb012a28296A61842ED8d68f82618c9eBF0795cED \
  <QUOTE_TOKEN_ADDRESS> \
  --rpc-url https://rpc.moderato.tempo.xyz
```

**Configure strategy:**
```bash
cast send 0x2f0b1a0c816377f569533385a30d2afe2cb4899e \
  "configureStrategy(bytes32,(address,address,int16,uint256,uint16,uint16,bool,bool))" \
  <PAIR_ID> \
  "(0xb012a28296A61842ED8d68f82618c9eBF0795cED,<QUOTE_TOKEN>,50,100000000000000000000,3,3,true,true)" \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $PRIVATE_KEY
```

### 5️⃣ Deploy Liquidity

**Via Dashboard:**
- Navigate to "Deploy Liquidity" section
- Select trading pair
- Enter base amount, quote amount, center tick
- Click "Deploy"
- Monitor "Active Orders" panel

**Via CLI:**
```bash
cast send 0x2f0b1a0c816377f569533385a30d2afe2cb4899e \
  "deployLiquidity(bytes32,uint128,uint128,int16)" \
  <PAIR_ID> \
  500000000000000000000 \
  500000000000000000000 \
  0 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $PRIVATE_KEY
```

### 6️⃣ Monitor Performance

Dashboard shows real-time:
- **Vault Balance**: Total deposited value
- **Active Orders**: Live market making positions
- **P&L Chart**: Historical performance
- **Risk Status**: Current exposure, imbalance, deviation

### 7️⃣ Emergency Controls

**Emergency Unwind** (remove all liquidity):
```bash
cast send 0x2f0b1a0c816377f569533385a30d2afe2cb4899e \
  "emergencyUnwind(bytes32)" \
  <PAIR_ID> \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $PRIVATE_KEY
```

**Withdraw from Vault:**
```bash
cast send 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "withdraw(address,uint256,address)" \
  0xb012a28296A61842ED8d68f82618c9eBF0795cED \
  1000000000000000000000 \
  YOUR_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $PRIVATE_KEY
```

## 🎨 Dashboard Features

### Main View
```
┌─────────────────────────────────────────────────────────┐
│  TempoVault - Institutional Treasury Management         │
├─────────────────────────────────────────────────────────┤
│  [Wallet: 0xaD4F...CDa] [Balance: 1,000,000 USDC]      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📊 Vault Balance                  📈 P&L Chart         │
│  ┌────────────────┐               ┌──────────────────┐ │
│  │ Total: $500K   │               │    ╱╲            │ │
│  │ APY: 12.5%     │               │   ╱  ╲           │ │
│  │ Deployed: 60%  │               │  ╱    ╲          │ │
│  └────────────────┘               └──────────────────┘ │
│                                                          │
│  🎯 Active Orders                 ⚠️ Risk Status        │
│  ┌────────────────┐               ┌──────────────────┐ │
│  │ Bid: $250K @ 1 │               │ Exposure: 35%    │ │
│  │ Ask: $250K @ 1 │               │ Deviation: 0.5%  │ │
│  └────────────────┘               │ Status: ✅ Good  │ │
│                                    └──────────────────┘ │
│                                                          │
│  [Deposit] [Withdraw] [Deploy Liquidity] [Unwind]      │
└─────────────────────────────────────────────────────────┘
```

## 📊 API Endpoints

```bash
# Get vault stats
curl http://localhost:3000/api/vault/stats

# Get active positions
curl http://localhost:3000/api/positions

# Get historical performance
curl http://localhost:3000/api/performance?days=30

# Get risk metrics
curl http://localhost:3000/api/risk/metrics
```

## ✅ System Health Check

```bash
# Check all services are running
curl http://localhost:3000/health         # API Server
curl http://localhost:3000/api/oracle     # Oracle status
curl http://localhost:3000/api/indexer    # Indexer status

# Check on-chain deployment
cast call 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "totalDeposits()" \
  --rpc-url https://rpc.moderato.tempo.xyz
```

## 🎯 Demo Scenario

**Complete E2E Flow:**

1. **Deposit** $1M USDC to vault
2. **Configure** USDC/pathUSD trading pair
3. **Deploy** $500K in liquidity (50% utilization)
4. **Monitor** spread capture and volume
5. **Rebalance** as market moves
6. **Withdraw** profits + principal

**Expected Results:**
- Spread capture: ~10 bps per trade
- Volume: Depends on market activity
- APY: ~8-15% (market making + lending yield)
- Risk: Controlled by automatic limits

## 🔧 Troubleshooting

**Dashboard won't connect:**
```bash
# Make sure Metamask/wallet is on Tempo Testnet
# Chain ID: 42431
# RPC: https://rpc.moderato.tempo.xyz
```

**Oracle not updating:**
```bash
# Check oracle has testnet ETH for gas
cast balance $ORACLE_ADDRESS --rpc-url https://rpc.moderato.tempo.xyz

# Check oracle private key is set
echo $ORACLE_PRIVATE_KEY
```

**API server errors:**
```bash
# Check database connection
psql tempovault -c "SELECT 1"

# Check port not in use
lsof -i :3000
```

## 📚 Next Steps

1. **Test E2E flow** - Run through complete deposit → deploy → monitor → withdraw
2. **Optimize parameters** - Tune tick width, order sizes based on performance
3. **Add monitoring** - Set up alerts for risk thresholds
4. **Deploy to mainnet** - When ready, deploy to Tempo Mainnet (Chain ID: 4217)

---

**Status:** ✅ Ready for user testing
**Network:** Tempo Testnet
**Dashboard:** http://localhost:5173
**API:** http://localhost:3000

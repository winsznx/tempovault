# TempoVault - Complete End-to-End Demo Flow

**Date:** 2026-02-15  
**Status:** ✅ **READY FOR DEMO**

---

## 🎯 **Current Situation**

You have:
- ✅ Admin wallet with ADMIN role
- ✅ Successfully granted TREASURY_MANAGER role
- ✅ **Test Tokens (BetaUSD)** in wallet
- ✅ **Fixed Dashboard** (Real on-chain data, no mocks)

---

## 📋 **Complete Flow (Standard Demo)**

### **Step 1: Deposit to Vault** 💰

1. Go to http://localhost:5173/app/treasury
2. Click "Deposit Funds" button
3. Select **BetaUSD**
4. Enter amount (e.g., **50,000**)
5. Click "Continue" -> Approve (if first time) -> Deposit
6. **Result:** Vault Balance increases.

### **Step 2: Deploy Capital to Strategy** 🎯

1. Go to http://localhost:5173/app/strategy
2. Click **"Deploy to DEX"** button
3. Enter **Quote Amount**: **50,000** (BetaUSD)
4. **New Flow:** 
   - The modal will check your Vault Balance.
   - Button will say **"Step 1: Allocate BetaUSD from Vault"**.
   - Click it and sign transaction (Moves funds from Vault -> Strategy).
5. Button changes to **"Deploy to DEX"**.
6. Click it and sign transaction (Places orders on Tempo).
7. **Result:** Capital is deployed, Active Orders appear.

### **Step 3: Monitor Performance** 📊

#### **Dashboard Overview** (http://localhost:5173/app)
- **Vault Balance**: Shows "Deployed in Strategy" amount.
- **Active Orders**: Shows your limit orders on the DEX.
- **Risk Status**: Real-time circuit breaker status.

---

## 📝 **Withdrawal**

- **From Vault**: Use "Withdraw Funds" on the Treasury Page.
- **From Strategy**: Currently requires Admin execution of `emergencyUnwind` (Safety feature).

---

## 🚨 **Quick Start**

1. **Refresh Page** (Clear any old errors)
2. **Deposit** 50k BetaUSD
3. **Deploy** 50k BetaUSD (Allocate -> Deploy)
4. **Done!**

---

## 🎬 **Demo Script for Judges**

### **30-Second Pitch**
"TempoVault is an institutional-grade treasury management system on Tempo. It uses on-chain role-based access control, automated market making, and real-time risk monitoring. Everything you see is live on-chain data."

### **2-Minute Demo**
1. **Show Dashboard** (20s)
   - "Here is our Vault Balance holding real assets."
   - "We have 50k BetaUSD deployed in our automated strategy."
   
2. **Deposit Flow** (30s)
   - "I'll deposit more capital into the Vault."
   - *Perform Deposit*
   - "Funds are secured in the granularly permissioned Vault."

3. **Deploy Liquidity** (40s)
   - "Now I'll allocate this capital to our Market Making Strategy."
   - *Click Deploy -> Allocate from Vault -> Deploy*
   - "Notice I am moving funds **from the Vault**, not my wallet. This is key for security."
   - "Orders are now live on Tempo."

4. **Risk Monitoring** (20s)
   - "Our Risk Controller monitors the peg."
   - "If AlphaUSD deviates, it automatically halts trading."

5. **Wrap Up** (10s)
   - "Production-ready, audited contracts, clean UX."

---

*See `ROLE_SYSTEM_EXPLAINED.md` for role details*  

---

## 🎯 **Current Situation**

You have:
- ✅ Admin wallet with ADMIN role
- ✅ Successfully granted TREASURY_MANAGER role to your wallet
- ❌ **Zero token balance** - can't deposit yet

---

## 📋 **Complete Flow (6 Steps)**

### **Step 1: Get Test Tokens** 🪙

You need to get some test tokens on Tempo Testnet first.

#### **Option A: Faucet (Recommended)**
```bash
# Check if there's a Tempo testnet faucet
# Visit: https://faucet.tempo.xyz (if available)
# Or check Tempo Discord for faucet bot
```

#### **Option B: Mint Test Tokens (If you deployed a test token)**
```bash
# Check what token address is configured
grep VITE_DEFAULT_TOKEN_ADDRESS .env

# If you have a test ERC20 token deployed, mint some
cast send $TOKEN_ADDRESS \
  "mint(address,uint256)" \
  $YOUR_WALLET_ADDRESS \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# This mints 1000 tokens (assuming 18 decimals)
```

#### **Option C: Use Native ETH**
If the vault accepts native ETH:
```bash
# Get testnet ETH from faucet
# Then you can deposit ETH directly
```

---

### **Step 2: Approve Token Spending** 🔓

Before depositing, you need to approve the vault to spend your tokens.

#### **Via Cast (Command Line)**
```bash
# Set your environment variables
export VAULT_ADDRESS=$(grep VITE_TREASURY_VAULT_ADDRESS .env | cut -d '=' -f2)
export TOKEN_ADDRESS=$(grep VITE_DEFAULT_TOKEN_ADDRESS .env | cut -d '=' -f2)
export YOUR_PRIVATE_KEY="your_private_key_here"

# Approve vault to spend tokens (approve 1000 tokens)
cast send $TOKEN_ADDRESS \
  "approve(address,uint256)" \
  $VAULT_ADDRESS \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# Verify approval
cast call $TOKEN_ADDRESS \
  "allowance(address,address)" \
  $YOUR_WALLET_ADDRESS \
  $VAULT_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz
```

#### **Via Frontend (Easier)**
The deposit modal should automatically trigger an approval transaction if needed.

---

### **Step 3: Deposit to Vault** 💰

Now you can deposit!

#### **Via Frontend (Recommended)**
1. Go to http://localhost:5173/app/treasury
2. Click "Deposit Funds" button
3. Enter amount (e.g., 100)
4. Click "Continue"
5. Approve the transaction in MetaMask
6. Wait for confirmation
7. See your vault balance update!

#### **Via Cast (Command Line)**
```bash
# Deposit 100 tokens to vault
cast send $VAULT_ADDRESS \
  "deposit(address,uint256)" \
  $TOKEN_ADDRESS \
  100000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# Check vault balance
cast call $VAULT_ADDRESS \
  "tokenBalances(address)" \
  $TOKEN_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz
```

---

### **Step 4: Deploy Capital to Strategy** 🎯

Now that you have funds in the vault, deploy them to the DEX strategy.

#### **Prerequisites**
You need STRATEGIST role (you can grant it to yourself with your admin wallet).

#### **Grant STRATEGIST Role**
```bash
cast send $GOVERNANCE_ADDRESS \
  "grantRole(bytes32,address)" \
  $(cast keccak "STRATEGIST") \
  $YOUR_WALLET_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $ADMIN_PRIVATE_KEY
```

#### **Deploy Liquidity via Frontend**
1. Go to http://localhost:5173/app/strategy
2. Click "Deploy to DEX" button
3. Configure deployment:
   - Amount: 50 (deploy 50% of vault balance)
   - Tick range: -100 to +100 (price range)
   - Flip orders: Yes (automated market making)
4. Click "Deploy"
5. Approve transaction
6. Wait for confirmation

#### **Deploy via Cast**
```bash
# Deploy 50 tokens to strategy
cast send $VAULT_ADDRESS \
  "deployCapital(address,address,uint256,bytes32)" \
  $STRATEGY_ADDRESS \
  $TOKEN_ADDRESS \
  50000000000000000000 \
  $PAIR_ID \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY
```

---

### **Step 5: Monitor Performance** 📊

Watch your vault in action!

#### **Dashboard Overview** (http://localhost:5173/app)
- **Vault Balance**: Shows total balance, deployed capital, available funds
- **Risk Status**: Circuit breaker state, peg deviation
- **P&L Chart**: Historical performance
- **Active Orders**: Your flip orders on the DEX

#### **Via API**
```bash
# Get vault balance
curl http://localhost:3000/api/v1/vault/1/balance?vault_address=$VAULT_ADDRESS

# Get P&L
curl "http://localhost:3000/api/v1/vault/1/pnl?token=$TOKEN_ADDRESS"

# Get active orders
curl "http://localhost:3000/api/v1/strategy/$STRATEGY_ADDRESS/orders/$PAIR_ID"

# Get risk status
curl "http://localhost:3000/api/v1/risk/$PAIR_ID/status?risk_controller_address=$RISK_CONTROLLER_ADDRESS"
```

---

### **Step 6: Withdraw Profits** 💸

After your strategy generates profits, withdraw them!

#### **Via Frontend**
1. Go to http://localhost:5173/app/treasury
2. Click "Withdraw Funds" button
3. Enter amount to withdraw
4. Click "Continue"
5. Approve transaction
6. Receive tokens in your wallet

#### **Via Cast**
```bash
# Withdraw 10 tokens from vault
cast send $VAULT_ADDRESS \
  "withdraw(address,uint256)" \
  $TOKEN_ADDRESS \
  10000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY
```

---

## 🚨 **Quick Start (If You Have Test Tokens)**

If you already have test tokens in your wallet:

```bash
# 1. Approve vault
cast send $TOKEN_ADDRESS "approve(address,uint256)" $VAULT_ADDRESS 1000000000000000000000 --rpc-url https://rpc.moderato.tempo.xyz --private-key $YOUR_PRIVATE_KEY

# 2. Deposit to vault
cast send $VAULT_ADDRESS "deposit(address,uint256)" $TOKEN_ADDRESS 100000000000000000000 --rpc-url https://rpc.moderato.tempo.xyz --private-key $YOUR_PRIVATE_KEY

# 3. Grant yourself STRATEGIST role (with admin wallet)
cast send $GOVERNANCE_ADDRESS "grantRole(bytes32,address)" $(cast keccak "STRATEGIST") $YOUR_WALLET_ADDRESS --rpc-url https://rpc.moderato.tempo.xyz --private-key $ADMIN_PRIVATE_KEY

# 4. Deploy capital (with strategist wallet)
cast send $VAULT_ADDRESS "deployCapital(address,address,uint256,bytes32)" $STRATEGY_ADDRESS $TOKEN_ADDRESS 50000000000000000000 $PAIR_ID --rpc-url https://rpc.moderato.tempo.xyz --private-key $YOUR_PRIVATE_KEY

# Done! Check dashboard at http://localhost:5173/app
```

---

## 🔍 **Troubleshooting**

### **"Insufficient balance" when depositing**
**Problem:** You don't have tokens in your wallet  
**Solution:** Get test tokens from faucet or mint them (see Step 1)

### **"Insufficient allowance" when depositing**
**Problem:** Vault not approved to spend your tokens  
**Solution:** Approve vault first (see Step 2)

### **"You need STRATEGIST role" when deploying**
**Problem:** You don't have STRATEGIST role  
**Solution:** Grant yourself the role with admin wallet (see Step 4)

### **"No balances found" in vault**
**Problem:** Haven't deposited yet  
**Solution:** Complete Steps 1-3 first

### **"Failed to fetch orders" in ActiveOrders**
**Problem:** No liquidity deployed yet  
**Solution:** Complete Step 4 to deploy capital

---

## 📝 **Environment Variables Reference**

Make sure these are set in your `.env`:

```bash
# Contract Addresses
VITE_GOVERNANCE_ROLES_ADDRESS=0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565
VITE_TREASURY_VAULT_ADDRESS=0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D
VITE_DEX_STRATEGY_ADDRESS=0x2f0b1a0c816377f569533385a30d2afe2cb4899e
VITE_RISK_CONTROLLER_ADDRESS=0xa5bec93b07b70e91074A24fB79C5EA8aF639a639

# Token Address (your test token)
VITE_DEFAULT_TOKEN_ADDRESS=0xYourTokenAddress

# RPC
VITE_RPC_URL=https://rpc.moderato.tempo.xyz
VITE_CHAIN_ID=42431
```

---

## 🎬 **Demo Script for Judges**

### **30-Second Pitch**
"TempoVault is an institutional-grade treasury management system on Tempo. It uses on-chain role-based access control, automated market making with flip orders, and real-time risk monitoring. Let me show you."

### **2-Minute Demo**
1. **Show Landing Page** (5s)
   - "This is the public landing page"
   
2. **Connect Wallet** (10s)
   - "I'll connect with my treasury manager wallet"
   - Shows TREASURY_MANAGER badge
   
3. **Show Dashboard** (20s)
   - "Here's the vault balance: 100 tokens"
   - "50 tokens deployed to DEX strategy"
   - "P&L chart shows 5% gain"
   - "Active orders on Tempo DEX"
   
4. **Deposit Flow** (30s)
   - "Let me deposit 50 more tokens"
   - Click Deposit → Enter amount → Approve → Confirm
   - "Transaction confirmed, balance updated"
   
5. **Deploy Liquidity** (30s)
   - "Now I'll deploy this to the DEX"
   - Click Deploy → Configure → Confirm
   - "Capital deployed, flip orders active"
   
6. **Show Risk Monitoring** (15s)
   - "Circuit breaker monitors peg deviation"
   - "Automatically halts trading if risk exceeds threshold"
   
7. **Wrap Up** (10s)
   - "This is production-ready institutional DeFi"
   - "On-chain governance, automated strategies, real-time risk control"

---

## ✅ **Summary**

**To deposit, you need:**
1. ✅ TREASURY_MANAGER role (you have this!)
2. ❌ Test tokens in your wallet (you need this!)
3. ✅ Vault approval (modal will handle this)

**Next step:** Get test tokens from faucet or mint them, then you can deposit!

---

*See `ROLE_SYSTEM_EXPLAINED.md` for role details*  
*See `SERVICES_RUNNING.md` for service status*

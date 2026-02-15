# How to Deposit Your Faucet Tokens - Quick Guide

## 🎉 **You Already Have Tokens!**

From your MetaMask screenshot, you have:
- **AlphaUSD**: 999,984.788 tokens ✅
- **BetaUSD**: 1.00M tokens ✅
- **PathUSD**: 1.00M tokens ✅
- **ThetaUSD**: 1.00M tokens ✅

**You can deposit ANY of these!**

---

## 📋 **Step-by-Step: Deposit AlphaUSD**

### **Step 1: Get the Token Address**

In MetaMask:
1. Click on "AlphaUSD" in your token list
2. Click the three dots (•••) next to the token
3. Click "View on Explorer" or "Token Details"
4. **Copy the contract address** (starts with 0x...)

OR

Look at the URL in the explorer - it will be something like:
```
https://explore.tempo.xyz/token/0x1234...abcd
```

The part after `/token/` is your token address.

---

### **Step 2: Paste Token Address in TempoVault**

1. Go to http://localhost:5173/app/treasury
2. You'll see a new **"Select Token"** card
3. **Paste the AlphaUSD address** in the input field
4. You'll see a green checkmark ✓

---

### **Step 3: Deposit**

1. Click **"Deposit Funds"** button
2. Enter amount (e.g., `1000`)
3. Click **"Continue"**
4. **Approve** the transaction in MetaMask (first time only)
5. **Confirm deposit** transaction in MetaMask
6. Wait for confirmation
7. **Done!** Your vault balance will update

---

## 🚀 **Quick Commands (Alternative)**

If you prefer command line:

### **Find Token Address**
```bash
# Check your wallet in explorer
open "https://explore.tempo.xyz/address/YOUR_WALLET_ADDRESS"

# Look for AlphaUSD, BetaUSD, etc. in your token holdings
# Copy the contract address
```

### **Deposit via Cast**
```bash
# Set variables
export ALPHA_USD_ADDRESS=0x...  # Your AlphaUSD address
export VAULT_ADDRESS=0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D
export YOUR_PRIVATE_KEY=0x...

# Approve vault
cast send $ALPHA_USD_ADDRESS \
  "approve(address,uint256)" \
  $VAULT_ADDRESS \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# Deposit 1000 tokens
cast send $VAULT_ADDRESS \
  "deposit(address,uint256)" \
  $ALPHA_USD_ADDRESS \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY
```

---

## 💡 **Pro Tips**

### **Which Token to Use?**
- **AlphaUSD**: You have 999,984 - plenty to test with
- **BetaUSD**: Full 1M - good for larger deposits
- **PathUSD**: Full 1M - another option
- **ThetaUSD**: Full 1M - yet another option

**Recommendation:** Start with **AlphaUSD** and deposit 1,000 tokens to test.

### **How Much to Deposit?**
- **Test deposit**: 100-1,000 tokens
- **Demo deposit**: 10,000-50,000 tokens
- **Full demo**: 100,000+ tokens

### **After Depositing**
1. Refresh dashboard - you'll see vault balance
2. Grant yourself STRATEGIST role
3. Deploy 50% of balance to DEX
4. Watch P&L and active orders populate

---

## ✅ **Summary**

**You DON'T need to:**
- ❌ Deploy a new token
- ❌ Use a faucet again
- ❌ Wait for anything

**You just need to:**
1. ✅ Get AlphaUSD contract address from MetaMask/Explorer
2. ✅ Paste it in the "Select Token" field
3. ✅ Click "Deposit Funds"
4. ✅ Approve + Confirm in MetaMask

**That's it!** You're ready to deposit right now! 🎉

---

*Your tokens from the faucet are perfect for testing TempoVault!*

# Token Not Approved - CRITICAL FIX NEEDED

**Date:** 2026-02-15 11:00 AM  
**Status:** ❌ BLOCKER - Tokens not approved in vault

---

## 🐛 **The REAL Problem**

The deposit is failing because **tokens must be approved in the vault contract first!**

Looking at `TreasuryVault.sol` line 215:
```solidity
function deposit(address token, uint256 amount) {
    if (!approvedTokens[token]) revert TokenNotApproved(token);
    // ...
}
```

**The vault has a whitelist of approved tokens, and BetaUSD is not on it!**

---

## ✅ **The Fix**

You need to approve the tokens in the vault contract using your **ADMIN wallet** (the one that deployed the contracts).

### **Step 1: Approve BetaUSD**

```bash
cast send 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000002 \
  true \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key YOUR_ADMIN_PRIVATE_KEY
```

### **Step 2: Approve All Tempo Tokens**

```bash
# PathUSD
cast send 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000000 \
  true \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key YOUR_ADMIN_PRIVATE_KEY

# AlphaUSD
cast send 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000001 \
  true \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key YOUR_ADMIN_PRIVATE_KEY

# BetaUSD
cast send 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000002 \
  true \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key YOUR_ADMIN_PRIVATE_KEY

# ThetaUSD
cast send 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000003 \
  true \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key YOUR_ADMIN_PRIVATE_KEY
```

---

## 🔐 **Who Can Approve Tokens?**

Only wallets with **ADMIN_ROLE** can approve tokens.

From `TreasuryVault.sol` line 190-195:
```solidity
function setApprovedToken(address token, bool approved)
    external onlyRole(governance.ADMIN_ROLE())
{
    approvedTokens[token] = approved;
    emit TokenApproved(token, approved);
}
```

**Your admin wallet:** The one that deployed the contracts (has ADMIN_ROLE)

---

## 📋 **Complete Setup Script**

Create `scripts/approve-tokens.sh`:

```bash
#!/bin/bash

# TempoVault - Approve All Tempo Testnet Tokens

set -e

echo "🔐 Approving tokens in TreasuryVault..."

VAULT_ADDRESS="0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D"
RPC_URL="https://rpc.moderato.tempo.xyz"

# Read private key from .env
source .env

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ DEPLOYER_PRIVATE_KEY not set in .env"
    exit 1
fi

# Approve PathUSD
echo "1/4 Approving PathUSD..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000000 \
  true \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Approve AlphaUSD
echo "2/4 Approving AlphaUSD..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000001 \
  true \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Approve BetaUSD
echo "3/4 Approving BetaUSD..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000002 \
  true \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Approve ThetaUSD
echo "4/4 Approving ThetaUSD..."
cast send $VAULT_ADDRESS \
  "setApprovedToken(address,bool)" \
  0x20c0000000000000000000000000000000000003 \
  true \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

echo "✅ All tokens approved!"
echo ""
echo "You can now deposit:"
echo "- PathUSD: 0x20c0000000000000000000000000000000000000"
echo "- AlphaUSD: 0x20c0000000000000000000000000000000000001"
echo "- BetaUSD: 0x20c0000000000000000000000000000000000002"
echo "- ThetaUSD: 0x20c0000000000000000000000000000000000003"
```

Make it executable:
```bash
chmod +x scripts/approve-tokens.sh
```

Run it:
```bash
./scripts/approve-tokens.sh
```

---

## 🎯 **After Approving Tokens**

1. **Run the approval script** (above)
2. **Wait for transactions to confirm**
3. **Refresh your browser**
4. **Try depositing again**
5. **Should work now!** ✅

---

## 🔍 **Why This Happened**

The vault contract has a **security feature** that requires tokens to be explicitly approved before they can be deposited. This prevents:
- Malicious tokens from being deposited
- Accidental deposits of wrong tokens
- Unauthorized token types

**This is a good security practice!** But it means you need to approve tokens first.

---

## ✅ **Summary**

**Problem:** Tokens not approved in vault contract  
**Solution:** Run approval script with admin wallet  
**Command:** `./scripts/approve-tokens.sh`  
**Then:** Try depositing again

---

*Run the approval script and deposits will work!* 🎉

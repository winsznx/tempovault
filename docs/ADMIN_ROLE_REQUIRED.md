# ADMIN Role Required - Cannot Approve Tokens

**Date:** 2026-02-15 11:05 AM  
**Status:** ❌ BLOCKER - Wrong wallet, need ADMIN role

---

## 🐛 **The Problem**

The `ORACLE_PRIVATE_KEY` wallet **does NOT have ADMIN_ROLE** and cannot approve tokens!

**Error:**
```
Unauthorized(0x6985520C99B70817177ed22312fF4e73bCf3f063, 0x0000000000000000000000000000000000000000)
```

**Oracle Wallet:** `0x6985520C99B70817177ed22312fF4e73bCf3f063`  
**Has Role:** None (or only ORACLE_ROLE)  
**Needs Role:** ADMIN_ROLE

---

## ✅ **The Solution**

You need to use the wallet that **deployed the contracts** or has been granted ADMIN_ROLE.

### **Option 1: Use the Deployer Wallet**

The wallet that deployed GovernanceRoles automatically has ADMIN_ROLE.

1. Find the deployer wallet address
2. Export its private key
3. Add to `.env` as `ADMIN_PRIVATE_KEY`
4. Update the script to use `ADMIN_PRIVATE_KEY`

### **Option 2: Grant ADMIN_ROLE to Oracle Wallet**

If you want to use the Oracle wallet, first grant it ADMIN_ROLE:

```bash
# Using the current admin wallet
cast send 0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565 \
  "grantRole(bytes32,address)" \
  $(cast keccak "ADMIN_ROLE") \
  0x6985520C99B70817177ed22312fF4e73bCf3f063 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key YOUR_CURRENT_ADMIN_PRIVATE_KEY
```

Then run the token approval script.

---

## 🔍 **Check Who Has ADMIN_ROLE**

```bash
# Get ADMIN_ROLE hash
cast keccak "ADMIN_ROLE"
# Output: 0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775

# Check if Oracle wallet has it
cast call 0x7D5b74F2dd093c32594Ab547F57E9ecf3Dd04565 \
  "hasRole(bytes32,address)" \
  0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775 \
  0x6985520C99B70817177ed22312fF4e73bCf3f063 \
  --rpc-url https://rpc.moderato.tempo.xyz
```

---

## 📋 **What You Need**

1. **Find the admin wallet** (the one that deployed contracts)
2. **Get its private key**
3. **Add to .env:**
   ```
   ADMIN_PRIVATE_KEY=0x...
   ```
4. **Update the script** to use `ADMIN_PRIVATE_KEY`
5. **Run the script again**

---

## 🎯 **Quick Fix**

If you have the admin wallet's private key, add it to `.env`:

```bash
# Add this line to .env
ADMIN_PRIVATE_KEY=0xYOUR_ADMIN_WALLET_PRIVATE_KEY
```

Then update `scripts/approve-tokens.sh` line 15:
```bash
# Change from:
if [ -z "$ORACLE_PRIVATE_KEY" ]; then

# To:
if [ -z "$ADMIN_PRIVATE_KEY" ]; then
```

And lines 31, 43, 55, 67:
```bash
# Change from:
--private-key $ORACLE_PRIVATE_KEY \

# To:
--private-key $ADMIN_PRIVATE_KEY \
```

Then run:
```bash
./scripts/approve-tokens.sh
```

---

## ❓ **Don't Have Admin Wallet?**

If you don't have access to the admin wallet, you'll need to:

1. **Redeploy the contracts** with a wallet you control
2. **OR** have the current admin grant you ADMIN_ROLE
3. **OR** use a different approach (like a governance proposal)

---

*You need the ADMIN wallet to approve tokens!*

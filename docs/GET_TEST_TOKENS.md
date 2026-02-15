# Get Test Tokens - Quick Guide

## 🎯 **Your Current Situation**

You have:
- ✅ ADMIN role
- ✅ TREASURY_MANAGER role (just granted)
- ❌ **Zero token balance** - need tokens to deposit

---

## 🪙 **Option 1: Get Native ETH from Faucet (Easiest)**

### **Step 1: Find Tempo Testnet Faucet**
```bash
# Check Tempo documentation for faucet
# Common faucet URLs:
# - https://faucet.tempo.xyz
# - https://testnet.tempo.xyz/faucet
# - Check Tempo Discord for faucet bot
```

### **Step 2: Request Testnet ETH**
1. Visit the faucet website
2. Enter your wallet address: `0xaDdF...2cDa` (from screenshot)
3. Complete CAPTCHA
4. Receive testnet ETH

### **Step 3: Check Balance**
```bash
cast balance 0xaDdF...2cDa --rpc-url https://rpc.moderato.tempo.xyz
```

---

## 🏭 **Option 2: Deploy a Test ERC20 Token**

If there's no faucet, deploy your own test token:

### **Step 1: Create Test Token Contract**

Create `test/MockERC20.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Test USD", "TUSD") {
        _mint(msg.sender, 1000000 * 10**18); // Mint 1M tokens
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

### **Step 2: Deploy Test Token**
```bash
# Deploy MockERC20
forge create src/MockERC20.sol:MockERC20 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# Save the deployed address
export TEST_TOKEN_ADDRESS=0x... # from deployment output
```

### **Step 3: Mint Tokens to Yourself**
```bash
# Mint 1000 tokens
cast send $TEST_TOKEN_ADDRESS \
  "mint(address,uint256)" \
  $YOUR_WALLET_ADDRESS \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# Check balance
cast call $TEST_TOKEN_ADDRESS \
  "balanceOf(address)" \
  $YOUR_WALLET_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz
```

### **Step 4: Update .env**
```bash
# Add to .env
echo "VITE_DEFAULT_TOKEN_ADDRESS=$TEST_TOKEN_ADDRESS" >> .env
echo "VITE_DEFAULT_TOKEN_ADDRESS=$TEST_TOKEN_ADDRESS" >> dashboard/.env
```

---

## 💰 **Option 3: Use Existing Deployed Token**

Check if there's already a test token deployed:

```bash
# Check deployment logs
cat broadcast/DeployFinal.s.sol/42431/run-latest.json | grep -i "token"

# Or check if there's a test USDC/USDT on Tempo testnet
# Common testnet token addresses:
# USDC: 0x... (check Tempo docs)
# USDT: 0x... (check Tempo docs)
```

---

## 🚀 **Quick Start Script**

Once you have tokens, here's the complete flow:

```bash
#!/bin/bash

# Set your addresses
export YOUR_WALLET=0xaDdF...2cDa  # Your wallet from screenshot
export VAULT_ADDRESS=0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D
export TOKEN_ADDRESS=0x...  # Your test token address
export YOUR_PRIVATE_KEY=0x...  # Your private key

# 1. Check token balance
echo "Checking token balance..."
cast call $TOKEN_ADDRESS \
  "balanceOf(address)" \
  $YOUR_WALLET \
  --rpc-url https://rpc.moderato.tempo.xyz

# 2. Approve vault to spend tokens
echo "Approving vault..."
cast send $TOKEN_ADDRESS \
  "approve(address,uint256)" \
  $VAULT_ADDRESS \
  1000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# 3. Deposit to vault
echo "Depositing to vault..."
cast send $VAULT_ADDRESS \
  "deposit(address,uint256)" \
  $TOKEN_ADDRESS \
  100000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --private-key $YOUR_PRIVATE_KEY

# 4. Check vault balance
echo "Checking vault balance..."
cast call $VAULT_ADDRESS \
  "tokenBalances(address)" \
  $TOKEN_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz

echo "Done! Refresh your dashboard to see the balance."
```

---

## 🎬 **Alternative: Use Frontend with MetaMask**

If you have testnet ETH in MetaMask:

1. **Get testnet ETH** from faucet
2. **Swap for test tokens** on Tempo DEX (if available)
3. **Use the deposit modal** in the frontend:
   - It will automatically handle approval
   - Just enter amount and confirm

---

## 🔍 **Check What Token the Vault Expects**

```bash
# Check vault configuration
cast call 0x599967eDC2dc6F692CA37c09693eDD7DDfe8c66D \
  "tokenBalances(address)" \
  0x0000000000000000000000000000000000000000 \
  --rpc-url https://rpc.moderato.tempo.xyz

# This might show what tokens are configured
```

---

## ✅ **Summary**

**You need tokens to deposit. Here are your options:**

1. **Easiest:** Get testnet ETH from Tempo faucet
2. **Flexible:** Deploy your own MockERC20 test token
3. **Production-like:** Use existing testnet USDC/USDT if available

**Once you have tokens:**
1. Approve vault to spend them
2. Deposit via frontend or cast command
3. See your balance in the dashboard!

---

*See `END_TO_END_DEMO_FLOW.md` for complete flow after you have tokens*

# Tempo Testnet Deployment Guide

**Network:** Tempo Chain Testnet (Moderato)
**Chain ID:** 42431
**RPC:** https://rpc.moderato.tempo.xyz
**Explorer:** https://explore.tempo.xyz
**Faucet:** https://faucet.tempo.xyz

---

## Prerequisites

### 1. Install foundry-zksync

Tempo Chain is ZKsync-based, requires foundry-zksync:

```bash
# Install foundry-zksync
foundryup-zksync
```

### 2. Get Testnet Funds

1. Visit https://faucet.tempo.xyz
2. Request testnet ETH for gas
3. Request test USDC/stablecoins for testing

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables:
- `PRIVATE_KEY` - Your deployer private key
- `GOVERNANCE_ADMIN` - Address to receive admin role
- `TEST_USDC_ADDRESS` - Test USDC token on Tempo Testnet
- `FEE_TREASURY_ADDRESS` - Address to receive fees
- `COLLATERAL_TOKEN_ADDRESS` - Collateral token for lending
- `ORACLE_PRIVATE_KEY` - Oracle signer private key

---

## Deployment Steps

### Step 1: Verify Chain Connection

```bash
cast block-number --rpc-url https://rpc.moderato.tempo.xyz
```

Should return current block number on Tempo Testnet.

### Step 2: Check Balance

```bash
cast balance $YOUR_ADDRESS --rpc-url https://rpc.moderato.tempo.xyz
```

Ensure you have sufficient testnet ETH for deployment gas.

### Step 3: Deploy Contracts

```bash
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --broadcast \
  --verify \
  --verifier-url https://explorer-api.moderato.tempo.xyz/api \
  -vvv
```

**Note:** Verification may not work on Tempo Testnet if block explorer API is not ready. Remove `--verify` if it fails.

### Step 4: Save Deployment Addresses

The script will output all deployed addresses. Save these to `.env`:

```
GOVERNANCE_ROLES_ADDRESS=0x...
RISK_CONTROLLER_ADDRESS=0x...
TREASURY_VAULT_ADDRESS=0x...
DEX_STRATEGY_ADDRESS=0x...
LENDING_MODULE_ADDRESS=0x...
REPORTING_ADAPTER_ADDRESS=0x...
```

### Step 5: Configure Roles

Run role configuration script:

```bash
forge script script/ConfigureRoles.s.sol \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --broadcast \
  -vvv
```

This grants:
- `TREASURY_MANAGER_ROLE` to governance admin
- `RISK_OFFICER_ROLE` to governance admin
- `STRATEGIST_ROLE` to governance admin
- `ORACLE_ROLE` to oracle address

---

## Post-Deployment Verification

### 1. Verify Tempo DEX Integration

```bash
# Check DexStrategy is connected to correct DEX
cast call $DEX_STRATEGY_ADDRESS "dex()" --rpc-url https://rpc.moderato.tempo.xyz
```

Should return: `0xdec0000000000000000000000000000000000000`

### 2. Verify Roles

```bash
# Check admin has STRATEGIST_ROLE
cast call $GOVERNANCE_ROLES_ADDRESS \
  "hasRole(bytes32,address)" \
  $(cast keccak "STRATEGIST_ROLE") \
  $GOVERNANCE_ADMIN \
  --rpc-url https://rpc.moderato.tempo.xyz
```

Should return: `true` (or `0x0000...0001`)

### 3. Verify Risk Parameters

```bash
# Check maxTickDeviation
cast call $RISK_CONTROLLER_ADDRESS "maxTickDeviation()" --rpc-url https://rpc.moderato.tempo.xyz
```

Should return: `200` (or `0xc8` in hex)

---

## Testing End-to-End Flow

### Test 1: Deposit to Vault

```bash
# Approve vault to spend USDC
cast send $TEST_USDC_ADDRESS \
  "approve(address,uint256)" \
  $TREASURY_VAULT_ADDRESS \
  1000000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.moderato.tempo.xyz

# Deposit USDC
cast send $TREASURY_VAULT_ADDRESS \
  "deposit(address,uint256)" \
  $TEST_USDC_ADDRESS \
  1000000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.moderato.tempo.xyz
```

### Test 2: Deploy to Strategy

```bash
# Create pair ID (keccak256 of tokens)
PAIR_ID=$(cast keccak "$(echo -n $TEST_USDC_ADDRESS$COLLATERAL_TOKEN_ADDRESS | xxd -r -p)")

# Deploy capital to strategy
cast send $TREASURY_VAULT_ADDRESS \
  "deployToStrategy(address,bytes32,address,uint256)" \
  $DEX_STRATEGY_ADDRESS \
  $PAIR_ID \
  $TEST_USDC_ADDRESS \
  500000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.moderato.tempo.xyz
```

### Test 3: Configure Strategy

```bash
# Configure pair for strategy
cast send $DEX_STRATEGY_ADDRESS \
  "configureStrategy(bytes32,(address,address,int16,uint256,uint16,uint16,bool,bool))" \
  $PAIR_ID \
  "($TEST_USDC_ADDRESS,$COLLATERAL_TOKEN_ADDRESS,100,100000000000000000000,2,2,false,true)" \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.moderato.tempo.xyz
```

### Test 4: Submit Oracle Signal

Start oracle relay:

```bash
cd offchain
python oracle_relay.py $PAIR_ID $TEST_USDC_ADDRESS $COLLATERAL_TOKEN_ADDRESS
```

Oracle should:
- Query Tempo DEX at 0xdec0...0000
- Get best bid/ask ticks
- Calculate referenceTick
- Sign with EIP-712
- Submit to RiskController

### Test 5: Deploy Liquidity

```bash
# Deploy liquidity to Tempo DEX
cast send $DEX_STRATEGY_ADDRESS \
  "deployLiquidity(bytes32)" \
  $PAIR_ID \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.moderato.tempo.xyz
```

Should:
- Call `place()` or `placeFlip()` on Tempo DEX
- Debit from internal DEX balance
- Store order IDs
- Emit `OrderPlaced` events

### Test 6: Verify Orders on Tempo DEX

```bash
# Check strategy's DEX balance
cast call 0xdec0000000000000000000000000000000000000 \
  "balanceOf(address,address)" \
  $DEX_STRATEGY_ADDRESS \
  $TEST_USDC_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz
```

### Test 7: Emergency Unwind

```bash
# Cancel all orders and return capital
cast send $DEX_STRATEGY_ADDRESS \
  "emergencyUnwind(bytes32)" \
  $PAIR_ID \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.moderato.tempo.xyz
```

Should:
- Call `cancel()` on all orders
- Withdraw from DEX internal balance
- Transfer back to TreasuryVault
- Emit `EmergencyUnwind` event

### Test 8: Withdraw from Vault

```bash
# Withdraw USDC from vault
cast send $TREASURY_VAULT_ADDRESS \
  "withdraw(address,uint256,address)" \
  $TEST_USDC_ADDRESS \
  1000000000000000000000 \
  $YOUR_ADDRESS \
  --private-key $PRIVATE_KEY \
  --rpc-url https://rpc.moderato.tempo.xyz
```

---

## Troubleshooting

### Issue: Chain ID mismatch

**Error:** "Must deploy to Tempo Chain"

**Solution:** Verify RPC URL is Tempo Testnet:
```bash
cast chain-id --rpc-url https://rpc.moderato.tempo.xyz
```
Should return: `42431`

### Issue: Insufficient gas

**Error:** "insufficient funds for gas"

**Solution:** Get more testnet ETH from faucet:
https://faucet.tempo.xyz

### Issue: Oracle signature invalid

**Error:** "OracleSignatureInvalid"

**Solution:**
1. Verify oracle has ORACLE_ROLE
2. Check EIP-712 domain separator matches
3. Verify signature includes referenceTick field

### Issue: Tick out of bounds

**Error:** "TICK_OUT_OF_BOUNDS"

**Solution:**
- Ticks must be in range ±2000
- Ticks must be divisible by 10
- Check oracle signal provides valid referenceTick

### Issue: Place order fails

**Error:** Function not found or revert

**Solution:**
1. Verify DEX address is `0xdec0000000000000000000000000000000000000`
2. Check using `place()` not `placeOrder()`
3. Verify amount is uint128, tick is int16

---

## Monitoring

### Monitor Flip Order Health

```bash
# Get all active flip orders
cast call $DEX_STRATEGY_ADDRESS "getActiveFlipOrders()" --rpc-url https://rpc.moderato.tempo.xyz

# Check specific flip order health
cast call $DEX_STRATEGY_ADDRESS \
  "checkFlipOrderHealth(uint128)" \
  <ORDER_ID> \
  --rpc-url https://rpc.moderato.tempo.xyz
```

Returns: `(bool mayHaveFailed, string reason)`

### Monitor DEX Balances

```bash
# Check strategy's balance on DEX
cast call $DEX_STRATEGY_ADDRESS \
  "getDexBalance(address)" \
  $TEST_USDC_ADDRESS \
  --rpc-url https://rpc.moderato.tempo.xyz
```

---

## Success Criteria

✅ Deployment successful when:
- All contracts deployed to Tempo Testnet
- DexStrategy connected to Tempo DEX (0xdec0...0000)
- Orders successfully placed via `place()` or `placeFlip()`
- Orders successfully cancelled via `cancel()`
- Internal balances correctly managed
- Emergency unwind returns all capital
- Oracle updates accepted
- Full E2E flow works: deposit → deploy → configure → place orders → unwind → withdraw

---

## Next Steps After Testnet

1. Document any issues found during testing
2. Update contracts based on real Tempo behavior
3. Verify fee model matches expectations
4. Test flip order silent failures
5. Optimize gas usage
6. Prepare for mainnet deployment

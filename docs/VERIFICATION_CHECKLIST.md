# TempoVault Verification Checklist

Use this checklist to verify the implementation against the specification.

## 🔍 Pre-Deployment Verification

### Compilation
- [ ] `forge build` completes with zero errors
- [ ] `forge build` completes with zero warnings
- [ ] All 6 contracts compile successfully
- [ ] All 3 interfaces compile successfully

### Unit Tests
- [ ] GovernanceRoles tests pass (10/10)
- [ ] RiskController tests pass (10/10)
- [ ] TreasuryVault tests pass (target: 15+)
- [ ] DexStrategy tests pass (target: 12+)
- [ ] LendingModule tests pass (target: 12+)
- [ ] ReportingAdapter tests pass (target: 5+)

### Fuzz Tests
- [ ] Property 1: Deposits never decrease tokenBalances
- [ ] Property 2: Withdrawals never exceed available balance
- [ ] Property 3: deployedCapital ≤ tokenBalances
- [ ] Property 4: pairExposure ≤ maxExposurePerPairBps
- [ ] Property 5: calculateInterest monotonic
- [ ] Property 6: sum(pairExposure) ≤ deployedCapital
- [ ] Property 7: ERC20 balance ≥ accounting minimum
- [ ] Property 8: Oracle nonce replay reverts
- [ ] Property 9: Oracle timestamp non-monotonic reverts
- [ ] Property 10: emergencyUnwind clears strategy balances

### Invariant Tests
- [ ] Invariant 1: Segregation (no commingling)
- [ ] Invariant 2: Solvency formula
- [ ] Invariant 3: Exposure limits
- [ ] Invariant 4: Global pause halts operations
- [ ] Invariant 5: Aggregate exposure consistency
- [ ] Invariant 6: Oracle nonce monotonicity
- [ ] Invariant 7: ERC20 balance consistency
- [ ] Invariant 8: Tick boundary compliance

### Adversarial Tests
- [ ] Oracle replay attack fails
- [ ] Oracle forged signature fails
- [ ] Flash loan manipulation fails
- [ ] LendingModule capital starvation fails
- [ ] Under-collateralized borrow fails
- [ ] Strategy order without deployment fails
- [ ] Strategy recall under-reporting prevented
- [ ] Sandwich attack simulation passes
- [ ] MEV resistance verified

### Coverage
- [ ] Line coverage ≥ 95%
- [ ] Branch coverage ≥ 90%
- [ ] Function coverage = 100%
- [ ] Run: `forge coverage --report summary`

## 🔐 Security Verification

### RiskController
- [ ] DOMAIN_SEPARATOR computed correctly in constructor
- [ ] updateOracleSignal enforces nonce > lastNonce
- [ ] updateOracleSignal enforces timestamp > lastTimestamp
- [ ] updateOracleSignal verifies ECDSA signature with ORACLE_ROLE check
- [ ] validateOrderPlacement checks spread sanity FIRST
- [ ] validateOrderPlacement checks depth threshold SECOND
- [ ] All 13 custom errors defined and used correctly

### TreasuryVault
- [ ] deposit calls accrueManagementFee BEFORE balance change
- [ ] withdraw calls accrueManagementFee BEFORE balance change
- [ ] withdraw subtracts accruedPerformanceFees + accruedManagementFees from available
- [ ] deployToStrategy calls strategy.acceptDeployment AFTER safeTransfer
- [ ] recallFromStrategy reads strategy ERC20 balance (not trusted amount)
- [ ] recallFromStrategy tracks losses when returned < deployed
- [ ] recallFromStrategy accrues performance fee when returned > deployed
- [ ] receiveEmergencyReturn accepts without requiring active deployment
- [ ] _assertBalanceConsistency runs after withdraw, recallFromStrategy, distributeFees
- [ ] All 7 custom errors defined

### DexStrategy
- [ ] acceptDeployment only callable by address(vault)
- [ ] acceptDeployment reverts if pairHasActiveDeployment[pairId] is true
- [ ] deployLiquidity reverts if !pairHasActiveDeployment[pairId]
- [ ] deployLiquidity reads currentSpread from DEX
- [ ] deployLiquidity passes vault.tokenBalances() to validateOrderPlacement (NOT strategy balance)
- [ ] deployLiquidity passes vault.pairExposure() to validateOrderPlacement
- [ ] emergencyUnwind clears deployment bindings BEFORE returning funds
- [ ] emergencyUnwind calls vault.receiveEmergencyReturn (NOT vault.recallFromStrategy)
- [ ] _returnTokenToVault uses safeIncreaseAllowance + receiveEmergencyReturn
- [ ] All 6 custom errors defined

### LendingModule
- [ ] supplyCapital only callable by approved vaults
- [ ] withdrawCapital debits principalPool FIRST, then interestPool
- [ ] borrow requires 120% collateral (MIN_COLLATERAL_RATIO_BPS = 12000)
- [ ] borrow only callable by approved borrowers
- [ ] repay routes interest to interestPool (NOT principalPool)
- [ ] liquidate only works for loans > maturity + 3 days
- [ ] No direct user deposit functions
- [ ] All 9 custom errors defined

## 🧪 Integration Verification

### TreasuryVault ↔ DexStrategy
- [ ] Deploy 100 USDC to strategy
- [ ] Verify acceptDeployment was called
- [ ] Verify pairHasActiveDeployment[pairId] = true
- [ ] Verify deploymentPrincipal[deploymentId] = 100 USDC
- [ ] Strategy can deployLiquidity
- [ ] emergencyUnwind returns all funds to vault
- [ ] Vault receives funds via receiveEmergencyReturn

### RiskController ↔ DexStrategy
- [ ] Oracle signal submitted with valid signature
- [ ] Strategy reads recommended tick width
- [ ] validateOrderPlacement enforces spread sanity
- [ ] validateOrderPlacement enforces depth threshold
- [ ] Circuit breaker blocks deployLiquidity

### TreasuryVault ↔ LendingModule
- [ ] Vault can supplyCapital to lending module
- [ ] principalPool increases correctly
- [ ] Vault can withdrawCapital
- [ ] Principal debited before interest
- [ ] Borrower can borrow with sufficient collateral
- [ ] Borrower can repay loan
- [ ] Interest routed to interestPool

## 📊 Offchain Verification

### Risk Signal Engine
- [ ] Service starts on port 8080
- [ ] GET /health returns 200
- [ ] GET /risk-signal/{pair_id} returns valid signal
- [ ] pegDeviation computed correctly
- [ ] orderbookDepthBid/Ask computed correctly
- [ ] Nonce increments correctly

### Oracle Relay
- [ ] Reads current nonce from RiskController
- [ ] Fetches signal from risk engine
- [ ] Computes EIP-712 digest correctly
- [ ] Signs with oracle private key
- [ ] Submits to updateOracleSignal
- [ ] Transaction succeeds with nonce N+1
- [ ] Subsequent submission with nonce N fails (replay protection)

## 🚀 Deployment Verification

### Testnet Deployment
- [ ] All 6 contracts deployed
- [ ] GovernanceRoles address recorded
- [ ] RiskController address recorded
- [ ] TreasuryVault address recorded
- [ ] DexStrategy address recorded
- [ ] LendingModule address recorded
- [ ] ReportingAdapter address recorded

### Role Configuration
- [ ] TREASURY_MANAGER_ROLE granted
- [ ] RISK_OFFICER_ROLE granted
- [ ] STRATEGIST_ROLE granted
- [ ] ORACLE_ROLE granted
- [ ] All roles verified with hasRole

### Contract Configuration
- [ ] TreasuryVault.approvedTokens[USDC] = true
- [ ] TreasuryVault.approvedStrategies[strategy] = true
- [ ] TreasuryVault.feeTreasury set
- [ ] TreasuryVault.performanceFeeBps set
- [ ] TreasuryVault.managementFeeBps set
- [ ] LendingModule.approvedVaults[vault] = true
- [ ] LendingModule term rates configured (30/60/90 days)

### End-to-End Flow
- [ ] Deposit 1000 USDC to vault
- [ ] Deploy 500 USDC to strategy for pair A
- [ ] Strategy accepts deployment
- [ ] Configure strategy for pair A
- [ ] Deploy liquidity (place orders on DEX)
- [ ] Oracle submits risk signal
- [ ] Adjust positions based on new signal
- [ ] Emergency unwind
- [ ] Verify all 500 USDC returned to vault
- [ ] Withdraw 1000 USDC from vault

## 📈 Performance Verification

### Gas Usage
- [ ] deposit < 150,000 gas
- [ ] withdraw < 200,000 gas
- [ ] deployToStrategy < 250,000 gas
- [ ] recallFromStrategy < 200,000 gas
- [ ] updateOracleSignal < 150,000 gas
- [ ] deployLiquidity < 500,000 gas (per pair)

### Event Emissions
- [ ] All state changes emit events
- [ ] Event parameters match specification
- [ ] ReportingAdapter events emitted correctly
- [ ] Event indexer captures all events

## ✅ Final Sign-Off

- [ ] All tests passing
- [ ] Coverage targets met
- [ ] All integration points verified
- [ ] Offchain services operational
- [ ] Deployment successful
- [ ] End-to-end flow complete
- [ ] Documentation reviewed
- [ ] No hardcoded values
- [ ] No TODO comments
- [ ] No mock implementations

**Sign-off Date**: _________________

**Reviewer**: _________________

**Notes**: _________________

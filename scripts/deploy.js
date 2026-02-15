const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying TempoVault to Tempo Chain");
  console.log("Deployer address:", deployer.address);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  // Constants
  const TEMPO_DEX_ADDRESS = "0xDEc0000000000000000000000000000000000000";
  const governanceAdmin = process.env.GOVERNANCE_ADMIN;
  const testUsdc = process.env.TEST_USDC_ADDRESS;
  const feeTreasury = process.env.FEE_TREASURY_ADDRESS;
  const collateralToken = process.env.COLLATERAL_TOKEN_ADDRESS;
  const performanceFeeBps = parseInt(process.env.PERFORMANCE_FEE_BPS);
  const managementFeeBps = parseInt(process.env.MANAGEMENT_FEE_BPS);

  console.log("\nTempo DEX:", TEMPO_DEX_ADDRESS);
  console.log("Governance Admin:", governanceAdmin);

  // Deploy GovernanceRoles
  console.log("\n1. Deploying GovernanceRoles...");
  const GovernanceRoles = await hre.ethers.getContractFactory("GovernanceRoles");
  const governance = await GovernanceRoles.deploy(governanceAdmin);
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("✅ GovernanceRoles deployed at:", governanceAddress);

  // Deploy RiskController
  console.log("\n2. Deploying RiskController...");
  const RiskController = await hre.ethers.getContractFactory("RiskController");
  const defaultRiskParams = {
    maxExposurePerPairBps: 3000,
    maxTickDeviation: 200,
    maxImbalanceBps: 9000,
    maxOrderSize: hre.ethers.parseEther("50000"),
    minReserveBps: 2000,
    oracleStalenessThreshold: 300,
    maxSpreadSanityTicks: 100,
    minDepthThreshold: hre.ethers.parseEther("100000"),
  };
  const riskController = await RiskController.deploy(governanceAddress, defaultRiskParams);
  await riskController.waitForDeployment();
  const riskControllerAddress = await riskController.getAddress();
  console.log("✅ RiskController deployed at:", riskControllerAddress);

  // Deploy TreasuryVault
  console.log("\n3. Deploying TreasuryVault...");
  const TreasuryVault = await hre.ethers.getContractFactory("TreasuryVault");
  const vault = await TreasuryVault.deploy(
    1, // domain
    governanceAdmin,
    governanceAddress,
    riskControllerAddress
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ TreasuryVault deployed at:", vaultAddress);

  // Configure vault
  console.log("\n4. Configuring TreasuryVault...");
  let tx = await vault.setApprovedToken(testUsdc, true);
  await tx.wait();
  console.log("✅ Approved USDC token");

  tx = await vault.setFeeConfig(feeTreasury, performanceFeeBps, managementFeeBps);
  await tx.wait();
  console.log("✅ Fee configuration set");

  // Deploy DexStrategy
  console.log("\n5. Deploying DexStrategy...");
  const DexStrategy = await hre.ethers.getContractFactory("DexStrategy");
  const strategy = await DexStrategy.deploy(
    governanceAddress,
    riskControllerAddress,
    TEMPO_DEX_ADDRESS,
    vaultAddress
  );
  await strategy.waitForDeployment();
  const strategyAddress = await strategy.getAddress();
  console.log("✅ DexStrategy deployed at:", strategyAddress);
  console.log("   Using Tempo DEX at:", TEMPO_DEX_ADDRESS);

  tx = await vault.setApprovedStrategy(strategyAddress, true);
  await tx.wait();
  console.log("✅ Approved DexStrategy");

  // Deploy LendingModule
  console.log("\n6. Deploying LendingModule...");
  const LendingModule = await hre.ethers.getContractFactory("LendingModule");
  const lending = await LendingModule.deploy(governanceAddress, collateralToken);
  await lending.waitForDeployment();
  const lendingAddress = await lending.getAddress();
  console.log("✅ LendingModule deployed at:", lendingAddress);

  tx = await lending.setApprovedVault(vaultAddress, true);
  await tx.wait();
  console.log("✅ Approved vault in LendingModule");

  const TERM_30_DAYS = await lending.TERM_30_DAYS();
  const TERM_60_DAYS = await lending.TERM_60_DAYS();
  const TERM_90_DAYS = await lending.TERM_90_DAYS();

  tx = await lending.setTermRate(TERM_30_DAYS, 500);
  await tx.wait();
  tx = await lending.setTermRate(TERM_60_DAYS, 750);
  await tx.wait();
  tx = await lending.setTermRate(TERM_90_DAYS, 1000);
  await tx.wait();
  console.log("✅ Lending term rates configured");

  // Deploy ReportingAdapter
  console.log("\n7. Deploying ReportingAdapter...");
  const ReportingAdapter = await hre.ethers.getContractFactory("ReportingAdapter");
  const reporter = await ReportingAdapter.deploy();
  await reporter.waitForDeployment();
  const reporterAddress = await reporter.getAddress();
  console.log("✅ ReportingAdapter deployed at:", reporterAddress);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("GovernanceRoles:   ", governanceAddress);
  console.log("RiskController:    ", riskControllerAddress);
  console.log("TreasuryVault:     ", vaultAddress);
  console.log("DexStrategy:       ", strategyAddress);
  console.log("LendingModule:     ", lendingAddress);
  console.log("ReportingAdapter:  ", reporterAddress);
  console.log("=".repeat(60));

  // Save deployment addresses to .env
  console.log("\n✅ Deployment complete!");
  console.log("\nUpdate your .env with these addresses:");
  console.log(`GOVERNANCE_ROLES_ADDRESS=${governanceAddress}`);
  console.log(`RISK_CONTROLLER_ADDRESS=${riskControllerAddress}`);
  console.log(`TREASURY_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`DEX_STRATEGY_ADDRESS=${strategyAddress}`);
  console.log(`LENDING_MODULE_ADDRESS=${lendingAddress}`);
  console.log(`REPORTING_ADAPTER_ADDRESS=${reporterAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

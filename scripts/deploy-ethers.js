const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Read compiled contract artifacts from Forge
function getContractArtifact(contractName) {
  const artifactPath = path.join(__dirname, "..", "out", contractName + ".sol", contractName + ".json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
  };
}

async function main() {
  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("Deploying TempoVault to Tempo Chain");
  console.log("Deployer address:", wallet.address);

  const network = await provider.getNetwork();
  console.log("Chain ID:", network.chainId.toString());

  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH\\n");

  // Constants from .env
  const TEMPO_DEX_ADDRESS = "0xDEc0000000000000000000000000000000000000";
  const governanceAdmin = process.env.GOVERNANCE_ADMIN;
  const testUsdc = process.env.TEST_USDC_ADDRESS;
  const feeTreasury = process.env.FEE_TREASURY_ADDRESS;
  const collateralToken = process.env.COLLATERAL_TOKEN_ADDRESS;
  const performanceFeeBps = parseInt(process.env.PERFORMANCE_FEE_BPS);
  const managementFeeBps = parseInt(process.env.MANAGEMENT_FEE_BPS);

  console.log("Tempo DEX:", TEMPO_DEX_ADDRESS);
  console.log("Governance Admin:", governanceAdmin, "\\n");

  // 1. Deploy GovernanceRoles
  console.log("1. Deploying GovernanceRoles...");
  const GovernanceRoles = getContractArtifact("GovernanceRoles");
  const governanceFactory = new ethers.ContractFactory(
    GovernanceRoles.abi,
    GovernanceRoles.bytecode,
    wallet
  );
  const governance = await governanceFactory.deploy(governanceAdmin);
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("✅ GovernanceRoles:", governanceAddress);

  // 2. Deploy RiskController
  console.log("\\n2. Deploying RiskController...");
  const RiskController = getContractArtifact("RiskController");
  const riskFactory = new ethers.ContractFactory(
    RiskController.abi,
    RiskController.bytecode,
    wallet
  );

  const defaultRiskParams = {
    maxExposurePerPairBps: 3000,
    maxTickDeviation: 200,
    maxImbalanceBps: 9000,
    maxOrderSize: ethers.parseEther("50000"),
    minReserveBps: 2000,
    oracleStalenessThreshold: 300,
    maxSpreadSanityTicks: 100,
    minDepthThreshold: ethers.parseEther("100000"),
  };

  const riskController = await riskFactory.deploy(governanceAddress, defaultRiskParams);
  await riskController.waitForDeployment();
  const riskControllerAddress = await riskController.getAddress();
  console.log("✅ RiskController:", riskControllerAddress);

  // 3. Deploy TreasuryVault
  console.log("\\n3. Deploying TreasuryVault...");
  const TreasuryVault = getContractArtifact("TreasuryVault");
  const vaultFactory = new ethers.ContractFactory(
    TreasuryVault.abi,
    TreasuryVault.bytecode,
    wallet
  );

  const vault = await vaultFactory.deploy(
    1, // domain
    governanceAdmin,
    governanceAddress,
    riskControllerAddress
  );
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ TreasuryVault:", vaultAddress);

  // 4. Configure vault
  console.log("\\n4. Configuring TreasuryVault...");
  let tx = await vault.setApprovedToken(testUsdc, true);
  await tx.wait();
  console.log("✅ Approved USDC token");

  tx = await vault.setFeeConfig(feeTreasury, performanceFeeBps, managementFeeBps);
  await tx.wait();
  console.log("✅ Fee configuration set");

  // 5. Deploy DexStrategy
  console.log("\\n5. Deploying DexStrategy...");
  const DexStrategy = getContractArtifact("DexStrategy");
  const strategyFactory = new ethers.ContractFactory(
    DexStrategy.abi,
    DexStrategy.bytecode,
    wallet
  );

  const strategy = await strategyFactory.deploy(
    governanceAddress,
    riskControllerAddress,
    TEMPO_DEX_ADDRESS,
    vaultAddress,
    {
      gasLimit: 15000000, // Increased gas limit
    }
  );
  await strategy.waitForDeployment();
  const strategyAddress = await strategy.getAddress();
  console.log("✅ DexStrategy:", strategyAddress);
  console.log("   Using Tempo DEX:", TEMPO_DEX_ADDRESS);

  tx = await vault.setApprovedStrategy(strategyAddress, true);
  await tx.wait();
  console.log("✅ Approved DexStrategy");

  // 6. Deploy LendingModule
  console.log("\\n6. Deploying LendingModule...");
  const LendingModule = getContractArtifact("LendingModule");
  const lendingFactory = new ethers.ContractFactory(
    LendingModule.abi,
    LendingModule.bytecode,
    wallet
  );

  const lending = await lendingFactory.deploy(governanceAddress, collateralToken);
  await lending.waitForDeployment();
  const lendingAddress = await lending.getAddress();
  console.log("✅ LendingModule:", lendingAddress);

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

  // 7. Deploy ReportingAdapter
  console.log("\\n7. Deploying ReportingAdapter...");
  const ReportingAdapter = getContractArtifact("ReportingAdapter");
  const reporterFactory = new ethers.ContractFactory(
    ReportingAdapter.abi,
    ReportingAdapter.bytecode,
    wallet
  );

  const reporter = await reporterFactory.deploy();
  await reporter.waitForDeployment();
  const reporterAddress = await reporter.getAddress();
  console.log("✅ ReportingAdapter:", reporterAddress);

  // Summary
  console.log("\\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("GovernanceRoles:   ", governanceAddress);
  console.log("RiskController:    ", riskControllerAddress);
  console.log("TreasuryVault:     ", vaultAddress);
  console.log("DexStrategy:       ", strategyAddress);
  console.log("LendingModule:     ", lendingAddress);
  console.log("ReportingAdapter:  ", reporterAddress);
  console.log("=".repeat(60));

  console.log("\\n✅ Deployment complete!");
  console.log("\\nUpdate your .env with these addresses:");
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
    console.error("\\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });

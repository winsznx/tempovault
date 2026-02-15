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

  console.log("Deploying remaining contracts...");
  console.log("Deployer:", wallet.address);
  console.log("Chain ID:", (await provider.getNetwork()).chainId.toString(), "\\n");

  const governanceAddress = "0xc0Ef1FD12d803BE11574e9d6C7B0763eBFEE3381"; // From previous deployment
  const vaultAddress = "0x373840c06F264ABd5978731349658E200B8127a4";
  const collateralToken = process.env.COLLATERAL_TOKEN_ADDRESS;

  // Deploy LendingModule
  console.log("1. Deploying LendingModule...");
  const LendingModule = getContractArtifact("LendingModule");
  const lendingFactory = new ethers.ContractFactory(
    LendingModule.abi,
    LendingModule.bytecode,
    wallet
  );

  const lending = await lendingFactory.deploy(governanceAddress, collateralToken, {
    gasLimit: 5000000,
  });
  await lending.waitForDeployment();
  const lendingAddress = await lending.getAddress();
  console.log("✅ LendingModule:", lendingAddress);

  // Deploy ReportingAdapter
  console.log("\\n2. Deploying ReportingAdapter...");
  const ReportingAdapter = getContractArtifact("ReportingAdapter");
  const reporterFactory = new ethers.ContractFactory(
    ReportingAdapter.abi,
    ReportingAdapter.bytecode,
    wallet
  );

  const reporter = await reporterFactory.deploy({
    gasLimit: 2000000,
  });
  await reporter.waitForDeployment();
  const reporterAddress = await reporter.getAddress();
  console.log("✅ ReportingAdapter:", reporterAddress);

  console.log("\\n" + "=".repeat(60));
  console.log("SUCCESS!");
  console.log("=".repeat(60));
  console.log("LendingModule:    ", lendingAddress);
  console.log("ReportingAdapter: ", reporterAddress);
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });

const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log("Testing minimal contract deployment on Tempo testnet");
  console.log("Deployer:", wallet.address, "\\n");

  // Minimal contract bytecode (empty contract with just constructor)
  const minimalBytecode = "0x6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea264697066735822122012345678901234567890123456789012345678901234567890123456789012345664736f6c63430008180033";

  console.log("Deploying minimal contract...");
  const tx = await wallet.sendTransaction({
    data: minimalBytecode,
    gasLimit: 1000000,
  });

  console.log("Transaction sent:", tx.hash);
  const receipt = await tx.wait();

  console.log("\\nDeployment result:");
  console.log("Status:", receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED");
  console.log("Contract address:", receipt.contractAddress);
  console.log("Gas used:", receipt.gasUsed.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\\n❌ Error:");
    console.error(error.message);
    process.exit(1);
  });

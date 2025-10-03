import hre from "hardhat";
const { ethers, network } = hre;

async function main() {
  // Get contract address from environment variable
  const address = process.env.CONTRACT_ADDRESS;

  if (!address) {
    console.error("Usage: CONTRACT_ADDRESS=<address> npx hardhat run scripts/evm/get-deployment-block.ts --network <network>");
    console.error("Example: CONTRACT_ADDRESS=0x13fC7Fe676E4FaaE8F4D910d8Ed7fbD3FebDbe88 npx hardhat run scripts/evm/get-deployment-block.ts --network sepolia");
    process.exit(1);
  }

  console.log(`Finding deployment block for contract: ${address}`);

  // Binary search to find deployment block
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);

  let low = Math.max(0, currentBlock - 10000);
  let high = currentBlock;

  console.log(`Searching blocks ${low} to ${high}...`);

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const codeAt = await ethers.provider.getCode(address, mid);

    if (codeAt === "0x") {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  console.log("\n✅ Deployment block:", low);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

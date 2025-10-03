import hre from "hardhat";
const { ethers } = hre;

async function main() {
  const mailerAddress = process.env.CONTRACT_ADDRESS || "0x4CF25f4683f0C64deDF9F9368Bebe8159740335A";

  console.log("Looking for deployment block of:", mailerAddress);

  // Get current block
  const currentBlock = await ethers.provider.getBlockNumber();
  console.log("Current block:", currentBlock);

  // Search recent blocks for deployment transaction
  const searchRange = 1000;
  console.log(`Searching last ${searchRange} blocks...`);

  for (let i = 0; i < searchRange; i++) {
    const blockNum = currentBlock - i;
    try {
      const block = await ethers.provider.getBlock(blockNum, true);

      if (block && block.transactions) {
        for (const txHash of block.transactions) {
          try {
            const receipt = await ethers.provider.getTransactionReceipt(txHash);
            if (receipt && receipt.contractAddress?.toLowerCase() === mailerAddress.toLowerCase()) {
              console.log("\n✅ Found deployment!");
              console.log("Block number:", receipt.blockNumber);
              console.log("Transaction hash:", receipt.hash);
              console.log("Deployer:", receipt.from);
              console.log("Gas used:", receipt.gasUsed.toString());
              return;
            }
          } catch (err) {
            // Skip failed transactions
          }
        }
      }
    } catch (err) {
      console.log(`Error checking block ${blockNum}`);
    }

    if (i % 100 === 0 && i > 0) {
      console.log(`Checked ${i} blocks...`);
    }
  }

  console.log("Deployment block not found in recent blocks");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

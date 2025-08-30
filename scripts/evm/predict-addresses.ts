import { ethers } from "hardhat";

/**
 * @title Address Prediction Script
 * @notice Predict MailBox contract addresses before deployment across chains
 * @dev Uses MailBoxFactory CREATE2 prediction without actual deployment
 */

// USDC addresses on different networks
const USDC_ADDRESSES: { [key: string]: string } = {
  mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  optimism: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
  arbitrum: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  bsc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "scroll-sepolia": "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4"
};

const NETWORKS = [
  "mainnet", "polygon", "optimism", "arbitrum", "base", 
  "avalanche", "bsc", "sepolia", "base-sepolia", "scroll-sepolia"
];

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🔍 MailBox Address Prediction Tool");
  console.log("Deployer:", deployer.address);
  
  // Get owner address from environment or use deployer
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
  console.log("Owner:", ownerAddress);

  // First deploy a factory locally to get the prediction functions
  console.log("\n🏭 Deploying temporary MailBoxFactory for predictions...");
  const MailBoxFactory = await ethers.getContractFactory("MailBoxFactory");
  const factory = await MailBoxFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("Temporary factory at:", factoryAddress);

  // Generate deterministic salts
  const projectName = "MailBox";
  const version = "1.0.0";
  
  const mailerSalt = await factory.generateSalt(projectName, version, "Mailer");
  const mailServiceSalt = await factory.generateSalt(projectName, version, "MailService");
  
  console.log("\n🔮 Generated Salts:");
  console.log("Mailer Salt:", mailerSalt);
  console.log("MailService Salt:", mailServiceSalt);

  console.log("\n📍 Predicted Addresses Across Networks:");
  console.log("=" .repeat(90));
  console.log("Note: Addresses assume same factory deployment address on each network");
  console.log("=" .repeat(90));

  const results: { [key: string]: { mailer: string; mailService: string; usdc: string } } = {};

  for (const network of NETWORKS) {
    const usdcAddress = USDC_ADDRESSES[network];
    if (!usdcAddress) continue;

    // Predict addresses using the factory
    const predictedMailer = await factory.predictMailerAddress(usdcAddress, ownerAddress, mailerSalt);
    const predictedMailService = await factory.predictMailServiceAddress(usdcAddress, ownerAddress, mailServiceSalt);

    results[network] = {
      mailer: predictedMailer,
      mailService: predictedMailService,
      usdc: usdcAddress
    };

    console.log(`\n${network.toUpperCase()}:`);
    console.log(`  USDC:        ${usdcAddress}`);
    console.log(`  Mailer:      ${predictedMailer}`);
    console.log(`  MailService: ${predictedMailService}`);
  }

  // Generate deployment commands
  console.log("\n" + "=".repeat(90));
  console.log("📝 Deployment Commands:");
  console.log("=".repeat(50));
  
  for (const network of NETWORKS) {
    if (results[network]) {
      console.log(`# Deploy to ${network}`);
      console.log(`OWNER_ADDRESS=${ownerAddress} npx hardhat run scripts/deploy-create2.ts --network ${network}`);
      console.log();
    }
  }

  // Verify consistency
  console.log("✅ Address Consistency Check:");
  console.log("=".repeat(50));
  const firstNetwork = NETWORKS[0];
  const referenceAddresses = results[firstNetwork];
  
  let allConsistent = true;
  for (const network of NETWORKS.slice(1)) {
    if (results[network]) {
      const mailerConsistent = results[network].mailer === referenceAddresses?.mailer;
      const mailServiceConsistent = results[network].mailService === referenceAddresses?.mailService;
      const consistent = mailerConsistent && mailServiceConsistent;
      
      console.log(`${network.padEnd(15)}: ${consistent ? "✅ Consistent" : "❌ Different"}`);
      if (!consistent) {
        console.log(`  Mailer: ${mailerConsistent ? "✅" : "❌"} ${results[network].mailer}`);
        console.log(`  MailService: ${mailServiceConsistent ? "✅" : "❌"} ${results[network].mailService}`);
        allConsistent = false;
      }
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`Overall Result: ${allConsistent ? "✅ All addresses will be identical across networks" : "❌ Addresses will differ between networks"}`);
  
  if (allConsistent) {
    console.log("\n🎉 Perfect! Your contracts will have the same addresses on all networks.");
    console.log("This enables seamless cross-chain integration and user experience.");
  } else {
    console.log("\n⚠️  Warning: Address inconsistencies detected.");
    console.log("This usually means different USDC addresses or owner addresses between networks.");
  }

  // Summary table
  console.log("\n📊 Summary Table:");
  console.log("=".repeat(90));
  console.log("Network".padEnd(15) + "Mailer".padEnd(42) + "MailService");
  console.log("-".repeat(90));
  
  for (const network of NETWORKS) {
    if (results[network]) {
      console.log(
        network.padEnd(15) + 
        results[network].mailer.padEnd(42) + 
        results[network].mailService
      );
    }
  }
  
  return results;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Prediction failed:", error);
    process.exit(1);
  });
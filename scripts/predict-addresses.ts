import { ethers } from "hardhat";

// USDC token addresses for different networks
const USDC_ADDRESSES: Record<string, string> = {
  // Mainnets
  mainnet: "0xA0b86a33E6417a8c8df6D0e9D13A4DcF8C7d6E4b",
  polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// Configuration for deterministic deployment
const DEPLOYMENT_CONFIG = {
  projectName: "MailBox",
  version: "v1.2.0",
  factorySalt: "MailBoxFactory_v1.2.0",
};

interface NetworkDeployment {
  network: string;
  chainId: number;
  usdcAddress: string;
  factoryAddress: string;
  mailerAddress: string;
  mailServiceAddress: string;
}

function getBytecodeWithConstructor(contractFactory: any, ...constructorArgs: any[]) {
  // Combine bytecode with encoded constructor args
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    contractFactory.interface.deploy.inputs,
    constructorArgs
  );
  return contractFactory.bytecode + encodedArgs.slice(2); // Remove '0x' prefix from encoded args
}

async function predictFactoryAddress(deployerAddress: string): Promise<string> {
  // For this simplified example, we'll assume factory is deployed with normal deployment
  // In practice, you might also want to use CREATE2 for the factory itself
  console.log("⚠️  Note: Factory address will vary per deployer and deployment order");
  console.log("   For consistent factory addresses, deploy factory with CREATE2 too");
  return "0x1234567890123456789012345678901234567890"; // Placeholder
}

async function predictContractAddresses(
  factoryAddress: string,
  usdcAddress: string,
  ownerAddress: string
): Promise<{mailerAddress: string, mailServiceAddress: string}> {
  
  // Create factory instance for salt generation
  const factory = await ethers.getContractAt("MailBoxFactory", factoryAddress);
  
  // Generate salts (these will be the same across all networks)
  const mailerSalt = await factory.generateSalt(
    DEPLOYMENT_CONFIG.projectName,
    DEPLOYMENT_CONFIG.version,
    "Mailer"
  );
  
  const mailServiceSalt = await factory.generateSalt(
    DEPLOYMENT_CONFIG.projectName,
    DEPLOYMENT_CONFIG.version,
    "MailService"
  );
  
  // Get contract factories and bytecode
  const MailerFactory = await ethers.getContractFactory("Mailer");
  const MailServiceFactory = await ethers.getContractFactory("MailService");
  
  const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, ownerAddress);
  const mailServiceBytecode = getBytecodeWithConstructor(MailServiceFactory, usdcAddress, ownerAddress);
  
  // Predict addresses using the factory
  const mailerAddress = await factory.predictAddress(mailerBytecode, mailerSalt, factoryAddress);
  const mailServiceAddress = await factory.predictAddress(mailServiceBytecode, mailServiceSalt, factoryAddress);
  
  return { mailerAddress, mailServiceAddress };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;

  console.log("=".repeat(80));
  console.log("📍 CROSS-CHAIN ADDRESS PREDICTION (CREATE2)");
  console.log("=".repeat(80));
  console.log("Project:", DEPLOYMENT_CONFIG.projectName);
  console.log("Version:", DEPLOYMENT_CONFIG.version);
  console.log("Deployer:", deployer.address);
  console.log("Owner:", ownerAddress);
  console.log("-".repeat(80));

  // Note: For this demo, we'll assume the factory is deployed normally
  // In production, you'd want to use CREATE2 for the factory too for consistency
  const factoryAddress = await predictFactoryAddress(deployer.address);
  console.log("🏭 Factory address:", factoryAddress);
  console.log("   (Note: Factory address will vary by deployer unless using CREATE2)");
  console.log("-".repeat(80));

  const networks: NetworkDeployment[] = [];

  // Define networks to predict for
  const networksToPredict = [
    { name: "mainnet", chainId: 1 },
    { name: "sepolia", chainId: 11155111 },
    { name: "polygon", chainId: 137 },
    { name: "optimism", chainId: 10 },
    { name: "base", chainId: 8453 },
  ];

  console.log("🌐 PREDICTED ADDRESSES BY NETWORK:");
  console.log("=".repeat(80));
  console.log("Network".padEnd(12), "Chain ID".padEnd(10), "Mailer".padEnd(44), "MailService");
  console.log("-".repeat(80));

  // Deploy a temporary factory for prediction purposes
  console.log("🏗️  Deploying temporary factory for address prediction...");
  const MailBoxFactory = await ethers.getContractFactory("MailBoxFactory");
  const tempFactory = await MailBoxFactory.deploy();
  await tempFactory.waitForDeployment();
  const tempFactoryAddress = await tempFactory.getAddress();

  for (const net of networksToPredict) {
    let usdcAddress = USDC_ADDRESSES[net.name];
    
    // For testnets, use a placeholder address since they would use MockUSDC
    if (net.name === "sepolia" && !usdcAddress) {
      usdcAddress = "0x1234567890123456789012345678901234567890"; // Placeholder for MockUSDC
    }
    
    if (!usdcAddress) continue;

    try {
      const { mailerAddress, mailServiceAddress } = await predictContractAddresses(
        tempFactoryAddress, // Use temp factory for prediction
        usdcAddress,
        ownerAddress
      );

      networks.push({
        network: net.name,
        chainId: net.chainId,
        usdcAddress,
        factoryAddress: tempFactoryAddress,
        mailerAddress,
        mailServiceAddress
      });

      console.log(
        net.name.padEnd(12),
        net.chainId.toString().padEnd(10),
        mailerAddress,
        mailServiceAddress
      );

    } catch (error) {
      console.log(net.name.padEnd(12), net.chainId.toString().padEnd(10), "❌ Error predicting addresses");
    }
  }

  console.log("=".repeat(80));

  // Verify addresses are identical (they should be with CREATE2)
  if (networks.length > 1) {
    const firstMailer = networks[0].mailerAddress;
    const firstMailService = networks[0].mailServiceAddress;
    
    const allMailersMatch = networks.every(net => net.mailerAddress === firstMailer);
    const allMailServicesMatch = networks.every(net => net.mailServiceAddress === firstMailService);

    if (allMailersMatch && allMailServicesMatch) {
      console.log("✅ SUCCESS: All contract addresses are IDENTICAL across networks!");
      console.log("🎯 Universal Mailer address:", firstMailer);
      console.log("🎯 Universal MailService address:", firstMailService);
    } else {
      console.log("❌ WARNING: Addresses are NOT identical across networks");
      if (!allMailersMatch) console.log("   - Mailer addresses differ");
      if (!allMailServicesMatch) console.log("   - MailService addresses differ");
      console.log("   This might be due to different USDC addresses (expected)");
    }
  }

  console.log("=".repeat(80));
  
  console.log("🔍 IMPORTANT NOTES:");
  console.log("-".repeat(80));
  console.log("• Contract addresses will be IDENTICAL if:");
  console.log("  - Same factory deployer address");
  console.log("  - Same owner address");
  console.log("  - Same USDC addresses (or consistently different)");
  console.log("  - Same project version and salts");
  console.log();
  console.log("• Different USDC addresses per network are EXPECTED");
  console.log("• Factory address shown above is just for demonstration");
  console.log("• Use 'deploy-create2.ts' for actual deployment");

  console.log("=".repeat(80));

  // Generate deployment commands
  console.log("📋 DEPLOYMENT COMMANDS:");
  console.log("-".repeat(80));
  
  for (const net of networks.slice(0, 3)) { // Show first 3 as examples
    console.log(`# Deploy on ${net.network}:`);
    console.log(`OWNER_ADDRESS=${ownerAddress} npx hardhat run scripts/deploy-create2.ts --network ${net.network}`);
    console.log();
  }
  console.log("# ... repeat for other networks");

  // Save predictions to file
  const predictionsFile = `address-predictions-${DEPLOYMENT_CONFIG.version}.json`;
  const predictions = {
    timestamp: new Date().toISOString(),
    version: DEPLOYMENT_CONFIG.version,
    deployer: deployer.address,
    owner: ownerAddress,
    tempFactoryAddress,
    networks,
    note: "These predictions assume same factory deployer and parameters across networks"
  };

  require('fs').writeFileSync(predictionsFile, JSON.stringify(predictions, null, 2));
  console.log("💾 Predictions saved to:", predictionsFile);
  console.log("=".repeat(80));
}

main().catch((error) => {
  console.error("❌ Prediction failed:");
  console.error(error);
  process.exitCode = 1;
});
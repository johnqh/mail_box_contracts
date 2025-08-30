import { ethers } from "hardhat";

/**
 * @title CREATE2 Deployment Script
 * @notice Deploy MailBox contracts with deterministic addresses across chains
 * @dev Uses MailBoxFactory for CREATE2 deployment
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
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia testnet
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
  hardhat: "", // Will be set to MockUSDC address
  localhost: "" // Will be set to MockUSDC address
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "hardhat" : network.name;

  console.log("🚀 CREATE2 Deployment Script");
  console.log("Network:", networkName);
  console.log("Chain ID:", network.chainId);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Get owner address from environment or use deployer
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
  console.log("Owner:", ownerAddress);

  // Determine USDC address
  let usdcAddress = USDC_ADDRESSES[networkName];
  
  // Deploy MockUSDC for local networks
  if (!usdcAddress || networkName === "hardhat" || networkName === "localhost") {
    console.log("\n📦 Deploying MockUSDC for local network...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    usdcAddress = await mockUSDC.getAddress();
    console.log("✅ MockUSDC deployed at:", usdcAddress);
  } else {
    console.log("Using USDC at:", usdcAddress);
  }

  // Deploy MailBoxFactory
  console.log("\n🏭 Deploying MailBoxFactory...");
  const MailBoxFactory = await ethers.getContractFactory("MailBoxFactory");
  const factory = await MailBoxFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ MailBoxFactory deployed at:", factoryAddress);

  // Generate deterministic salts
  const projectName = "MailBox";
  const version = "1.0.0";
  
  const mailerSalt = await factory.generateSalt(projectName, version, "Mailer");
  const mailServiceSalt = await factory.generateSalt(projectName, version, "MailService");
  
  console.log("\n🔮 Generated Salts:");
  console.log("Mailer Salt:", mailerSalt);
  console.log("MailService Salt:", mailServiceSalt);

  // Predict addresses before deployment
  const predictedMailer = await factory.predictMailerAddress(usdcAddress, ownerAddress, mailerSalt);
  const predictedMailService = await factory.predictMailServiceAddress(usdcAddress, ownerAddress, mailServiceSalt);
  
  console.log("\n📍 Predicted Addresses:");
  console.log("Mailer will be deployed at:", predictedMailer);
  console.log("MailService will be deployed at:", predictedMailService);

  // Deploy contracts using CREATE2
  console.log("\n📦 Deploying Contracts with CREATE2...");
  
  // Deploy Mailer
  console.log("Deploying Mailer...");
  const mailerTx = await factory.deployMailer(usdcAddress, ownerAddress, mailerSalt);
  const mailerReceipt = await mailerTx.wait();
  
  // Get deployed address from events
  const mailerEvent = mailerReceipt?.logs.find(
    (log: any) => log.fragment?.name === "MailerDeployed"
  );
  const deployedMailer = mailerEvent?.args[0];
  console.log("✅ Mailer deployed at:", deployedMailer);

  // Deploy MailService
  console.log("Deploying MailService...");
  const mailServiceTx = await factory.deployMailService(usdcAddress, ownerAddress, mailServiceSalt);
  const mailServiceReceipt = await mailServiceTx.wait();
  
  // Get deployed address from events
  const mailServiceEvent = mailServiceReceipt?.logs.find(
    (log: any) => log.fragment?.name === "MailServiceDeployed"
  );
  const deployedMailService = mailServiceEvent?.args[0];
  console.log("✅ MailService deployed at:", deployedMailService);

  // Verify addresses match predictions
  console.log("\n✅ Verification:");
  console.log("Mailer address matches prediction:", deployedMailer === predictedMailer);
  console.log("MailService address matches prediction:", deployedMailService === predictedMailService);

  // Check deployment
  const isMailerDeployed = await factory.isContractDeployed(deployedMailer);
  const isMailServiceDeployed = await factory.isContractDeployed(deployedMailService);
  
  console.log("\n📊 Deployment Status:");
  console.log("Mailer deployed:", isMailerDeployed);
  console.log("MailService deployed:", isMailServiceDeployed);

  // Summary
  console.log("\n🎉 Deployment Summary");
  console.log("=".repeat(50));
  console.log("Network:", networkName);
  console.log("Factory:", factoryAddress);
  console.log("USDC:", usdcAddress);
  console.log("Mailer:", deployedMailer);
  console.log("MailService:", deployedMailService);
  console.log("Owner:", ownerAddress);
  console.log("=".repeat(50));

  // Deployment commands for other networks
  if (networkName === "hardhat" || networkName === "localhost") {
    console.log("\n📝 To deploy on other networks with same addresses:");
    console.log(`OWNER_ADDRESS=${ownerAddress} npx hardhat run scripts/deploy-create2.ts --network sepolia`);
    console.log(`OWNER_ADDRESS=${ownerAddress} npx hardhat run scripts/deploy-create2.ts --network polygon`);
    console.log(`OWNER_ADDRESS=${ownerAddress} npx hardhat run scripts/deploy-create2.ts --network arbitrum`);
  }

  return {
    factory: factoryAddress,
    mailer: deployedMailer,
    mailService: deployedMailService,
    usdc: usdcAddress
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
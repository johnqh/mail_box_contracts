import { ethers, network } from "hardhat";

// USDC token addresses for different networks
const USDC_ADDRESSES: Record<string, string> = {
  // Mainnets
  mainnet: "0xA0b86a33E6417a8c8df6D0e9D13A4DcF8C7d6E4b", // USDC on Ethereum
  polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // USDC on Optimism
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC on Arbitrum
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  avalanche: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USDC on Avalanche
  bsc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC on BSC
  gnosis: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83", // USDC on Gnosis
  celo: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", // USDC on Celo
  
  // Testnets - using zero address as placeholder (deploy mock USDC for testing)
  sepolia: "0x0000000000000000000000000000000000000000",
  "base-sepolia": "0x0000000000000000000000000000000000000000",
  "scroll-sepolia": "0x0000000000000000000000000000000000000000",
  
  // Local development
  hardhat: "0x0000000000000000000000000000000000000000",
  localhost: "0x0000000000000000000000000000000000000000",
};

async function deployMockUSDC() {
  console.log("Deploying MockUSDC for testing...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  console.log("MockUSDC deployed to:", await mockUSDC.getAddress());
  return await mockUSDC.getAddress();
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  // Get owner address from environment variable, fallback to deployer
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
  console.log("Contract owner will be:", ownerAddress);

  console.log("=".repeat(50));
  console.log("MULTI-CHAIN DEPLOYMENT SCRIPT");
  console.log("=".repeat(50));
  console.log("Network:", networkName);
  console.log("Chain ID:", network.config.chainId);
  console.log("Deploying contracts with account:", deployer.address);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    console.error("❌ Deployer account has no ETH balance! Please fund the account.");
    process.exit(1);
  }

  // Determine USDC address for the network
  let usdcAddress = USDC_ADDRESSES[networkName];
  
  // For testnets and local networks, deploy mock USDC
  const testNetworks = ["sepolia", "base-sepolia", "scroll-sepolia", "hardhat", "localhost"];
  
  if (testNetworks.includes(networkName)) {
    if (process.env.USDC_ADDRESS) {
      usdcAddress = process.env.USDC_ADDRESS;
      console.log("Using USDC address from environment:", usdcAddress);
    } else {
      usdcAddress = await deployMockUSDC();
      console.log("✅ Deployed MockUSDC for testing");
    }
  } else if (!usdcAddress || usdcAddress === "0x0000000000000000000000000000000000000000") {
    console.error(`❌ No USDC address configured for network: ${networkName}`);
    console.error("Please add the USDC token address to the USDC_ADDRESSES mapping or set USDC_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Using USDC token address:", usdcAddress);
  console.log("-".repeat(50));

  try {
    // Deploy PrivilegedMail
    console.log("📧 Deploying PrivilegedMail...");
    const PrivilegedMail = await ethers.getContractFactory("PrivilegedMail");
    const privilegedMail = await PrivilegedMail.deploy(usdcAddress, ownerAddress);
    await privilegedMail.waitForDeployment();
    
    const privilegedMailAddress = await privilegedMail.getAddress();
    console.log("✅ PrivilegedMail deployed to:", privilegedMailAddress);
    
    const sendFee = await privilegedMail.sendFee();
    console.log("   - Send fee:", ethers.formatUnits(sendFee, 6), "USDC");

    // Deploy MailService
    console.log("📬 Deploying MailService...");
    const MailService = await ethers.getContractFactory("MailService");
    const mailService = await MailService.deploy(usdcAddress, ownerAddress);
    await mailService.waitForDeployment();
    
    const mailServiceAddress = await mailService.getAddress();
    console.log("✅ MailService deployed to:", mailServiceAddress);
    
    const registrationFee = await mailService.registrationFee();
    const delegationFee = await mailService.delegationFee();
    console.log("   - Registration fee:", ethers.formatUnits(registrationFee, 6), "USDC");
    console.log("   - Delegation fee:", ethers.formatUnits(delegationFee, 6), "USDC");

    console.log("=".repeat(50));
    console.log("🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(50));
    console.log("Network:", networkName);
    console.log("Chain ID:", network.config.chainId);
    console.log("USDC Token:", usdcAddress);
    console.log("PrivilegedMail:", privilegedMailAddress);
    console.log("MailService:", mailServiceAddress);
    console.log("=".repeat(50));

    // Save deployment info to file
    const deploymentInfo = {
      network: networkName,
      chainId: network.config.chainId,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      owner: ownerAddress,
      contracts: {
        usdc: usdcAddress,
        privilegedMail: privilegedMailAddress,
        mailService: mailServiceAddress
      },
      fees: {
        sendFee: ethers.formatUnits(sendFee, 6) + " USDC",
        registrationFee: ethers.formatUnits(registrationFee, 6) + " USDC",
        delegationFee: ethers.formatUnits(delegationFee, 6) + " USDC"
      }
    };

    // Write deployment info to deployments directory
    const fs = require('fs');
    const path = require('path');
    const deploymentDir = path.join(__dirname, '..', 'deployments');
    
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentDir, `${networkName}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("📄 Deployment info saved to:", deploymentFile);

  } catch (error) {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("❌ Script execution failed:");
  console.error(error);
  process.exitCode = 1;
});
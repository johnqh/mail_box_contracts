import hre from "hardhat";
import { RpcHelpers } from "@johnqh/types";
const { ethers, network } = hre;

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
  let usdcAddress: string;

  // Local networks (hardhat, localhost) need MockUSDC deployment
  const localNetworks = ["hardhat", "localhost"];

  if (localNetworks.includes(networkName)) {
    // For local networks, always deploy MockUSDC
    if (process.env.USDC_ADDRESS) {
      usdcAddress = process.env.USDC_ADDRESS;
      console.log("Using USDC address from environment:", usdcAddress);
    } else {
      usdcAddress = await deployMockUSDC();
      console.log("✅ Deployed MockUSDC for local testing");
    }
  } else {
    // For all other networks, find chain by chainId from visible chains (including testnets)
    const chainId = network.config.chainId;
    if (!chainId) {
      console.error(`❌ No chainId configured for network: ${networkName}`);
      process.exit(1);
    }

    const visibleChains = RpcHelpers.getVisibleChains(true); // Include testnets
    const chain = visibleChains.find(c => {
      const info = RpcHelpers.getChainInfo({
        chain: c,
        alchemyApiKey: process.env.ALCHEMY_API_KEY,
        etherscanApiKey: process.env.ETHERSCAN_MULTICHAIN_API_KEY
      });
      return info.chainId === chainId;
    });

    if (!chain) {
      console.error(`❌ Unsupported chain ID: ${chainId} for network: ${networkName}`);
      console.error("This chain is not in the visible chains list. Please set USDC_ADDRESS environment variable.");
      process.exit(1);
    }

    const chainConfig = {
      chain,
      alchemyApiKey: process.env.ALCHEMY_API_KEY,
      etherscanApiKey: process.env.ETHERSCAN_MULTICHAIN_API_KEY
    };
    const chainInfo = RpcHelpers.getChainInfo(chainConfig);

    if (!chainInfo.usdcAddress) {
      console.error(`❌ No USDC address available for chain: ${chain} (chainId: ${chainId})`);
      console.error("This chain may not have USDC deployed. Please set USDC_ADDRESS environment variable.");
      process.exit(1);
    }

    usdcAddress = chainInfo.usdcAddress;
    console.log(`Using USDC address from RpcHelper for ${chain}:`, usdcAddress);
  }

  // Ensure address has proper checksum (convert to lowercase first to avoid checksum validation)
  usdcAddress = ethers.getAddress(usdcAddress.toLowerCase());
  console.log("Using USDC token address:", usdcAddress);
  console.log("-".repeat(50));

  try {
    // Deploy Mailer (with integrated MailService functionality)
    console.log("📧 Deploying Mailer with integrated delegation management...");
    const Mailer = await ethers.getContractFactory("Mailer");
    const mailer = await Mailer.deploy(usdcAddress, ownerAddress);
    await mailer.waitForDeployment();
    
    const mailerAddress = await mailer.getAddress();
    console.log("✅ Mailer deployed to:", mailerAddress);
    
    const sendFee = await mailer.sendFee();
    const delegationFee = await mailer.delegationFee();
    console.log("   - Send fee:", ethers.formatUnits(sendFee, 6), "USDC");
    console.log("   - Delegation fee:", ethers.formatUnits(delegationFee, 6), "USDC");

    console.log("=".repeat(50));
    console.log("🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(50));
    console.log("Network:", networkName);
    console.log("Chain ID:", network.config.chainId);
    console.log("USDC Token:", usdcAddress);
    console.log("Mailer (with delegation):", mailerAddress);
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
        mailer: mailerAddress
      },
      fees: {
        sendFee: ethers.formatUnits(sendFee, 6) + " USDC",
        delegationFee: ethers.formatUnits(delegationFee, 6) + " USDC"
      }
    };

    // Write deployment info to deployments directory
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const deploymentDir = path.join(__dirname, '..', '..', 'deployments');
    
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
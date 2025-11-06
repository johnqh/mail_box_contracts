import hre from "hardhat";
import "@nomicfoundation/hardhat-viem";
import { RpcHelpers } from "@sudobility/configs";
import { formatEther, formatUnits, getAddress } from "viem";
const { network } = hre;

async function deployMockUSDC() {
  console.log("Deploying MockUSDC for testing...");
  const mockUSDC = await hre.viem.deployContract("MockUSDC");
  console.log("MockUSDC deployed to:", mockUSDC.address);
  return mockUSDC.address;
}

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const networkName = network.name;

  // Get owner address from environment variable, fallback to deployer
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.account.address;
  console.log("Contract owner will be:", ownerAddress);

  console.log("=".repeat(50));
  console.log("MULTI-CHAIN DEPLOYMENT SCRIPT");
  console.log("=".repeat(50));
  console.log("Network:", networkName);
  console.log("Chain ID:", network.config.chainId);
  console.log("Deploying contracts with account:", deployer.account.address);

  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log("Account balance:", formatEther(balance), "ETH");

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

    // Get chain info directly by chainId
    const chainInfo = RpcHelpers.getChainInfoById(chainId);

    if (!chainInfo) {
      console.error(`❌ Unsupported chain ID: ${chainId} for network: ${networkName}`);
      console.error("This chain is not in the visible chains list. Please set USDC_ADDRESS environment variable.");
      process.exit(1);
    }

    if (!chainInfo.usdcAddress) {
      console.error(`❌ No USDC address available for chain: ${chainInfo.name} (chainId: ${chainId})`);
      console.error("This chain may not have USDC deployed. Please set USDC_ADDRESS environment variable.");
      process.exit(1);
    }

    usdcAddress = chainInfo.usdcAddress;
    console.log(`Using USDC address from RpcHelper for ${chainInfo.name}:`, usdcAddress);
  }

  // Ensure address has proper checksum (convert to lowercase first to avoid checksum validation)
  usdcAddress = getAddress(usdcAddress.toLowerCase());
  console.log("Using USDC token address:", usdcAddress);
  console.log("-".repeat(50));

  try {
    // Deploy Mailer (with integrated MailService functionality)
    console.log("📧 Deploying Mailer with integrated delegation management...");
    const mailer = await hre.viem.deployContract("Mailer", [usdcAddress, ownerAddress]);

    const mailerAddress = mailer.address;
    console.log("✅ Mailer deployed to:", mailerAddress);

    const sendFee = await mailer.read.sendFee() as bigint;
    const delegationFee = await mailer.read.delegationFee() as bigint;
    console.log("   - Send fee:", formatUnits(sendFee, 6), "USDC");
    console.log("   - Delegation fee:", formatUnits(delegationFee, 6), "USDC");

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
      deployer: deployer.account.address,
      owner: ownerAddress,
      contracts: {
        usdc: usdcAddress,
        mailer: mailerAddress
      },
      fees: {
        sendFee: formatUnits(sendFee, 6) + " USDC",
        delegationFee: formatUnits(delegationFee, 6) + " USDC"
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
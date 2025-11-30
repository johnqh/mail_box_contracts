import hre from "hardhat";
import { formatEther, formatUnits, getAddress } from "viem";
import chainsConfig from "../../config/chains.json" with { type: "json" };
const { ethers, upgrades, network } = hre;

type ChainConfig = {
  name: string;
  network: string;
  usdc: string;
};

const evmChains = chainsConfig.evm as Record<string, ChainConfig>;

async function deployMockUSDC() {
  console.log("Deploying MockUSDC for testing...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const address = await mockUSDC.getAddress();
  console.log("MockUSDC deployed to:", address);
  return address;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  // Get owner address from environment variable, fallback to deployer
  const ownerAddress = process.env.EVM_OWNER_ADDRESS || process.env.OWNER_ADDRESS || deployer.address;
  console.log("Contract owner will be:", ownerAddress);

  console.log("=".repeat(50));
  console.log("UPGRADEABLE MULTI-CHAIN DEPLOYMENT SCRIPT");
  console.log("=".repeat(50));
  console.log("Network:", networkName);
  console.log("Chain ID:", network.config.chainId);
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
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
    // For all other networks, look up USDC address from config/chains.json
    const chainId = network.config.chainId;
    if (!chainId) {
      console.error(`❌ No chainId configured for network: ${networkName}`);
      process.exit(1);
    }

    // Get chain info from local config
    const chainInfo = evmChains[chainId.toString()];

    if (!chainInfo) {
      console.error(`❌ Unsupported chain ID: ${chainId} for network: ${networkName}`);
      console.error("Please add this chain to config/chains.json or set USDC_ADDRESS environment variable.");
      process.exit(1);
    }

    if (!chainInfo.usdc) {
      console.error(`❌ No USDC address configured for chain: ${chainInfo.name} (chainId: ${chainId})`);
      console.error("Please add USDC address to config/chains.json or set USDC_ADDRESS environment variable.");
      process.exit(1);
    }

    usdcAddress = chainInfo.usdc;
    console.log(`Using USDC address from config for ${chainInfo.name}:`, usdcAddress);
  }

  // Ensure address has proper checksum (convert to lowercase first to avoid checksum validation)
  usdcAddress = getAddress(usdcAddress.toLowerCase());
  console.log("Using USDC token address:", usdcAddress);
  console.log("-".repeat(50));

  try {
    // Deploy Mailer as UUPS upgradeable proxy
    console.log("📧 Deploying Mailer as UUPS upgradeable proxy...");
    const Mailer = await ethers.getContractFactory("Mailer");

    const mailer = await upgrades.deployProxy(
      Mailer,
      [usdcAddress, ownerAddress],
      {
        kind: 'uups',
        initializer: 'initialize'
      }
    );
    await mailer.waitForDeployment();

    const mailerProxyAddress = await mailer.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(mailerProxyAddress);

    console.log("✅ Mailer proxy deployed to:", mailerProxyAddress);
    console.log("   Implementation deployed to:", implementationAddress);

    const sendFee = await mailer.sendFee() as bigint;
    const delegationFee = await mailer.delegationFee() as bigint;
    console.log("   - Send fee:", formatUnits(sendFee, 6), "USDC");
    console.log("   - Delegation fee:", formatUnits(delegationFee, 6), "USDC");

    console.log("=".repeat(50));
    console.log("🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(50));
    console.log("Network:", networkName);
    console.log("Chain ID:", network.config.chainId);
    console.log("USDC Token:", usdcAddress);
    console.log("Mailer Proxy:", mailerProxyAddress);
    console.log("Mailer Implementation:", implementationAddress);
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
        mailerProxy: mailerProxyAddress,
        mailerImplementation: implementationAddress
      },
      fees: {
        sendFee: formatUnits(sendFee, 6) + " USDC",
        delegationFee: formatUnits(delegationFee, 6) + " USDC"
      },
      upgradeable: {
        kind: "uups",
        admin: ownerAddress // In UUPS, the proxy admin is the owner
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

    const deploymentFile = path.join(deploymentDir, `${networkName}-upgradeable.json`);
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

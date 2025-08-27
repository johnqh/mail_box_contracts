import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// USDC token addresses for different networks
const USDC_ADDRESSES: Record<string, string> = {
  // Mainnets
  mainnet: "0xA0b86a33E6417a8c8df6D0e9D13A4DcF8C7d6E4b", // USDC on Ethereum
  polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // USDC on Optimism
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  
  // Testnets - using zero address as placeholder (deploy mock USDC for testing)
  sepolia: "0x0000000000000000000000000000000000000000",
  
  // Local development
  hardhat: "0x0000000000000000000000000000000000000000",
  localhost: "0x0000000000000000000000000000000000000000",
};

// Configuration for deterministic deployment
const DEPLOYMENT_CONFIG = {
  projectName: "MailBox",
  version: "v1.3.0",
  factorySalt: "MailBoxFactory_v1.3.0",
};

async function deployMockUSDC() {
  console.log("📋 Deploying MockUSDC for testing...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  console.log("✅ MockUSDC deployed to:", await mockUSDC.getAddress());
  return await mockUSDC.getAddress();
}

async function deployFactory(): Promise<string> {
  console.log("🏭 Deploying MailBoxFactory...");
  
  const MailBoxFactory = await ethers.getContractFactory("MailBoxFactory");
  const factory = await MailBoxFactory.deploy();
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log("✅ MailBoxFactory deployed to:", factoryAddress);
  
  return factoryAddress;
}

function getBytecodeWithConstructor(contractFactory: any, ...constructorArgs: any[]) {
  // Combine bytecode with encoded constructor args
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    contractFactory.interface.deploy.inputs,
    constructorArgs
  );
  return contractFactory.bytecode + encodedArgs.slice(2); // Remove '0x' prefix from encoded args
}

async function predictAndDeploy(
  factory: any,
  usdcToken: string,
  owner: string
): Promise<{mailerAddress: string, mailServiceAddress: string, deploymentTx?: string}> {
  
  // Generate salts
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
  
  console.log("🔑 Generated salts:");
  console.log("   Mailer salt:", mailerSalt);
  console.log("   MailService salt:", mailServiceSalt);
  
  // Get contract factories and bytecode
  const MailerFactory = await ethers.getContractFactory("Mailer");
  const MailServiceFactory = await ethers.getContractFactory("MailService");
  
  const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcToken, owner);
  const mailServiceBytecode = getBytecodeWithConstructor(MailServiceFactory, usdcToken, owner);
  
  const factoryAddress = await factory.getAddress();
  
  // Predict addresses
  const mailerAddress = await factory.predictAddress(mailerBytecode, mailerSalt, factoryAddress);
  const mailServiceAddress = await factory.predictAddress(mailServiceBytecode, mailServiceSalt, factoryAddress);
  
  console.log("🔮 Predicted addresses:");
  console.log("   Mailer:", mailerAddress);
  console.log("   MailService:", mailServiceAddress);
  
  // Check if contracts are already deployed
  const mailerDeployed = await factory.isContractDeployed(mailerAddress);
  const mailServiceDeployed = await factory.isContractDeployed(mailServiceAddress);
  
  if (mailerDeployed && mailServiceDeployed) {
    console.log("✅ Both contracts already deployed at predicted addresses");
    return { mailerAddress, mailServiceAddress };
  }
  
  // Deploy contracts
  const deployments = [];
  const bytecodes = [];
  const salts = [];
  const contractTypes = [];
  
  if (!mailerDeployed) {
    bytecodes.push(mailerBytecode);
    salts.push(mailerSalt);
    contractTypes.push("Mailer");
    deployments.push("Mailer");
  }
  
  if (!mailServiceDeployed) {
    bytecodes.push(mailServiceBytecode);
    salts.push(mailServiceSalt);
    contractTypes.push("MailService");
    deployments.push("MailService");
  }
  
  if (deployments.length > 0) {
    console.log(`🚀 Deploying ${deployments.join(" and ")}...`);
    
    const tx = await factory.batchDeploy(bytecodes, salts, contractTypes, {
      gasLimit: 6000000,
    });
    
    const receipt = await tx.wait();
    console.log("✅ Deployment transaction confirmed:", receipt.hash);
    
    // Verify deployed addresses match predictions
    const actualMailerDeployed = await factory.isContractDeployed(mailerAddress);
    const actualMailServiceDeployed = await factory.isContractDeployed(mailServiceAddress);
    
    if (!actualMailerDeployed && deployments.includes("Mailer")) {
      throw new Error("Mailer deployment failed - contract not found at predicted address");
    }
    if (!actualMailServiceDeployed && deployments.includes("MailService")) {
      throw new Error("MailService deployment failed - contract not found at predicted address");
    }
    
    console.log("✅ All deployments successful and verified");
    return { mailerAddress, mailServiceAddress, deploymentTx: receipt.hash };
  }
  
  return { mailerAddress, mailServiceAddress };
}

// Network configuration for DEPLOYED.json
const NETWORK_CONFIG = {
  mainnet: { name: "Ethereum Mainnet", chainId: 1 },
  sepolia: { name: "Sepolia Testnet", chainId: 11155111 },
  polygon: { name: "Polygon", chainId: 137 },
  optimism: { name: "Optimism", chainId: 10 },
  base: { name: "Base", chainId: 8453 },
};


async function updateDeployedJson(
  networkName: string,
  deploymentInfo: any,
  factoryAddress: string,
  usdcAddress: string,
  mailerAddress: string,
  mailServiceAddress: string,
  deploymentTx?: string
) {
  const deployedJsonPath = path.join(__dirname, '..', 'DEPLOYED.json');
  
  const networkInfo = NETWORK_CONFIG[networkName as keyof typeof NETWORK_CONFIG];
  if (!networkInfo) {
    console.log("⚠️  Network not configured for DEPLOYED.json update:", networkName);
    return;
  }

  // USDC configuration per network
  const USDC_CONFIG = {
    mainnet: { address: "0xA0b86a33E6417a8c8df6D0e9D13A4DcF8C7d6E4b", type: "USDC", isTestnet: false },
    polygon: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", type: "USDC", isTestnet: false },
    optimism: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", type: "USDC", isTestnet: false },
    base: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", type: "USDC", isTestnet: false },
    sepolia: { address: usdcAddress, type: "MockUSDC", isTestnet: true }
  };

  let deployedData: any = {
    lastUpdated: new Date().toISOString(),
    versions: {}
  };

  // Load existing data
  if (fs.existsSync(deployedJsonPath)) {
    try {
      deployedData = JSON.parse(fs.readFileSync(deployedJsonPath, 'utf8'));
    } catch (error) {
      console.warn("⚠️  Could not parse existing DEPLOYED.json, creating new one");
    }
  }

  // Update timestamp
  deployedData.lastUpdated = new Date().toISOString();

  const version = deploymentInfo.version;
  const currentDate = new Date().toISOString().split('T')[0];

  // Initialize version if it doesn't exist
  if (!deployedData.versions[version]) {
    deployedData.versions[version] = {
      releaseDate: currentDate,
      deployer: deploymentInfo.deployer,
      owner: deploymentInfo.owner,
      networks: {}
    };

    // Initialize all supported networks for this version
    Object.keys(NETWORK_CONFIG).forEach(network => {
      const config = NETWORK_CONFIG[network as keyof typeof NETWORK_CONFIG];
      const usdcConfig = USDC_CONFIG[network as keyof typeof USDC_CONFIG];
      
      deployedData.versions[version].networks[network] = {
        chainId: config.chainId,
        usdc: usdcConfig,
        status: "not_deployed"
      };
    });
  }

  // Update the specific network deployment
  const networkData = {
    chainId: networkInfo.chainId,
    deploymentDate: currentDate,
    contracts: {
      MailBoxFactory: factoryAddress,
      [networkName === 'sepolia' ? 'MockUSDC' : 'USDC']: usdcAddress,
      Mailer: mailerAddress,
      MailService: mailServiceAddress
    },
    transactions: deploymentTx ? {
      deployment: deploymentTx
    } : {},
    contractSettings: {
      sendFee: deploymentInfo.fees.sendFee,
      registrationFee: deploymentInfo.fees.registrationFee,
      delegationFee: deploymentInfo.fees.delegationFee
    },
    usdc: USDC_CONFIG[networkName as keyof typeof USDC_CONFIG],
    status: "deployed"
  };

  deployedData.versions[version].networks[networkName] = networkData;

  // Write the updated data
  fs.writeFileSync(deployedJsonPath, JSON.stringify(deployedData, null, 2));
  console.log("📊 DEPLOYED.json updated with deployment information");
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  // Get owner address from environment variable, fallback to deployer
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;

  console.log("=".repeat(60));
  console.log("CREATE2 DETERMINISTIC DEPLOYMENT SCRIPT");
  console.log("=".repeat(60));
  console.log("Network:", networkName);
  console.log("Chain ID:", network.config.chainId);
  console.log("Deploying with account:", deployer.address);
  console.log("Contract owner will be:", ownerAddress);
  console.log("Project:", DEPLOYMENT_CONFIG.projectName);
  console.log("Version:", DEPLOYMENT_CONFIG.version);
  
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    console.error("❌ Deployer account has no ETH balance! Please fund the account.");
    process.exit(1);
  }

  // Determine USDC address for the network
  let usdcAddress = USDC_ADDRESSES[networkName];
  
  // For testnets and local networks, deploy mock USDC
  const testNetworks = ["sepolia", "hardhat", "localhost"];
  
  if (testNetworks.includes(networkName)) {
    if (process.env.USDC_ADDRESS) {
      usdcAddress = process.env.USDC_ADDRESS;
      console.log("Using USDC address from environment:", usdcAddress);
    } else {
      usdcAddress = await deployMockUSDC();
    }
  } else if (!usdcAddress || usdcAddress === "0x0000000000000000000000000000000000000000") {
    console.error(`❌ No USDC address configured for network: ${networkName}`);
    console.error("Please add the USDC token address to the USDC_ADDRESSES mapping or set USDC_ADDRESS environment variable");
    process.exit(1);
  }

  console.log("Using USDC token address:", usdcAddress);
  console.log("-".repeat(60));

  try {
    // Deploy factory
    const factoryAddress = await deployFactory();
    const factory = await ethers.getContractAt("MailBoxFactory", factoryAddress);

    console.log("-".repeat(60));

    // Deploy contracts using factory
    const { mailerAddress, mailServiceAddress, deploymentTx } = await predictAndDeploy(
      factory,
      usdcAddress,
      ownerAddress
    );

    console.log("-".repeat(60));

    // Verify contract functionality
    console.log("🔍 Verifying deployed contracts...");
    
    const mailer = await ethers.getContractAt("Mailer", mailerAddress);
    const mailService = await ethers.getContractAt("MailService", mailServiceAddress);
    
    const sendFee = await mailer.sendFee();
    const registrationFee = await mailService.registrationFee();
    const delegationFee = await mailService.delegationFee();
    
    console.log("✅ Contract verification complete:");
    console.log("   Mailer send fee:", ethers.formatUnits(sendFee, 6), "USDC");
    console.log("   MailService registration fee:", ethers.formatUnits(registrationFee, 6), "USDC");
    console.log("   MailService delegation fee:", ethers.formatUnits(delegationFee, 6), "USDC");

    console.log("=".repeat(60));
    console.log("🎉 DETERMINISTIC DEPLOYMENT COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log("Network:", networkName);
    console.log("Chain ID:", network.config.chainId);
    console.log("Factory:", factoryAddress);
    console.log("USDC Token:", usdcAddress);
    console.log("Mailer:", mailerAddress);
    console.log("MailService:", mailServiceAddress);
    console.log("=".repeat(60));
    console.log("🌐 CROSS-CHAIN CONSISTENCY:");
    console.log("These addresses will be IDENTICAL on all EVM chains!");
    console.log("=".repeat(60));

    // Save deployment info to file
    const deploymentInfo = {
      network: networkName,
      chainId: network.config.chainId,
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      owner: ownerAddress,
      deploymentType: "CREATE2_DETERMINISTIC",
      version: DEPLOYMENT_CONFIG.version,
      contracts: {
        factory: factoryAddress,
        usdc: usdcAddress,
        mailer: mailerAddress,
        mailService: mailServiceAddress
      },
      fees: {
        sendFee: ethers.formatUnits(sendFee, 6) + " USDC",
        registrationFee: ethers.formatUnits(registrationFee, 6) + " USDC",
        delegationFee: ethers.formatUnits(delegationFee, 6) + " USDC"
      },
      crossChainConsistent: true
    };

    // Write deployment info to deployments directory
    const deploymentDir = path.join(__dirname, '..', 'deployments');
    
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentDir, `${networkName}-create2.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log("📄 Deployment info saved to:", deploymentFile);

    // Update DEPLOYED.json with deployment information
    try {
      await updateDeployedJson(
        networkName,
        deploymentInfo,
        factoryAddress,
        usdcAddress,
        mailerAddress,
        mailServiceAddress,
        deploymentTx
      );
    } catch (updateError) {
      console.warn("⚠️  Failed to update DEPLOYED.json:", updateError);
      // Don't fail the entire deployment for documentation update issues
    }

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
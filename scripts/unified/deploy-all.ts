/**
 * @title Unified Multi-Chain Deployment Script
 * @description Deploys Mailer contracts to both EVM and Solana networks
 * @notice This script coordinates deployment across multiple chains
 */

import { ethers } from "hardhat";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import fs from 'fs';
import path from 'path';

// Import chain configurations
import { createChainConfig, NETWORK_CONFIGS } from "../../src/utils/chain-config";

interface DeploymentAddresses {
  evm?: {
    network: string;
    chainId: number;
    
    mailer: string;
    usdc: string;
    deployer: string;
    blockNumber: number;
  };
  solana?: {
    network: string;
    
    mailer: string;
    usdcMint: string;
    deployer: string;
    slot: number;
  };
}

async function deployEVM(network: string): Promise<DeploymentAddresses['evm']> {
  console.log(`\n🔧 Deploying to EVM network: ${network}`);

  const [deployer] = await ethers.getSigners();
  console.log("EVM deployer address:", deployer.address);
  console.log("EVM deployer balance:", ethers.formatEther(await deployer.provider!.getBalance(deployer.address)), "ETH");

  // Get network configuration
  const networkConfig = NETWORK_CONFIGS[network];
  if (!networkConfig || !networkConfig.chainId) {
    throw new Error(`Network ${network} not supported for EVM deployment`);
  }

  // Deploy MockUSDC for local/testnet, use existing for mainnet
  let usdcAddress = networkConfig.usdc;
  if (!usdcAddress) {
    console.log("Deploying MockUSDC...");
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDCFactory.deploy();
    await mockUSDC.waitForDeployment();
    usdcAddress = await mockUSDC.getAddress();
    console.log("✅ MockUSDC deployed to:", usdcAddress);
  }

  // Deploy Mailer (with integrated delegation functionality)
  console.log("Deploying Mailer with integrated delegation management...");
  const MailerFactory = await ethers.getContractFactory("Mailer");
  const mailer = await MailerFactory.deploy(usdcAddress, deployer.address);
  await mailer.waitForDeployment();
  const mailerAddress = await mailer.getAddress();
  console.log("✅ Mailer deployed to:", mailerAddress);

  const currentBlock = await deployer.provider!.getBlockNumber();

  return {
    network,
    chainId: networkConfig.chainId,
    mailer: mailerAddress,
    usdc: usdcAddress,
    deployer: deployer.address,
    blockNumber: currentBlock
  };
}

async function deploySolana(network: string, keypairPath?: string): Promise<DeploymentAddresses['solana']> {
  console.log(`\n🔧 Deploying to Solana network: ${network}`);

  // Get network configuration
  const networkConfig = NETWORK_CONFIGS[network];
  if (!networkConfig || !networkConfig.usdcMint) {
    throw new Error(`Network ${network} not supported for Solana deployment`);
  }

  // Load or generate keypair
  let keypair: Keypair;
  if (keypairPath && fs.existsSync(keypairPath)) {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  } else {
    console.log("⚠️  Generating new keypair for deployment (save this for future use!)");
    keypair = Keypair.generate();
    // Optionally save the keypair
    const keypairDir = path.dirname(keypairPath || './solana-keypair.json');
    if (!fs.existsSync(keypairDir)) {
      fs.mkdirSync(keypairDir, { recursive: true });
    }
    fs.writeFileSync(
      keypairPath || './solana-keypair.json',
      JSON.stringify(Array.from(keypair.secretKey))
    );
  }

  console.log("Solana deployer address:", keypair.publicKey.toString());

  const connection = new Connection(networkConfig.rpc, 'confirmed');
  
  // Check SOL balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log("Solana deployer balance:", balance / 1e9, "SOL");

  if (balance === 0) {
    console.log("⚠️  Deployer has no SOL balance. Please fund the account:");
    console.log("   Address:", keypair.publicKey.toString());
    if (network === 'devnet') {
      console.log("   Airdrop: solana airdrop 2", keypair.publicKey.toString(), "--url devnet");
    }
    throw new Error("Insufficient SOL balance for deployment");
  }

  // For this demo, we'll use the pre-defined program IDs
  // In a real deployment, you would use anchor deploy
  console.log("📋 Using pre-configured Solana program IDs:");
  
  const programs = {
    mailer: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF',
  };

  console.log("✅ Mailer program:", programs.mailer);

  const currentSlot = await connection.getSlot();

  return {
    network,
    mailer: programs.mailer,
    usdcMint: networkConfig.usdcMint,
    deployer: keypair.publicKey.toString(),
    slot: currentSlot
  };
}

async function main() {
  console.log("🚀 Mailer Multi-Chain Deployment");
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const evmNetwork = args.find(arg => arg.startsWith('--evm='))?.split('=')[1];
  const solanaNetwork = args.find(arg => arg.startsWith('--solana='))?.split('=')[1];
  const keypairPath = args.find(arg => arg.startsWith('--keypair='))?.split('=')[1];
  const outputPath = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || './deployment-addresses.json';

  if (!evmNetwork && !solanaNetwork) {
    console.log("Usage: npx ts-node scripts/unified/deploy-all.ts [--evm=network] [--solana=network] [--keypair=path] [--output=path]");
    console.log("\nSupported EVM networks:", Object.keys(NETWORK_CONFIGS).filter(n => NETWORK_CONFIGS[n].chainId));
    console.log("Supported Solana networks:", Object.keys(NETWORK_CONFIGS).filter(n => NETWORK_CONFIGS[n].usdcMint));
    process.exit(1);
  }

  const deployment: DeploymentAddresses = {};

  try {
    // Deploy to EVM if specified
    if (evmNetwork) {
      deployment.evm = await deployEVM(evmNetwork);
    }

    // Deploy to Solana if specified
    if (solanaNetwork) {
      deployment.solana = await deploySolana(solanaNetwork, keypairPath);
    }

    // Save deployment addresses
    console.log(`\n💾 Saving deployment addresses to: ${outputPath}`);
    const deploymentDir = path.dirname(outputPath);
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));

    // Create chain configuration
    const chainConfig = createChainConfig(evmNetwork, solanaNetwork);
    if (deployment.evm) {
      chainConfig.evm!.contracts = {
        mailer: deployment.evm.mailer,
        usdc: deployment.evm.usdc
      };
    }
    
    const configPath = outputPath.replace('.json', '-config.json');
    fs.writeFileSync(configPath, JSON.stringify(chainConfig, null, 2));

    console.log("\n🎉 Multi-chain deployment completed successfully!");
    console.log("\n📋 Deployment Summary:");
    
    if (deployment.evm) {
      console.log(`\n📗 EVM (${deployment.evm.network}):`);
      console.log(`   MailService: ${deployment.evm.mailService}`);
      console.log(`   Mailer: ${deployment.evm.mailer}`);
      console.log(`   USDC: ${deployment.evm.usdc}`);
      console.log(`   Block: ${deployment.evm.blockNumber}`);
    }
    
    if (deployment.solana) {
      console.log(`\n🟣 Solana (${deployment.solana.network}):`);
      console.log(`   MailService: ${deployment.solana.mailService}`);
      console.log(`   Mailer: ${deployment.solana.mailer}`);
      console.log(`   USDC: ${deployment.solana.usdcMint}`);
      console.log(`   Slot: ${deployment.solana.slot}`);
    }

    console.log(`\n📄 Addresses saved to: ${outputPath}`);
    console.log(`📄 Configuration saved to: ${configPath}`);

  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);
    process.exit(1);
  }
}

// Run deployment
if (require.main === module) {
  main().catch(console.error);
}

export { deployEVM, deploySolana };
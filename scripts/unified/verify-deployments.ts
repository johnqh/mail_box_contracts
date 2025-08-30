/**
 * @title Multi-Chain Deployment Verification Script
 * @description Verifies that MailBox contracts are properly deployed and configured
 * @notice This script tests basic functionality on both EVM and Solana
 */

import { ethers } from "hardhat";
import { Connection, PublicKey } from "@solana/web3.js";
import fs from 'fs';
import { MailerClient as EVMMailerClient, MailServiceClient as EVMMailServiceClient } from "../../src/evm";
import { createChainConfig } from "../../src/utils/chain-config";

interface DeploymentAddresses {
  evm?: {
    network: string;
    chainId: number;
    mailService: string;
    mailer: string;
    usdc: string;
    deployer: string;
    blockNumber: number;
  };
  solana?: {
    network: string;
    mailService: string;
    mailer: string;
    mailBoxFactory: string;
    usdcMint: string;
    deployer: string;
    slot: number;
  };
}

async function verifyEVM(deployment: NonNullable<DeploymentAddresses['evm']>) {
  console.log(`\n🔍 Verifying EVM deployment on ${deployment.network}...`);

  const provider = new ethers.JsonRpcProvider();
  
  // Verify contracts exist
  console.log("📋 Checking contract deployments...");
  
  const mailServiceCode = await provider.getCode(deployment.mailService);
  const mailerCode = await provider.getCode(deployment.mailer);
  const usdcCode = await provider.getCode(deployment.usdc);

  if (mailServiceCode === "0x") {
    throw new Error(`MailService contract not found at ${deployment.mailService}`);
  }
  if (mailerCode === "0x") {
    throw new Error(`Mailer contract not found at ${deployment.mailer}`);
  }
  if (usdcCode === "0x") {
    throw new Error(`USDC contract not found at ${deployment.usdc}`);
  }

  console.log("✅ All EVM contracts deployed successfully");

  // Test basic functionality
  console.log("🧪 Testing basic EVM functionality...");

  const mailService = new EVMMailServiceClient(deployment.mailService, provider);
  const mailer = new EVMMailerClient(deployment.mailer, provider);

  // Check contract addresses
  const mailServiceAddress = await mailService.getAddress();
  const mailerAddress = await mailer.getAddress();

  if (mailServiceAddress.toLowerCase() !== deployment.mailService.toLowerCase()) {
    throw new Error("MailService address mismatch");
  }
  if (mailerAddress.toLowerCase() !== deployment.mailer.toLowerCase()) {
    throw new Error("Mailer address mismatch");
  }

  // Check USDC integration
  const mailServiceUsdc = await mailService.getUsdcToken();
  const mailerUsdc = await mailer.getUsdcToken();

  if (mailServiceUsdc.toLowerCase() !== deployment.usdc.toLowerCase()) {
    throw new Error("MailService USDC integration failed");
  }
  if (mailerUsdc.toLowerCase() !== deployment.usdc.toLowerCase()) {
    throw new Error("Mailer USDC integration failed");
  }

  // Check fees
  const delegationFee = await mailService.getDelegationFee();
  const sendFee = await mailer.getSendFee();

  console.log(`   Delegation fee: ${ethers.formatUnits(delegationFee, 6)} USDC`);
  console.log(`   Send fee: ${ethers.formatUnits(sendFee, 6)} USDC`);

  console.log("✅ EVM verification completed successfully");

  return {
    contractsDeployed: true,
    delegationFee: delegationFee.toString(),
    sendFee: sendFee.toString(),
    usdcIntegrated: true
  };
}

async function verifySolana(deployment: NonNullable<DeploymentAddresses['solana']>) {
  console.log(`\n🔍 Verifying Solana deployment on ${deployment.network}...`);

  const connection = new Connection(
    deployment.network === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' :
    deployment.network === 'devnet' ? 'https://api.devnet.solana.com' :
    'http://localhost:8899',
    'confirmed'
  );

  console.log("📋 Checking program deployments...");

  // Verify programs exist
  const mailServiceInfo = await connection.getAccountInfo(new PublicKey(deployment.mailService));
  const mailerInfo = await connection.getAccountInfo(new PublicKey(deployment.mailer));
  const factoryInfo = await connection.getAccountInfo(new PublicKey(deployment.mailBoxFactory));
  const usdcInfo = await connection.getAccountInfo(new PublicKey(deployment.usdcMint));

  if (!mailServiceInfo) {
    throw new Error(`MailService program not found at ${deployment.mailService}`);
  }
  if (!mailerInfo) {
    throw new Error(`Mailer program not found at ${deployment.mailer}`);
  }
  if (!factoryInfo) {
    throw new Error(`MailBoxFactory program not found at ${deployment.mailBoxFactory}`);
  }
  if (!usdcInfo) {
    throw new Error(`USDC mint not found at ${deployment.usdcMint}`);
  }

  console.log("✅ All Solana programs found successfully");

  // Verify program accounts are executable
  if (!mailServiceInfo.executable) {
    throw new Error("MailService account is not executable");
  }
  if (!mailerInfo.executable) {
    throw new Error("Mailer account is not executable");
  }
  if (!factoryInfo.executable) {
    throw new Error("MailBoxFactory account is not executable");
  }

  // Verify USDC mint
  if (usdcInfo.data.length === 0) {
    throw new Error("Invalid USDC mint account");
  }

  console.log("🧪 Testing basic Solana functionality...");

  // Test PDA derivations
  const mailServicePda = PublicKey.findProgramAddressSync(
    [Buffer.from('mail_service')],
    new PublicKey(deployment.mailService)
  )[0];

  const mailerPda = PublicKey.findProgramAddressSync(
    [Buffer.from('mailer')],
    new PublicKey(deployment.mailer)
  )[0];

  console.log(`   MailService PDA: ${mailServicePda.toString()}`);
  console.log(`   Mailer PDA: ${mailerPda.toString()}`);

  console.log("✅ Solana verification completed successfully");

  return {
    programsDeployed: true,
    mailServicePda: mailServicePda.toString(),
    mailerPda: mailerPda.toString(),
    usdcMintValid: true
  };
}

async function main() {
  console.log("🔍 MailBox Multi-Chain Deployment Verification");

  // Parse command line arguments
  const args = process.argv.slice(2);
  const inputPath = args.find(arg => arg.startsWith('--input='))?.split('=')[1] || './deployment-addresses.json';

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Deployment file not found: ${inputPath}`);
    console.log("Run the deployment script first: npm run deploy:unified");
    process.exit(1);
  }

  try {
    // Load deployment addresses
    const deployment: DeploymentAddresses = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    const results: any = {
      timestamp: new Date().toISOString(),
      verification: {}
    };

    // Verify EVM deployment
    if (deployment.evm) {
      try {
        results.verification.evm = await verifyEVM(deployment.evm);
      } catch (error) {
        console.error(`❌ EVM verification failed: ${error.message}`);
        results.verification.evm = { error: error.message };
      }
    }

    // Verify Solana deployment
    if (deployment.solana) {
      try {
        results.verification.solana = await verifySolana(deployment.solana);
      } catch (error) {
        console.error(`❌ Solana verification failed: ${error.message}`);
        results.verification.solana = { error: error.message };
      }
    }

    // Save verification results
    const verificationPath = inputPath.replace('.json', '-verification.json');
    fs.writeFileSync(verificationPath, JSON.stringify(results, null, 2));

    console.log("\n🎉 Verification completed!");
    console.log(`📄 Results saved to: ${verificationPath}`);

    // Print summary
    console.log("\n📋 Verification Summary:");
    if (results.verification.evm && !results.verification.evm.error) {
      console.log("✅ EVM deployment verified successfully");
    } else if (results.verification.evm?.error) {
      console.log("❌ EVM deployment verification failed");
    }

    if (results.verification.solana && !results.verification.solana.error) {
      console.log("✅ Solana deployment verified successfully");
    } else if (results.verification.solana?.error) {
      console.log("❌ Solana deployment verification failed");
    }

    // Exit with error code if any verification failed
    const hasErrors = 
      (results.verification.evm?.error) ||
      (results.verification.solana?.error);

    if (hasErrors) {
      process.exit(1);
    }

  } catch (error) {
    console.error("❌ Verification failed:", error.message);
    process.exit(1);
  }
}

// Run verification
if (require.main === module) {
  main().catch(console.error);
}
/**
 * @title EVM Usage Example for Mailer Contracts
 * @description Simple, working example using MailerClient with correct API
 * @notice Demonstrates messaging and delegation functionality on EVM chains
 */

import hre from "hardhat";
import { MailerClient } from "../src/evm/mailer-client";
import { createPublicClient, createWalletClient, http, defineChain, parseUnits, formatUnits, getContract } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import MockUSDCArtifact from "../artifacts/contracts/MockUSDC.sol/MockUSDC.json" assert { type: "json" };

// Define hardhat local chain for development
const hardhatLocal = defineChain({
  id: 1337,
  name: 'Hardhat Local',
  network: 'hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
});

async function evmUsageExample() {
  console.log("🚀 Mailer EVM Usage Example");
  console.log("============================================");

  // ===== SETUP =====
  console.log("\n📋 Setting up providers and accounts...");

  // Setup viem clients
  const publicClient = createPublicClient({
    chain: hardhatLocal,
    transport: http("http://localhost:8545")
  });

  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");

  const walletClient = createWalletClient({
    account,
    chain: hardhatLocal,
    transport: http("http://localhost:8545")
  });

  console.log("📍 Deployer address:", account.address);

  // ===== DEPLOY USDC =====
  console.log("\n💰 Deploying MockUSDC...");

  const mockUSDC = await hre.viem.deployContract("MockUSDC");
  const usdcAddress = mockUSDC.address;

  console.log("✅ MockUSDC deployed at:", usdcAddress);

  // ===== DEPLOY MAILER =====
  console.log("\n📦 Deploying MailerClient...");

  try {
    const mailerClient = await MailerClient.deploy(
      walletClient,
      publicClient,
      account.address,
      usdcAddress,
      account.address // owner
    );

    const mailerAddress = mailerClient.getAddress();
    console.log("✅ MailerClient deployed at:", mailerAddress);

    // ===== SETUP USDC =====
    console.log("\n💳 Setting up USDC tokens...");

    const usdcAmount = parseUnits("100", 6); // 100 USDC
    await mockUSDC.write.mint([account.address, usdcAmount], { account: account.address });
    await mockUSDC.write.approve([mailerAddress, usdcAmount], { account: account.address });

    const balance = await mockUSDC.read.balanceOf([account.address]);
    console.log("💰 USDC balance:", formatUnits(balance, 6), "USDC");
    
    // ===== CHECK FEES =====
    console.log("\n📊 Checking current fees...");

    const sendFee = await mailerClient.getSendFee();
    const delegationFee = await mailerClient.getDelegationFee();

    console.log("📧 Send fee:", formatUnits(sendFee, 6), "USDC");
    console.log("👥 Delegation fee:", formatUnits(delegationFee, 6), "USDC");
    
    // ===== SEND MESSAGES =====
    console.log("\n📧 Sending messages...");

    // Send priority message (with revenue sharing)
    console.log("Sending priority message...");
    const priorityHash = await mailerClient.sendPriority(
      account.address, // to (recipient)
      "EVM Priority Message", // subject
      "This is a priority message with 90% revenue share!", // body
      walletClient,
      account.address
    );

    console.log("✅ Priority message sent! Hash:", priorityHash);

    // Wait for transaction
    const priorityReceipt = await publicClient.waitForTransactionReceipt({
      hash: priorityHash
    });
    console.log("📦 Mined in block:", priorityReceipt.blockNumber);

    // Send standard message (fee only)
    console.log("Sending standard message...");
    const standardHash = await mailerClient.send(
      account.address, // to (recipient)
      "EVM Standard Message", // subject
      "This is a standard message with 10% fee only.", // body
      walletClient,
      account.address
    );

    console.log("✅ Standard message sent! Hash:", standardHash);
    
    // ===== CHECK REVENUE =====
    console.log("\n💰 Checking claimable revenue...");

    const claimInfo = await mailerClient.getRecipientClaimable(account.address);
    console.log("💸 Claimable amount:", formatUnits(claimInfo.amount, 6), "USDC");
    console.log("⏰ Is expired:", claimInfo.isExpired);

    if (claimInfo.amount > BigInt(0) && !claimInfo.isExpired) {
      console.log("Claiming revenue share...");
      const claimHash = await mailerClient.claimRecipientShare(
        walletClient,
        account.address
      );
      console.log("✅ Revenue claimed! Hash:", claimHash);
    }
    
    // ===== DELEGATION EXAMPLE =====
    console.log("\n👥 Testing delegation...");
    
    const delegateAddress = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"; // Hardhat account #1
    
    console.log("Delegating to:", delegateAddress);
    const delegateHash = await mailerClient.delegateTo(
      delegateAddress,
      walletClient,
      account.address
    );
    
    console.log("✅ Delegation set! Hash:", delegateHash);
    
    // ===== SUMMARY =====
    console.log("\n🎉 EVM Example Completed Successfully!");
    console.log("============================================");
    console.log("📋 What was demonstrated:");
    console.log("  • MockUSDC deployment and setup");  
    console.log("  • MailerClient deployment with viem");
    console.log("  • Priority message sending (with revenue share)");
    console.log("  • Standard message sending (fee only)");
    console.log("  • Revenue share claiming");
    console.log("  • Delegation functionality");
    console.log("\n💡 Key Points:");
    console.log("  • MailerClient handles both messaging AND delegation");
    console.log("  • Uses viem for blockchain interactions");
    console.log("  • Priority messages: 90% revenue share to sender");
    console.log("  • Standard messages: 10% fee only");
    console.log("  • 60-day claim period for revenue shares");
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Example failed:", errorMessage);
    console.log("\n💡 Note: This example requires a running local blockchain:");
    console.log("   Run: npx hardhat node");
  }
}

// Run example if called directly
if (require.main === module) {
  evmUsageExample().catch(console.error);
}

export { evmUsageExample };
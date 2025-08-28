/**
 * @title Basic Usage Examples for MailBox Contracts
 * @description Comprehensive examples showing how to use the MailBox system
 * @notice These examples demonstrate real-world usage patterns for AI assistants
 */

import { ethers } from "ethers";
import { MailerClient, MailServiceClient, MailBoxClient } from "../src/mailer-client";
import { MockUSDC__factory } from "../typechain-types";

// Configuration
const RPC_URL = "http://localhost:8545"; // Local Hardhat node
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat account #0
const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Example address

async function basicUsageExamples() {
  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log("🚀 MailBox Contracts - Basic Usage Examples");
  console.log("Signer address:", signer.address);
  
  // ===== EXAMPLE 1: Deploy Contracts =====
  console.log("\n📦 Example 1: Deploying Contracts");
  
  // Deploy MockUSDC first
  const usdcFactory = new MockUSDC__factory(signer);
  const mockUSDC = await usdcFactory.deploy();
  await mockUSDC.waitForDeployment();
  const usdcAddress = await mockUSDC.getAddress();
  console.log("MockUSDC deployed at:", usdcAddress);
  
  // Deploy both MailBox contracts
  const mailBox = await MailBoxClient.deployBoth(
    signer,
    usdcAddress,
    signer.address
  );
  
  const mailerAddress = await mailBox.mailer.getAddress();
  const mailServiceAddress = await mailBox.mailService.getAddress();
  
  console.log("Mailer deployed at:", mailerAddress);
  console.log("MailService deployed at:", mailServiceAddress);
  
  // ===== EXAMPLE 2: Fund Account and Setup =====
  console.log("\n💰 Example 2: Account Setup and Funding");
  
  // Mint USDC tokens for testing (1000 USDC)
  const usdcAmount = ethers.parseUnits("1000", 6);
  await mockUSDC.mint(signer.address, usdcAmount);
  
  const balance = await mockUSDC.balanceOf(signer.address);
  console.log("USDC balance:", ethers.formatUnits(balance, 6), "USDC");
  
  // Approve both contracts to spend USDC
  const approvalAmount = ethers.parseUnits("500", 6);
  await mockUSDC.approve(mailerAddress, approvalAmount);
  await mockUSDC.approve(mailServiceAddress, approvalAmount);
  
  console.log("Approved contracts to spend 500 USDC each");
  
  // ===== EXAMPLE 3: Domain Registration =====
  console.log("\n🌐 Example 3: Domain Registration");
  
  // Check current registration fee
  const regFee = await mailBox.mailService.getRegistrationFee();
  console.log("Registration fee:", ethers.formatUnits(regFee, 6), "USDC");
  
  // Register a new domain
  const tx1 = await mailBox.mailService.registerDomain("example.mailbox", false);
  await tx1.wait();
  console.log("✅ Registered domain 'example.mailbox'");
  
  // Extend the same domain (different event)
  const tx2 = await mailBox.mailService.registerDomain("example.mailbox", true);
  await tx2.wait();
  console.log("✅ Extended domain 'example.mailbox'");
  
  // ===== EXAMPLE 4: Delegation System =====
  console.log("\n👥 Example 4: Delegation System");
  
  // Create a second account for delegation
  const delegateWallet = ethers.Wallet.createRandom().connect(provider);
  console.log("Delegate address:", delegateWallet.address);
  
  // Fund the delegate with USDC for potential rejection
  await mockUSDC.mint(delegateWallet.address, ethers.parseUnits("100", 6));
  await mockUSDC.connect(delegateWallet).approve(mailServiceAddress, ethers.parseUnits("50", 6));
  
  // Check delegation fee
  const delFee = await mailBox.mailService.getDelegationFee();
  console.log("Delegation fee:", ethers.formatUnits(delFee, 6), "USDC");
  
  // Delegate to the new address
  const tx3 = await mailBox.mailService.delegateTo(delegateWallet.address);
  await tx3.wait();
  console.log("✅ Delegated email handling to", delegateWallet.address);
  
  // Check the delegation
  const currentDelegate = await mailBox.mailService.getDelegation(signer.address);
  console.log("Current delegate:", currentDelegate);
  
  // Delegate can reject the delegation
  const mailServiceDelegate = new MailServiceClient(mailServiceAddress, delegateWallet);
  const tx4 = await mailServiceDelegate.rejectDelegation(signer.address);
  await tx4.wait();
  console.log("✅ Delegate rejected the delegation");
  
  // Verify delegation was cleared
  const clearedDelegate = await mailBox.mailService.getDelegation(signer.address);
  console.log("Delegation after rejection:", clearedDelegate); // Should be 0x0000...
  
  // ===== EXAMPLE 5: Messaging - Priority vs Standard =====
  console.log("\n📧 Example 5: Messaging System");
  
  // Check current send fee
  const sendFee = await mailBox.mailer.getSendFee();
  console.log("Base send fee:", ethers.formatUnits(sendFee, 6), "USDC");
  
  // Send priority message (full fee + revenue share)
  console.log("\n🚀 Sending Priority Message:");
  const priorityTx = await mailBox.mailer.sendPriority(
    "Welcome to MailBox!",
    "This is a priority message with revenue sharing. You'll get 90% back!"
  );
  await priorityTx.wait();
  console.log("✅ Priority message sent");
  
  // Check claimable amount immediately after sending
  const claimInfo = await mailBox.mailer.getRecipientClaimable(signer.address);
  console.log("Claimable amount:", ethers.formatUnits(claimInfo.amount, 6), "USDC");
  console.log("Expires at:", new Date(Number(claimInfo.expiresAt) * 1000).toISOString());
  console.log("Is expired:", claimInfo.isExpired);
  
  // Send standard message (10% fee only)
  console.log("\n📮 Sending Standard Message:");
  const standardTx = await mailBox.mailer.send(
    "Standard Message",
    "This is a standard message with only 10% fee, no revenue share."
  );
  await standardTx.wait();
  console.log("✅ Standard message sent");
  
  // ===== EXAMPLE 6: Revenue Claims =====
  console.log("\n💰 Example 6: Revenue Claiming");
  
  // Claim recipient share from priority message
  const claimTx = await mailBox.mailer.claimRecipientShare();
  await claimTx.wait();
  console.log("✅ Claimed recipient revenue share");
  
  // Check balance after claim
  const balanceAfterClaim = await mockUSDC.balanceOf(signer.address);
  console.log("USDC balance after claim:", ethers.formatUnits(balanceAfterClaim, 6), "USDC");
  
  // Check owner's claimable amount
  const ownerClaimable = await mailBox.mailer.getOwnerClaimable();
  console.log("Owner claimable:", ethers.formatUnits(ownerClaimable, 6), "USDC");
  
  // Owner claims their share
  const ownerClaimTx = await mailBox.mailer.claimOwnerShare();
  await ownerClaimTx.wait();
  console.log("✅ Owner claimed their share");
  
  // ===== EXAMPLE 7: Prepared Messages =====
  console.log("\n📝 Example 7: Prepared Messages");
  
  // Send prepared priority message
  const preparedPriorityTx = await mailBox.mailer.sendPriorityPrepared("msg-001");
  await preparedPriorityTx.wait();
  console.log("✅ Prepared priority message sent with ID: msg-001");
  
  // Send prepared standard message
  const preparedStandardTx = await mailBox.mailer.sendPrepared("msg-002");
  await preparedStandardTx.wait();
  console.log("✅ Prepared standard message sent with ID: msg-002");
  
  // ===== EXAMPLE 8: Contract Information =====
  console.log("\n📊 Example 8: Contract Information");
  
  console.log("Contract Addresses:");
  console.log("- MockUSDC:", usdcAddress);
  console.log("- Mailer:", mailerAddress);
  console.log("- MailService:", mailServiceAddress);
  
  console.log("\nFees:");
  console.log("- Domain Registration:", ethers.formatUnits(await mailBox.mailService.getRegistrationFee(), 6), "USDC");
  console.log("- Delegation:", ethers.formatUnits(await mailBox.mailService.getDelegationFee(), 6), "USDC");
  console.log("- Message Sending:", ethers.formatUnits(await mailBox.mailer.getSendFee(), 6), "USDC");
  
  console.log("\nUSDC Addresses:");
  console.log("- Mailer USDC:", await mailBox.mailer.getUsdcToken());
  console.log("- MailService USDC:", await mailBox.mailService.getUsdcToken());
  
  console.log("\n🎉 All examples completed successfully!");
}

// Advanced usage patterns
async function advancedUsageExamples() {
  console.log("\n🔧 Advanced Usage Patterns");
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // ===== PATTERN 1: Connecting to Existing Contracts =====
  console.log("\n🔌 Pattern 1: Connecting to Existing Contracts");
  
  // If you know the contract addresses
  const existingMailer = new MailerClient("0x...", provider);
  const existingMailService = new MailServiceClient("0x...", provider);
  const existingMailBox = new MailBoxClient("0x...", "0x...", provider);
  
  console.log("✅ Connected to existing contracts");
  
  // ===== PATTERN 2: Event Listening =====
  console.log("\n👂 Pattern 2: Event Listening");
  
  // Listen for mail sent events
  const mailer = new MailerClient("0x...", provider);
  const contract = mailer.getContract();
  
  contract.on("MailSent", (from, to, subject, body, event) => {
    console.log("📧 Mail received:");
    console.log("From:", from);
    console.log("To:", to);
    console.log("Subject:", subject);
    console.log("Body:", body);
    console.log("Transaction:", event.transactionHash);
  });
  
  // Listen for delegation events
  const mailService = new MailServiceClient("0x...", provider);
  const serviceContract = mailService.getContract();
  
  serviceContract.on("DelegationSet", (delegator, delegate, event) => {
    console.log("👥 Delegation updated:");
    console.log("Delegator:", delegator);
    console.log("New delegate:", delegate);
    console.log("Transaction:", event.transactionHash);
  });
  
  // ===== PATTERN 3: Error Handling =====
  console.log("\n⚠️ Pattern 3: Error Handling");
  
  try {
    // This will fail if insufficient USDC balance
    await mailer.sendPriority("Subject", "Body");
  } catch (error: any) {
    if (error.reason === "FeePaymentRequired") {
      console.log("❌ Insufficient USDC balance or approval");
      // Handle by funding account or increasing approval
    } else if (error.reason === "OnlyOwner") {
      console.log("❌ Only contract owner can perform this action");
    } else {
      console.log("❌ Unknown error:", error.message);
    }
  }
  
  // ===== PATTERN 4: Batch Operations =====
  console.log("\n📦 Pattern 4: Batch Operations");
  
  // Send multiple messages efficiently
  const messages = [
    { subject: "Message 1", body: "First message" },
    { subject: "Message 2", body: "Second message" },
    { subject: "Message 3", body: "Third message" }
  ];
  
  const txPromises = messages.map(msg => 
    mailer.send(msg.subject, msg.body)
  );
  
  const receipts = await Promise.all(
    txPromises.map(txPromise => txPromise.then(tx => tx.wait()))
  );
  
  console.log(`✅ Sent ${receipts.length} messages in batch`);
  
  console.log("\n🎯 Advanced patterns completed!");
}

// Run examples if called directly
if (require.main === module) {
  basicUsageExamples()
    .then(() => advancedUsageExamples())
    .catch((error) => {
      console.error("❌ Error running examples:", error);
      process.exit(1);
    });
}

export {
  basicUsageExamples,
  advancedUsageExamples
};
/**
 * @title Solana Usage Examples for MailBox Contracts
 * @description Comprehensive examples showing how to use the MailBox Solana programs
 * @notice These examples demonstrate real-world usage patterns for Solana integration
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { MailerClient } from '../src/solana';

// Configuration for Solana devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new Wallet(Keypair.generate()); // In practice, use your actual keypair
const usdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC

// Example program ID (replace with actual deployed program ID)
const MAILER_PROGRAM_ID = new PublicKey('9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF');

async function solanaUsageExamples() {
  console.log('🚀 MailBox Solana Contracts - Usage Examples');
  console.log('Wallet address:', wallet.publicKey.toString());
  
  // ===== EXAMPLE 1: Initialize Clients =====
  console.log('\n📦 Example 1: Initializing Solana Clients');
  
  const mailerClient = new MailerClient(connection, wallet, MAILER_PROGRAM_ID, usdcMint);
  
  console.log('✅ Clients initialized successfully');

  // ===== EXAMPLE 2: Send Messages =====
  console.log('\n📧 Example 2: Sending Messages');
  
  try {
    // Send priority message (with revenue sharing)
    console.log('Sending priority message...');
    const priorityTx = await mailerClient.sendPriority(
      wallet.publicKey, // to
      'Solana Priority Message',
      'This is a priority message with 90% revenue share!'
    );
    console.log('✅ Priority message sent:', priorityTx);

    // Send standard message (fee only)
    console.log('Sending standard message...');
    const standardTx = await mailerClient.send(
      wallet.publicKey, // to
      'Solana Standard Message',
      'This is a standard message with 10% fee only.'
    );
    console.log('✅ Standard message sent:', standardTx);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('⚠️ Message sending failed (likely due to insufficient USDC):', errorMessage);
  }

  // ===== EXAMPLE 3: Delegation Management =====
  console.log('\n👥 Example 3: Delegation Management');
  
  try {
    const delegateKey = Keypair.generate().publicKey;
    console.log('Delegating to:', delegateKey.toString());
    
    const delegationTx = await mailerClient.delegateTo(delegateKey);
    console.log('✅ Delegation set:', delegationTx);
    
    // Check delegation status
    const delegation = await mailerClient.getDelegation(wallet.publicKey);
    if (delegation) {
      console.log('📋 Current delegation:', {
        delegator: delegation.delegator.toString(),
        delegate: delegation.delegate?.toString() || 'None'
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('⚠️ Delegation failed (likely due to insufficient USDC):', errorMessage);
  }

  // ===== EXAMPLE 4: Revenue Claims =====
  console.log('\n💰 Example 4: Revenue Claiming');
  
  try {
    // Check claimable amount
    const claimableInfo = await mailerClient.getRecipientClaimable(wallet.publicKey);
    if (claimableInfo) {
      console.log('📊 Claimable revenue:', {
        amount: `${claimableInfo.amount / 1_000_000} USDC`,
        timestamp: new Date(claimableInfo.timestamp * 1000).toISOString(),
        isExpired: claimableInfo.isExpired
      });

      if (!claimableInfo.isExpired && claimableInfo.amount > 0) {
        const claimTx = await mailerClient.claimRecipientShare();
        console.log('✅ Revenue claimed:', claimTx);
      }
    } else {
      console.log('📊 No claimable revenue found');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('⚠️ Revenue claiming failed:', errorMessage);
  }

  // ===== EXAMPLE 5: Fee Information =====
  console.log('\n💳 Example 5: Fee Information');
  
  try {
    const mailerFees = await mailerClient.getFees();
    console.log('📊 Mailer fees:', {
      sendFee: `${mailerFees.sendFee / 1_000_000} USDC`
    });

    const serviceFees = await mailerClient.getFees();
    console.log('📊 Service fees:', {
      sendFee: `${serviceFees.sendFee / 1_000_000} USDC`,
      delegationFee: `${serviceFees.delegationFee / 1_000_000} USDC`
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log('⚠️ Fee retrieval failed:', errorMessage);
  }

  console.log('\n🎉 Solana examples completed!');
}

// Run examples if called directly
if (require.main === module) {
  solanaUsageExamples().catch(console.error);
}

export { solanaUsageExamples };
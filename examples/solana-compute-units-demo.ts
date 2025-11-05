/**
 * Solana Compute Unit Optimization Demo
 *
 * This example demonstrates how to use compute unit optimization features
 * in the Solana Mailer client for better transaction reliability and performance.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { MailerClient, type ComputeUnitOptions } from '../src/solana/index.js';

async function main() {
  console.log('🚀 Solana Compute Unit Optimization Demo\n');

  // Setup (replace with your actual values)
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = Keypair.generate(); // Use your actual keypair
  const programId = new PublicKey('9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF');
  const usdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // USDC on devnet

  const client = new MailerClient(connection, MailerClient.createWallet(wallet), programId, usdcMint);

  console.log('📊 Compute Unit Examples:\n');

  // Example 1: Basic send with default compute units
  console.log('1. Basic send (no optimization):');
  try {
    const result = await client.send(
      'DWXf4vYnBNRVoYdNMtZv1x6TdNHMfKH3vV5TYvGeEUEw',
      'Test Subject',
      'Test message body',
      false,
      false
      // No compute options - uses default 200k units
    );
    console.log(`   ✅ Sent! Signature: ${result.signature.slice(0, 20)}...`);
    console.log(`   ⚡ Default compute units used\n`);
  } catch (error) {
    console.log(`   ⚠️ Send failed: ${error}\n`);
  }

  // Example 2: Send with fixed compute unit limit
  console.log('2. Send with fixed compute unit limit:');
  const fixedComputeOptions: ComputeUnitOptions = {
    computeUnitLimit: 300_000, // Increase from default 200k
  };

  try {
    const result = await client.send(
      'DWXf4vYnBNRVoYdNMtZv1x6TdNHMfKH3vV5TYvGeEUEw',
      'Complex Message',
      'This message involves multiple instructions and needs more compute units',
      true, // revenue share (more complex)
      false,
      fixedComputeOptions
    );
    console.log(`   ✅ Sent! Signature: ${result.signature.slice(0, 20)}...`);
    console.log(`   ⚡ Compute units: ${result.computeUnitLimit}`);
    console.log(`   💰 No priority fee\n`);
  } catch (error) {
    console.log(`   ⚠️ Send failed: ${error}\n`);
  }

  // Example 3: Send with priority fee for faster inclusion
  console.log('3. Send with priority fee (faster inclusion):');
  const priorityOptions: ComputeUnitOptions = {
    computeUnitLimit: 250_000,
    computeUnitPrice: 1_000, // 1,000 micro-lamports per compute unit
  };

  try {
    const result = await client.send(
      'DWXf4vYnBNRVoYdNMtZv1x6TdNHMfKH3vV5TYvGeEUEw',
      'Urgent Message',
      'This message needs to be processed quickly',
      false,
      false,
      priorityOptions
    );
    console.log(`   ✅ Sent! Signature: ${result.signature.slice(0, 20)}...`);
    console.log(`   ⚡ Compute units: ${result.computeUnitLimit}`);
    console.log(`   💰 Priority fee: ${result.computeUnitPrice} micro-lamports/unit`);
    console.log(`   📈 Total priority cost: ${(250_000 * 1_000) / 1e9} SOL\n`);
  } catch (error) {
    console.log(`   ⚠️ Send failed: ${error}\n`);
  }

  // Example 4: Auto-optimize compute units (RECOMMENDED)
  console.log('4. Auto-optimize compute units (simulates first):');
  const autoOptimizeOptions: ComputeUnitOptions = {
    autoOptimize: true,
    computeUnitMultiplier: 1.3, // 30% buffer
    computeUnitPrice: 500, // Moderate priority
  };

  try {
    const result = await client.send(
      'DWXf4vYnBNRVoYdNMtZv1x6TdNHMfKH3vV5TYvGeEUEw',
      'Smart Message',
      'This transaction will be simulated first to determine optimal compute units',
      true,
      false,
      autoOptimizeOptions
    );
    console.log(`   ✅ Sent! Signature: ${result.signature.slice(0, 20)}...`);
    console.log(`   🔬 Simulated units: ${result.simulatedUnits}`);
    console.log(`   ⚡ Applied limit: ${result.computeUnitLimit} (with 30% buffer)`);
    console.log(`   💰 Priority fee: ${result.computeUnitPrice} micro-lamports/unit\n`);
  } catch (error) {
    console.log(`   ⚠️ Send failed: ${error}\n`);
  }

  // Example 5: High-priority transaction during congestion
  console.log('5. High-priority transaction (network congestion):');
  const highPriorityOptions: ComputeUnitOptions = {
    autoOptimize: true,
    computeUnitMultiplier: 1.5, // 50% buffer for safety
    computeUnitPrice: 10_000, // High priority for congestion
  };

  try {
    const result = await client.send(
      'DWXf4vYnBNRVoYdNMtZv1x6TdNHMfKH3vV5TYvGeEUEw',
      'Critical Message',
      'Must be processed even during high network congestion',
      false,
      false,
      highPriorityOptions
    );
    console.log(`   ✅ Sent! Signature: ${result.signature.slice(0, 20)}...`);
    console.log(`   🚨 High priority: ${result.computeUnitPrice} micro-lamports/unit`);
    console.log(`   💸 Estimated priority cost: ${((result.computeUnitLimit || 200_000) * 10_000) / 1e9} SOL\n`);
  } catch (error) {
    console.log(`   ⚠️ Send failed: ${error}\n`);
  }

  // Example 6: Skip compute units (use defaults)
  console.log('6. Skip compute unit settings:');
  const skipOptions: ComputeUnitOptions = {
    skipComputeUnits: true, // Don't add any compute budget instructions
  };

  try {
    const result = await client.send(
      'DWXf4vYnBNRVoYdNMtZv1x6TdNHMfKH3vV5TYvGeEUEw',
      'Simple Message',
      'Uses Solana defaults',
      false,
      false,
      skipOptions
    );
    console.log(`   ✅ Sent! Signature: ${result.signature.slice(0, 20)}...`);
    console.log(`   ⚡ Using Solana default compute units\n`);
  } catch (error) {
    console.log(`   ⚠️ Send failed: ${error}\n`);
  }

  console.log('📈 Compute Unit Optimization Summary:');
  console.log('   • Default: 200,000 compute units (may fail for complex transactions)');
  console.log('   • Fixed limit: Set specific limit when you know requirements');
  console.log('   • Priority fees: Pay more for faster inclusion (1-10,000 micro-lamports)');
  console.log('   • Auto-optimize: Simulate first, apply buffer (RECOMMENDED)');
  console.log('   • Max units: 1,400,000 (Solana limit)');
  console.log('\n💡 Best Practices:');
  console.log('   1. Use auto-optimize for production (prevents failures)');
  console.log('   2. Add priority fees during network congestion');
  console.log('   3. Monitor simulatedUnits to optimize costs');
  console.log('   4. Use 20-50% buffer for safety');
  console.log('\n✨ Compute unit optimization complete!');
}

// Helper to estimate costs
function estimatePriorityCost(computeUnits: number, microLamportsPerUnit: number): number {
  return (computeUnits * microLamportsPerUnit) / 1e9; // Convert to SOL
}

// Run the demo
main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
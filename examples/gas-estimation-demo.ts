/**
 * Gas Estimation Demo
 *
 * This example demonstrates how to use the enhanced gas estimation features
 * in the EVM Mailer client. All contract calls now support automatic gas
 * estimation with configurable options.
 */

import { createWalletClient, createPublicClient, http, parseUnits } from 'viem';
import { hardhat } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { MailerClient, type GasOptions } from '../src/evm/index.js';

async function main() {
  console.log('🚀 Gas Estimation Demo\n');

  // Setup clients (replace with your actual RPC and private key for production)
  const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http('http://localhost:8545')
  });

  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http('http://localhost:8545')
  });

  // Mock addresses for demo (replace with actual addresses)
  const usdcTokenAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const ownerAddress = account.address;
  const mailerAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

  // Initialize the client
  const mailerClient = new MailerClient(mailerAddress, publicClient);

  console.log('📊 Gas Estimation Examples:\n');

  // Example 1: Deploy with custom gas options
  console.log('1. Deploying contract with gas estimation:');
  const deployGasOptions: GasOptions = {
    gasMultiplier: 1.5,  // 50% buffer for deployment
    maxGasLimit: BigInt(5000000)  // Max 5M gas
  };

  try {
    const { client, result } = await MailerClient.deploy(
      walletClient,
      publicClient,
      account,
      usdcTokenAddress,
      ownerAddress,
      deployGasOptions
    );

    console.log(`   ✅ Deployed at: ${client.getAddress()}`);
    console.log(`   ⛽ Estimated Gas: ${result.estimatedGas}`);
    console.log(`   ⛽ Gas Used: ${result.gasLimit}`);
    console.log(`   📝 Tx Hash: ${result.hash}\n`);
  } catch (error) {
    console.log(`   ⚠️ Deployment skipped (may already exist): ${error}\n`);
  }

  // Example 2: Send message with automatic gas estimation
  console.log('2. Sending message with automatic gas estimation:');
  const sendGasOptions: GasOptions = {
    gasMultiplier: 1.2  // 20% buffer (default)
  };

  try {
    const sendResult = await mailerClient.send(
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906',  // recipient
      'Test Subject',
      'Test message body',
      account.address,  // payer
      false,  // revenueShareToReceiver
      false,  // resolveSenderToName
      walletClient,
      account,
      sendGasOptions
    );

    console.log(`   ✅ Message sent!`);
    console.log(`   ⛽ Estimated Gas: ${sendResult.estimatedGas}`);
    console.log(`   ⛽ Gas Limit Used: ${sendResult.gasLimit}`);
    console.log(`   📝 Tx Hash: ${sendResult.hash}\n`);
  } catch (error) {
    console.log(`   ⚠️ Send failed: ${error}\n`);
  }

  // Example 3: Using fixed gas limit (skip estimation)
  console.log('3. Using fixed gas limit (skip estimation):');
  const fixedGasOptions: GasOptions = {
    gasLimit: BigInt(300000)  // Fixed 300k gas
  };

  try {
    const claimResult = await mailerClient.claimRecipientShare(
      walletClient,
      account,
      fixedGasOptions
    );

    console.log(`   ✅ Claim executed with fixed gas!`);
    console.log(`   ⛽ Fixed Gas Limit: ${claimResult.gasLimit}`);
    console.log(`   📝 Tx Hash: ${claimResult.hash}\n`);
  } catch (error) {
    console.log(`   ⚠️ Claim failed: ${error}\n`);
  }

  // Example 4: Using EIP-1559 gas pricing
  console.log('4. Using EIP-1559 gas pricing:');
  const eip1559Options: GasOptions = {
    gasMultiplier: 1.3,
    maxFeePerGas: parseUnits('50', 9),  // 50 gwei
    maxPriorityFeePerGas: parseUnits('2', 9)  // 2 gwei tip
  };

  try {
    const delegateResult = await mailerClient.delegateTo(
      '0xdD2FD4581271e230360230F9337D5c0430Bf44C0',  // delegate address
      walletClient,
      account,
      eip1559Options
    );

    console.log(`   ✅ Delegation set with EIP-1559 pricing!`);
    console.log(`   ⛽ Estimated Gas: ${delegateResult.estimatedGas}`);
    console.log(`   ⛽ Gas Limit: ${delegateResult.gasLimit}`);
    console.log(`   📝 Tx Hash: ${delegateResult.hash}\n`);
  } catch (error) {
    console.log(`   ⚠️ Delegation failed: ${error}\n`);
  }

  // Example 5: Batch operations with gas estimation
  console.log('5. Batch operations with consistent gas options:');
  const batchGasOptions: GasOptions = {
    gasMultiplier: 1.25,
    maxGasLimit: BigInt(500000)
  };

  const operations = [
    { name: 'Set Fee', fn: () => mailerClient.setFee(parseUnits('1', 6), walletClient, account, batchGasOptions) },
    { name: 'Set Delegation Fee', fn: () => mailerClient.setDelegationFee(parseUnits('10', 6), walletClient, account, batchGasOptions) },
    { name: 'Set Custom Fee', fn: () => mailerClient.setCustomFeePercentage(account.address, 50, walletClient, account, batchGasOptions) }
  ];

  for (const op of operations) {
    try {
      const result = await op.fn();
      console.log(`   ✅ ${op.name}: Gas ${result.estimatedGas} → ${result.gasLimit}`);
    } catch (error) {
      console.log(`   ⚠️ ${op.name} failed: ${error}`);
    }
  }

  console.log('\n📈 Gas Estimation Summary:');
  console.log('   • All write operations now estimate gas automatically');
  console.log('   • Default 20% buffer applied (customizable via gasMultiplier)');
  console.log('   • Support for fixed gas limits when needed');
  console.log('   • EIP-1559 transaction pricing support');
  console.log('   • Max gas limits to prevent excessive usage');
  console.log('\n✨ Gas estimation complete!');
}

// Run the demo
main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
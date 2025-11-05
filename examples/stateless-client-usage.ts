/**
 * Example: Using the stateless OnchainMailerClient
 *
 * This example shows how to use the improved OnchainMailerClient
 * where wallets are passed as function parameters instead of
 * being stored in the constructor.
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Connection, PublicKey } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
// Import the new client (would be from package in real usage)
import { OnchainMailerClient } from '../src/unified/onchain-mailer-client-v3';

async function evmExample() {
  console.log('\n=== EVM Example with Stateless Client ===\n');

  // ===== 1. Create the client with just configuration =====
  const client = new OnchainMailerClient({
    evm: {
      mailerAddress: '0xYourMailerContractAddress',
      usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    }
  });

  console.log('✅ Client created with EVM configuration');

  // ===== 2. Create wallets (can have multiple) =====
  const account1 = privateKeyToAccount('0x...privateKey1');
  const account2 = privateKeyToAccount('0x...privateKey2');

  const walletClient1 = createWalletClient({
    account: account1,
    chain: sepolia,
    transport: http('https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY')
  });

  const walletClient2 = createWalletClient({
    account: account2,
    chain: sepolia,
    transport: http('https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY')
  });

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http('https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY')
  });

  // ===== 3. Use the same client with different wallets =====

  // Send from wallet 1
  console.log('\n📨 Sending message from wallet 1...');
  const result1 = await client.sendMessage(
    'Hello from Wallet 1',
    'This is a test message',
    { walletClient: walletClient1, publicClient },
    { priority: true }
  );
  console.log('✅ Sent from wallet 1:', result1.transactionHash);

  // Send from wallet 2 using the same client
  console.log('\n📨 Sending message from wallet 2...');
  const result2 = await client.sendMessage(
    'Hello from Wallet 2',
    'Another test message',
    { walletClient: walletClient2, publicClient },
    { priority: false }
  );
  console.log('✅ Sent from wallet 2:', result2.transactionHash);

  // ===== 4. Delegate from wallet 1 =====
  console.log('\n🤝 Setting delegation from wallet 1...');
  const delegationResult = await client.delegateTo(
    '0xDelegateAddress',
    { walletClient: walletClient1, publicClient }
  );
  console.log('✅ Delegation set:', delegationResult.transactionHash);

  // ===== 5. Read operations (no wallet needed) =====
  console.log('\n💰 Getting send fee...');
  const fee = await client.getSendFee(publicClient);
  console.log('   Send fee:', fee.toString(), 'USDC (micro-units)');
}

async function solanaExample() {
  console.log('\n=== Solana Example with Stateless Client ===\n');

  // ===== 1. Create the client with just configuration =====
  const client = new OnchainMailerClient({
    solana: {
      programId: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF',
      usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    }
  });

  console.log('✅ Client created with Solana configuration');

  // ===== 2. Create connection and wallets =====
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  const wallet1 = new PhantomWalletAdapter();
  await wallet1.connect();

  // You could have multiple wallets
  // const wallet2 = new SolflareWalletAdapter();
  // await wallet2.connect();

  // ===== 3. Use the client with different wallets =====

  console.log('\n📨 Sending message from Solana wallet...');
  const result = await client.sendMessage(
    'Hello from Solana',
    'Cross-chain message',
    { wallet: wallet1, connection },
    { priority: true }
  );
  console.log('✅ Message sent:', result.transactionHash);

  // ===== 4. Delegate to another address =====
  console.log('\n🤝 Setting delegation...');
  const delegationResult = await client.delegateTo(
    'DelegatePublicKeyBase58',
    { wallet: wallet1, connection }
  );
  console.log('✅ Delegation set:', delegationResult.transactionHash);

  // ===== 5. Claim revenue =====
  console.log('\n💸 Claiming revenue share...');
  const claimResult = await client.claimRevenue({ wallet: wallet1, connection });
  console.log('✅ Revenue claimed:', claimResult.hash);

  // ===== 6. Read operations =====
  console.log('\n💰 Getting send fee...');
  const fee = await client.getSendFee(connection);
  console.log('   Send fee:', fee.toString(), 'USDC (micro-units)');

  await wallet1.disconnect();
}

async function multiChainExample() {
  console.log('\n=== Multi-Chain Example with Single Client ===\n');

  // ===== Create a single client that supports both chains =====
  const client = new OnchainMailerClient({
    evm: {
      mailerAddress: '0xYourMailerContractAddress',
      usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    },
    solana: {
      programId: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF',
      usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    }
  });

  console.log('✅ Multi-chain client created');

  // ===== EVM wallet =====
  const evmAccount = privateKeyToAccount('0x...');
  const evmWalletClient = createWalletClient({
    account: evmAccount,
    chain: sepolia,
    transport: http()
  });
  const evmPublicClient = createPublicClient({
    chain: sepolia,
    transport: http()
  });

  // ===== Solana wallet =====
  const solanaConnection = new Connection('https://api.devnet.solana.com');
  const solanaWallet = new PhantomWalletAdapter();
  await solanaWallet.connect();

  // ===== Use the same client for both chains =====

  console.log('\n📨 Sending on EVM...');
  const evmResult = await client.sendMessage(
    'Cross-chain message',
    'Sent from EVM',
    { walletClient: evmWalletClient, publicClient: evmPublicClient },
    { priority: true }
  );
  console.log('✅ EVM transaction:', evmResult.transactionHash);

  console.log('\n📨 Sending on Solana...');
  const solanaResult = await client.sendMessage(
    'Cross-chain message',
    'Sent from Solana',
    { wallet: solanaWallet, connection: solanaConnection },
    { priority: true }
  );
  console.log('✅ Solana transaction:', solanaResult.transactionHash);

  await solanaWallet.disconnect();
}

// React example showing the benefits
export function ReactComponent() {
  // Create a single client instance that can be reused
  const client = new OnchainMailerClient({
    evm: {
      mailerAddress: process.env.NEXT_PUBLIC_MAILER_ADDRESS!,
      usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS
    },
    solana: {
      programId: process.env.NEXT_PUBLIC_MAILER_PROGRAM!,
      usdcMint: process.env.NEXT_PUBLIC_USDC_MINT!
    }
  });

  // Different users can use the same client
  const sendMessageForUser = async (userWallet: any) => {
    // The client doesn't care which wallet is used
    const result = await client.sendMessage(
      'Subject',
      'Body',
      userWallet,
      { priority: true }
    );
    return result;
  };

  return (
    <div>
      <h2>Multi-Wallet Support</h2>
      <p>The same client instance can be used with any wallet!</p>
    </div>
  );
}

// Main function
async function main() {
  console.log('🚀 Stateless OnchainMailerClient Examples\n');
  console.log('This demonstrates the improved API where wallets are');
  console.log('passed as function parameters instead of constructor params.\n');

  try {
    await evmExample();
  } catch (error) {
    console.error('EVM example error:', error);
  }

  try {
    await solanaExample();
  } catch (error) {
    console.error('Solana example error:', error);
  }

  try {
    await multiChainExample();
  } catch (error) {
    console.error('Multi-chain example error:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { evmExample, solanaExample, multiChainExample };
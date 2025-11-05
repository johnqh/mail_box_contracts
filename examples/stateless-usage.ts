/**
 * Example: Using the stateless OnchainMailerClient
 *
 * This example shows how to use the completely stateless OnchainMailerClient
 * where wallet and ChainInfo are passed to each method call.
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { sepolia, mainnet, polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Connection, PublicKey } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { RpcHelpers, ChainInfo } from '@sudobility/configs';
import { Chain } from '@sudobility/types';

// Import the stateless client
import { OnchainMailerClient, EVMWallet, SolanaWallet } from '../src/unified/onchain-mailer-client';

async function evmExample() {
  console.log('\n=== EVM Example with Stateless Client ===\n');

  // 1. Create the stateless client (no configuration needed)
  const client = new OnchainMailerClient();
  console.log('✅ Stateless client created');

  // 2. Get chain information from @sudobility/configs
  const sepoliaInfo = RpcHelpers.getChainInfo(Chain.ETH_SEPOLIA);
  const mainnetInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);
  const polygonInfo = RpcHelpers.getChainInfo(Chain.POLYGON_MAINNET);

  // 3. Create wallets (can have multiple for different accounts)
  const account1 = privateKeyToAccount('0x...privateKey1');
  const account2 = privateKeyToAccount('0x...privateKey2');

  // 4. Create wallet clients for different chains
  const sepoliaWalletClient = createWalletClient({
    account: account1,
    chain: sepolia,
    transport: http(sepoliaInfo.alchemyNetwork ?
      `https://${sepoliaInfo.alchemyNetwork}.g.alchemy.com/v2/YOUR-KEY` :
      undefined)
  });

  const mainnetWalletClient = createWalletClient({
    account: account2,
    chain: mainnet,
    transport: http(mainnetInfo.alchemyNetwork ?
      `https://${mainnetInfo.alchemyNetwork}.g.alchemy.com/v2/YOUR-KEY` :
      undefined)
  });

  // 5. Create public clients (optional - will be created from ChainInfo if not provided)
  const sepoliaPublicClient = createPublicClient({
    chain: sepolia,
    transport: http(sepoliaInfo.alchemyNetwork ?
      `https://${sepoliaInfo.alchemyNetwork}.g.alchemy.com/v2/YOUR-KEY` :
      undefined)
  });

  // 6. Use the same client with different wallets and chains

  // Send on Sepolia with account1
  console.log('\n📨 Sending message on Sepolia...');
  const sepoliaWallet: EVMWallet = {
    walletClient: sepoliaWalletClient,
    publicClient: sepoliaPublicClient // Optional
  };

  const result1 = await client.sendMessage(
    'Hello from Sepolia',
    'This is a test message',
    sepoliaWallet,
    sepoliaInfo,
    {
      priority: true,
      to: '0xRecipientAddress' // Optional, defaults to sender
    }
  );
  console.log('✅ Sent on Sepolia:', result1.transactionHash);

  // Send on Mainnet with account2 (will auto-switch chain)
  console.log('\n📨 Sending message on Mainnet...');
  const mainnetWallet: EVMWallet = {
    walletClient: mainnetWalletClient
    // No publicClient - will be created from ChainInfo
  };

  const result2 = await client.sendMessage(
    'Hello from Mainnet',
    'Another test message',
    mainnetWallet,
    mainnetInfo,
    { priority: false }
  );
  console.log('✅ Sent on Mainnet:', result2.transactionHash);

  // 7. Delegate on Polygon
  console.log('\n🤝 Setting delegation on Polygon...');
  const polygonWalletClient = createWalletClient({
    account: account1,
    chain: polygon,
    transport: http()
  });

  const polygonWallet: EVMWallet = { walletClient: polygonWalletClient };

  const delegationResult = await client.delegateTo(
    '0xDelegateAddress',
    polygonWallet,
    polygonInfo
  );
  console.log('✅ Delegation set on Polygon:', delegationResult.transactionHash);

  // 8. Read operations (no wallet needed, just ChainInfo)
  console.log('\n💰 Getting send fee on Sepolia...');
  const fee = await client.getSendFee(sepoliaInfo);
  console.log('   Send fee:', fee.toString(), 'USDC (micro-units)');

  // Check delegation
  console.log('\n🔍 Checking delegation on Polygon...');
  const delegation = await client.getDelegation(
    account1.address,
    polygonInfo
  );
  console.log('   Delegation:', delegation || 'None');
}

async function solanaExample() {
  console.log('\n=== Solana Example with Stateless Client ===\n');

  // 1. Create the stateless client
  const client = new OnchainMailerClient();
  console.log('✅ Stateless client created');

  // 2. Get chain information
  const solanaMainnet = RpcHelpers.getChainInfo(Chain.SOLANA_MAINNET);
  const solanaDevnet = RpcHelpers.getChainInfo(Chain.SOLANA_DEVNET);

  // 3. Create wallets
  const wallet1 = new PhantomWalletAdapter();
  await wallet1.connect();

  // 4. Create connections (optional - will be created from ChainInfo if not provided)
  const mainnetConnection = new Connection(
    solanaMainnet.alchemyNetwork ?
      `https://${solanaMainnet.alchemyNetwork}.g.alchemy.com/v2/YOUR-KEY` :
      'https://api.mainnet-beta.solana.com',
    'confirmed'
  );

  // 5. Send message on mainnet
  console.log('\n📨 Sending message on Solana mainnet...');
  const mainnetWallet: SolanaWallet = {
    wallet: wallet1,
    connection: mainnetConnection // Optional
  };

  const result = await client.sendMessage(
    'Hello from Solana',
    'Cross-chain message',
    mainnetWallet,
    solanaMainnet,
    { priority: true }
  );
  console.log('✅ Message sent:', result.transactionHash);

  // 6. Send on devnet (no connection provided - will use ChainInfo)
  console.log('\n📨 Sending message on Solana devnet...');
  const devnetWallet: SolanaWallet = {
    wallet: wallet1
    // No connection - will be created from ChainInfo
  };

  const devnetResult = await client.sendMessage(
    'Hello from Devnet',
    'Test message',
    devnetWallet,
    solanaDevnet,
    { priority: false }
  );
  console.log('✅ Message sent on devnet:', devnetResult.transactionHash);

  // 7. Delegate to another address
  console.log('\n🤝 Setting delegation...');
  const delegationResult = await client.delegateTo(
    'DelegatePublicKeyBase58',
    mainnetWallet,
    solanaMainnet
  );
  console.log('✅ Delegation set:', delegationResult.transactionHash);

  // 8. Claim revenue
  console.log('\n💸 Claiming revenue share...');
  const claimResult = await client.claimRevenue(mainnetWallet, solanaMainnet);
  console.log('✅ Revenue claimed:', claimResult.hash);

  // 9. Read operations
  console.log('\n💰 Getting send fee...');
  const fee = await client.getSendFee(solanaMainnet);
  console.log('   Send fee:', fee.toString(), 'USDC (micro-units)');

  await wallet1.disconnect();
}

async function multiChainExample() {
  console.log('\n=== Multi-Chain Example with Single Stateless Client ===\n');

  // 1. Create a single stateless client
  const client = new OnchainMailerClient();
  console.log('✅ Single stateless client created for all chains');

  // 2. Get chain information for multiple chains
  const chains = {
    ethereum: RpcHelpers.getChainInfo(Chain.ETH_MAINNET),
    polygon: RpcHelpers.getChainInfo(Chain.POLYGON_MAINNET),
    arbitrum: RpcHelpers.getChainInfo(Chain.ARBITRUM_MAINNET),
    optimism: RpcHelpers.getChainInfo(Chain.OPTIMISM_MAINNET),
    solana: RpcHelpers.getChainInfo(Chain.SOLANA_MAINNET)
  };

  console.log('📋 Available chains:');
  Object.entries(chains).forEach(([name, info]) => {
    console.log(`   - ${name}: ${info.name} (Chain ID: ${info.chainId})`);
  });

  // 3. Create EVM wallet
  const evmAccount = privateKeyToAccount('0x...');
  const evmWalletClient = createWalletClient({
    account: evmAccount,
    chain: mainnet,
    transport: http()
  });

  // 4. Create Solana wallet
  const solanaWallet = new PhantomWalletAdapter();
  await solanaWallet.connect();
  const solanaConnection = new Connection('https://api.mainnet-beta.solana.com');

  // 5. Send messages on different chains with the same client

  // Ethereum
  console.log('\n📨 Sending on Ethereum...');
  const ethResult = await client.sendMessage(
    'Multi-chain message',
    'Sent from Ethereum',
    { walletClient: evmWalletClient },
    chains.ethereum,
    { priority: true }
  );
  console.log('✅ Ethereum tx:', ethResult.transactionHash);

  // Polygon (will auto-switch chain)
  console.log('\n📨 Sending on Polygon...');
  const polygonResult = await client.sendMessage(
    'Multi-chain message',
    'Sent from Polygon',
    { walletClient: evmWalletClient },
    chains.polygon,
    { priority: false }
  );
  console.log('✅ Polygon tx:', polygonResult.transactionHash);

  // Solana
  console.log('\n📨 Sending on Solana...');
  const solanaResult = await client.sendMessage(
    'Multi-chain message',
    'Sent from Solana',
    { wallet: solanaWallet, connection: solanaConnection },
    chains.solana,
    { priority: true }
  );
  console.log('✅ Solana tx:', solanaResult.transactionHash);

  // 6. Read fees from multiple chains
  console.log('\n💰 Comparing fees across chains:');
  for (const [name, chainInfo] of Object.entries(chains)) {
    try {
      const fee = await client.getSendFee(chainInfo);
      console.log(`   ${name}: ${fee.toString()} USDC (micro-units)`);
    } catch (error) {
      console.log(`   ${name}: No mailer deployed`);
    }
  }

  await solanaWallet.disconnect();
}

// React component example
export function ReactComponent() {
  // Create a single stateless client instance (can be global)
  const client = new OnchainMailerClient();

  // Get chain info from configs
  const chainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);

  const sendMessage = async (walletClient: any, publicClient: any) => {
    // Pass wallet and chain info to each call
    const wallet: EVMWallet = { walletClient, publicClient };

    const result = await client.sendMessage(
      'Subject',
      'Body',
      wallet,
      chainInfo,
      { priority: true }
    );

    console.log('Sent:', result.transactionHash);
  };

  return (
    <div>
      <h2>Stateless Multi-Chain Client</h2>
      <p>Pass wallet and chain info to each method call!</p>
    </div>
  );
}

// Main function
async function main() {
  console.log('🚀 Stateless OnchainMailerClient Examples\n');
  console.log('This demonstrates the fully stateless API where wallets and');
  console.log('chain info are passed as parameters to each method.\n');

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
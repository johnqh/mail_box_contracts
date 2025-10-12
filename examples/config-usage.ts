/**
 * Example: Using ChainConfig from @sudobility/types for client initialization
 *
 * This example demonstrates the simplified way to initialize mailer clients
 * using ChainConfig and RpcHelpers, which automatically derives all chain
 * information (RPC URLs, chain IDs, USDC addresses) from API keys.
 */

import { Chain, ChainConfig, RpcHelpers } from '@sudobility/types';
import { buildChainConfig } from '../src/utils/index.js';
import { MailerClient as EVMMailerClient } from '../src/evm/index.js';
import { MailerClient as SolanaMailerClient } from '../src/solana/index.js';
import { createPublicClient, http } from 'viem';
import type { PublicClient } from 'viem';
import { Connection } from '@solana/web3.js';

// ============================================================================
// EXAMPLE 1: Initialize EVM Client with ChainConfig
// ============================================================================

async function initializeEVMClient() {
  // Step 1: Create ChainConfig with just chain enum and API keys
  const chainConfig: ChainConfig = {
    chain: Chain.ETH_MAINNET,
    alchemyApiKey: process.env.ALCHEMY_API_KEY || '',
    etherscanApiKey: process.env.ETHERSCAN_MULTICHAIN_API_KEY || '',
  };

  // Step 2: Get all derived chain information
  const chainInfo = RpcHelpers.getChainInfo(chainConfig);
  console.log('Chain Info:', {
    name: chainInfo.name,
    chainId: chainInfo.chainId,
    rpcUrl: chainInfo.rpcUrl,
    usdcAddress: chainInfo.usdcAddress,
    explorerUrl: chainInfo.explorerUrl,
  });

  // Step 3: Build unified config for mailer client
  const mailerAddress = '0x...'; // Your deployed mailer contract
  const config = buildChainConfig(chainConfig, mailerAddress);

  // Step 4: Create viem public client
  const publicClient = createPublicClient({
    transport: http(config.evm!.rpc),
    chain: {
      id: config.evm!.chainId,
      name: chainInfo.name,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [config.evm!.rpc] },
      },
    },
  });

  // Step 5: Initialize mailer client
  const mailerClient = new EVMMailerClient(
    config.evm!.contracts.mailer,
    publicClient as PublicClient
  );

  // Note: To send transactions, you'll also need a wallet client:
  // const walletClient = createWalletClient({
  //   transport: http(config.evm!.rpc),
  //   chain: { ... }
  // });

  return { mailerClient, publicClient, config };
}

// ============================================================================
// EXAMPLE 2: Initialize Solana Client with ChainConfig
// ============================================================================

async function initializeSolanaClient() {
  // Step 1: Create ChainConfig for Solana
  const chainConfig: ChainConfig = {
    chain: Chain.SOLANA_MAINNET,
    alchemyApiKey: process.env.ALCHEMY_API_KEY || '',
    etherscanApiKey: '', // Not used for Solana
  };

  // Step 2: Get derived chain information
  const chainInfo = RpcHelpers.getChainInfo(chainConfig);
  console.log('Solana Chain Info:', {
    name: chainInfo.name,
    rpcUrl: chainInfo.rpcUrl,
    usdcMint: chainInfo.usdcAddress,
  });

  // Step 3: Build unified config
  const mailerProgramId = '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF';
  const config = buildChainConfig(chainConfig, mailerProgramId);

  // Step 4: Create Solana connection
  const connection = new Connection(config.solana!.rpc, 'confirmed');

  // Step 5: Initialize mailer client (requires wallet)
  // const wallet = SolanaMailerClient.createWallet(keypair);
  // const mailerClient = new SolanaMailerClient(
  //   connection,
  //   wallet,
  //   new PublicKey(config.solana!.programs.mailer),
  //   new PublicKey(config.solana!.usdcMint)
  // );

  return { connection, config };
}

// ============================================================================
// EXAMPLE 3: Multi-chain support
// ============================================================================

async function initializeMultiChain() {
  const alchemyApiKey = process.env.ALCHEMY_API_KEY || '';
  const etherscanApiKey = process.env.ETHERSCAN_MULTICHAIN_API_KEY || '';

  // Initialize clients for multiple chains
  const chains = [
    Chain.ETH_MAINNET,
    Chain.BASE_MAINNET,
    Chain.POLYGON_MAINNET,
    Chain.OPTIMISM_MAINNET,
  ];

  const clients = [];

  for (const chain of chains) {
    const chainConfig: ChainConfig = {
      chain,
      alchemyApiKey,
      etherscanApiKey,
    };

    const chainInfo = RpcHelpers.getChainInfo(chainConfig);
    console.log(`Initializing ${chainInfo.name}...`);

    // Build config and create client
    const config = buildChainConfig(chainConfig, '0x...'); // Your mailer address

    if (config.evm) {
      const publicClient = createPublicClient({
        transport: http(config.evm.rpc),
        chain: {
          id: config.evm.chainId,
          name: chainInfo.name,
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [config.evm.rpc] },
          },
        },
      });

      const mailerClient = new EVMMailerClient(
        config.evm.contracts.mailer,
        publicClient as PublicClient
      );
      clients.push({ chain: chainInfo.name, mailerClient, publicClient });
    }
  }

  return clients;
}

// ============================================================================
// EXAMPLE 4: Using USDC addresses
// ============================================================================

function getUSDCAddresses() {
  const alchemyApiKey = process.env.ALCHEMY_API_KEY || '';

  // Get USDC addresses for different chains without creating full clients
  const chains = [
    Chain.ETH_MAINNET,
    Chain.POLYGON_MAINNET,
    Chain.SOLANA_MAINNET,
  ];

  for (const chain of chains) {
    const usdcAddress = RpcHelpers.getUSDCAddress(chain);
    const chainName = RpcHelpers.getUserFriendlyName(chain);
    console.log(`${chainName} USDC:`, usdcAddress);
  }
}

// ============================================================================
// BENEFITS OF THIS APPROACH
// ============================================================================

/*
 * 1. Single source of truth: Chain enum + API keys
 * 2. No hardcoded RPC URLs or addresses in code
 * 3. Easy to switch between networks (mainnet/testnet)
 * 4. Type-safe with TypeScript
 * 5. Automatic chain information derivation
 * 6. Consistent configuration across EVM and Solana
 * 7. Environment-agnostic - API keys stored in env vars
 */

// Export examples
export {
  initializeEVMClient,
  initializeSolanaClient,
  initializeMultiChain,
  getUSDCAddresses,
};

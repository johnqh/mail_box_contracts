import { Optional } from '@johnqh/types';
import { ChainConfig } from '../unified/types.js';

export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
  evm: {
    rpc: 'http://127.0.0.1:8545', // Local Hardhat network
    chainId: 31337,
    contracts: {
      mailer: '', // Will be filled after deployment
      usdc: '', // Local MockUSDC
    },
  },
  solana: {
    rpc: 'http://127.0.0.1:8899', // Local Solana validator
    programs: {
      mailer: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF', // Mailer program (includes delegation)
    },
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Test USDC mint
  },
};

export const MAINNET_CHAIN_CONFIG: ChainConfig = {
  evm: {
    rpc: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
    chainId: 1,
    contracts: {
      mailer: '',
      usdc: '0xA0b86a33E6441146a8A8e27c01f0D9B1F5E42E92', // Real USDC on mainnet
    },
  },
  solana: {
    rpc: 'https://api.mainnet-beta.solana.com',
    programs: {
      mailer: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF', // Mailer program (includes delegation)
    },
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Real USDC on Solana mainnet
  },
};

export const TESTNET_CHAIN_CONFIG: ChainConfig = {
  evm: {
    rpc: 'https://eth-sepolia.g.alchemy.com/v2/your-api-key',
    chainId: 11155111,
    contracts: {
      mailer: '',
      usdc: '0x6f14C02fC1F78322cFd7d707aB90f18baD3B54f5', // Sepolia USDC
    },
  },
  solana: {
    rpc: 'https://api.devnet.solana.com',
    programs: {
      mailer: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF', // Mailer program (includes delegation)
    },
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC
  },
};

// Multi-chain network configurations
export const NETWORK_CONFIGS = {
  // Ethereum networks
  ethereum: {
    rpc: 'https://eth-mainnet.g.alchemy.com/v2/your-api-key',
    chainId: 1,
    usdc: '0xA0b86a33E6441146a8A8e27c01f0D9B1F5E42E92',
  },
  sepolia: {
    rpc: 'https://eth-sepolia.g.alchemy.com/v2/your-api-key',
    chainId: 11155111,
    usdc: '0x6f14C02fC1F78322cFd7d707aB90f18baD3B54f5',
  },
  polygon: {
    rpc: 'https://polygon-mainnet.g.alchemy.com/v2/your-api-key',
    chainId: 137,
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  },
  arbitrum: {
    rpc: 'https://arb-mainnet.g.alchemy.com/v2/your-api-key',
    chainId: 42161,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  optimism: {
    rpc: 'https://opt-mainnet.g.alchemy.com/v2/your-api-key',
    chainId: 10,
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  base: {
    rpc: 'https://base-mainnet.g.alchemy.com/v2/your-api-key',
    chainId: 8453,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  // Solana networks
  'mainnet-beta': {
    rpc: 'https://api.mainnet-beta.solana.com',
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  devnet: {
    rpc: 'https://api.devnet.solana.com',
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  },
  testnet: {
    rpc: 'https://api.testnet.solana.com',
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  },
};

// Helper function to create chain config for specific networks
export function createChainConfig(
  evmNetwork?: Optional<string>,
  solanaNetwork?: Optional<string>
): ChainConfig {
  const config: ChainConfig = {
    evm: undefined,
    solana: undefined,
  };

  if (evmNetwork && (NETWORK_CONFIGS as Record<string, unknown>)[evmNetwork]) {
    const evmConfig = (
      NETWORK_CONFIGS as Record<string, Record<string, unknown>>
    )[evmNetwork];
    config.evm = {
      rpc: evmConfig.rpc as string,
      chainId: evmConfig.chainId as number,
      contracts: {
        mailer: '', // To be filled by deployment
        usdc: evmConfig.usdc as string,
      },
    };
  }

  if (
    solanaNetwork &&
    (NETWORK_CONFIGS as Record<string, unknown>)[solanaNetwork]
  ) {
    const solanaConfig = (
      NETWORK_CONFIGS as Record<string, Record<string, unknown>>
    )[solanaNetwork];
    config.solana = {
      rpc: solanaConfig.rpc as string,
      programs: {
        mailer: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF', // Mailer program (includes delegation)
      },
      usdcMint: solanaConfig.usdcMint as string,
    };
  }

  return config;
}

// Main export file for unified multi-chain Mailer client

// Export unified client and utilities
export * from './unified/index.js';

// Export specific stateless clients with explicit names to avoid conflicts
export {
  EVMMailerClient,
  type EVMWallet,
  type GasOptions
} from './evm/evm-mailer-client.js';

export {
  SolanaMailerClient,
  type SolanaWallet,
  type ComputeUnitOptions
} from './solana/solana-mailer-client.js';

// Export utilities with explicit names
export {
  NETWORK_CONFIGS,
  validateAddress,
  validateMessage,
  validateDomain,
  validateAmount
} from './utils/index.js';
// Main export file for unified multi-chain Mailer client

// Export unified client and utilities
export * from './unified/index';

// Export specific stateless clients with explicit names to avoid conflicts
export {
  EVMMailerClient,
  type EVMWallet,
  type GasOptions
} from './evm/evm-mailer-client';

export {
  SolanaMailerClient,
  type SolanaWallet,
  type ComputeUnitOptions
} from './solana/solana-mailer-client';

// Export utilities with explicit names
export {
  NETWORK_CONFIGS,
  validateAddress,
  validateMessage,
  validateDomain,
  validateAmount
} from './utils/index';
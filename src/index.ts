// Main export file for unified multi-chain Mailer client

// Export unified client and utilities
export * from './unified/index.js';

// Export specific clients with explicit names to avoid conflicts
export {
  MailerClient as EVMMailerClient
} from './evm/mailer-client.js';

export {
  MailerClient as SolanaMailerClient
} from './solana/mailer-client.js';

// Export utilities with explicit names
export {
  NETWORK_CONFIGS,
  validateAddress,
  validateMessage,
  validateDomain,
  validateAmount
} from './utils/index.js';
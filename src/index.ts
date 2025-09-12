// Main export file for unified multi-chain MailBox client

// Export unified client and utilities
export * from './unified';

// Export specific clients with explicit names to avoid conflicts
export { 
  MailerClient as EVMMailerClient
} from './evm/mailer-client';

export { 
  MailerClient as SolanaMailerClient
} from './solana/mailer-client';

// Export utilities with explicit names
export { 
  NETWORK_CONFIGS, 
  validateAddress, 
  validateMessage, 
  validateDomain, 
  validateAmount 
} from './utils';
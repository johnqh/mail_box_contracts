// Main export file for unified multi-chain MailBox client

// Export unified client and utilities (Phase 3)
export * from './unified';
export * from './utils';

// Export EVM-specific clients
export * from './evm';

// Export Solana-specific clients (placeholder for Phase 2)
export * from './solana';

// Re-export for backward compatibility
export { MailerClient as EVMMailerClient, MailServiceClient as EVMMailServiceClient, MailBoxClient as EVMMailBoxClient } from './evm/mailer-client';
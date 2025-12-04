/**
 * React Native compatible exports for @sudobility/contracts
 *
 * Usage:
 * ```typescript
 * // First, import polyfills (must be before any other imports in your app entry)
 * import '@sudobility/contracts/react-native/polyfills';
 *
 * // Then import the client
 * import { OnchainMailerClient } from '@sudobility/contracts/react-native';
 * ```
 */

// Re-export unified client (main entry point)
export {
  OnchainMailerClient,
  WalletDetector,
} from '../unified/index.js';

// Re-export unified types
export type {
  UnifiedTransaction,
  EVMWalletClient,
  EVMPublicClient,
  SolanaWalletAdapter,
  ChainConfig,
  EVMConfig,
  SolanaConfig,
  MessageResult,
  DomainResult,
  DelegationResult,
  Wallet,
  EVMWallet,
  SolanaWallet,
} from '../unified/types.js';

// Re-export EVM client
export { EVMMailerClient, Mailer__factory } from '../evm/index.js';
export type { Mailer } from '../evm/index.js';
export type {
  GasOptions,
  TransactionResult as EVMTransactionResult,
} from '../evm/evm-mailer-client.js';

// Re-export Solana client
export { SolanaMailerClient } from '../solana/index.js';
export type {
  ComputeUnitOptions,
  TransactionResult as SolanaTransactionResult,
} from '../solana/solana-mailer-client.js';
export type {
  ClaimableInfo,
  MailerFees,
} from '../solana/types.js';

// Re-export utilities
export * from '../utils/index.js';

// Re-export polyfill utilities
export { POLYFILLS_LOADED, verifyPolyfills } from './polyfills.js';

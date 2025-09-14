/**
 * @fileoverview Common type definitions for multi-chain MailBox system
 * @description Shared types and interfaces for EVM and Solana implementations
 * @author MailBox Team
 * @version 1.4.2
 */

import { PublicKey } from '@solana/web3.js';
import { USDC_DECIMALS, CLAIM_PERIOD_DAYS } from '@johnqh/types';

// ============================================================================
// CORE MESSAGING TYPES
// ============================================================================

/**
 * Represents a message recipient - can be EVM address or Solana PublicKey
 * @example
 * // EVM
 * const evmRecipient: MessageRecipient = "0x742d35Cc6634C0532925a3b8D2C36B7f1234567";
 * 
 * // Solana  
 * const solanaRecipient: MessageRecipient = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
 */
export type MessageRecipient = string | PublicKey;

/**
 * Core message structure used across all chains
 * @interface Message
 */
export interface Message {
  /** Message sender address/pubkey */
  from: MessageRecipient;
  /** Message recipient address/pubkey */
  to: MessageRecipient;
  /** Message subject line */
  subject: string;
  /** Message body content */
  body: string;
  /** Block timestamp when sent */
  timestamp: number;
  /** Transaction hash/signature */
  txHash: string;
  /** Message type classification */
  messageType: MessageType;
}

/**
 * Pre-prepared message using external storage
 * @interface PreparedMessage
 */
export interface PreparedMessage {
  /** Message sender address/pubkey */
  from: MessageRecipient;
  /** Message recipient address/pubkey */
  to: MessageRecipient;
  /** External message identifier (IPFS hash, UUID, etc.) */
  mailId: string;
  /** Block timestamp when sent */
  timestamp: number;
  /** Transaction hash/signature */
  txHash: string;
  /** Message type classification */
  messageType: MessageType;
}

/**
 * Message type enumeration
 * @enum MessageType
 */
export enum MessageType {
  /** Standard message with 10% fee */
  STANDARD = 'standard',
  /** Priority message with full fee and 90% revenue share */
  PRIORITY = 'priority',
  /** Pre-prepared standard message */
  PREPARED_STANDARD = 'prepared_standard',
  /** Pre-prepared priority message */
  PREPARED_PRIORITY = 'prepared_priority'
}

// ============================================================================
// FEE AND REVENUE TYPES
// ============================================================================

/**
 * Fee structure for messages
 * @interface FeeStructure
 */
export interface FeeStructure {
  /** Base send fee (0.1 USDC with 6 decimals) */
  sendFee: bigint;
  /** Fee for standard messages (10% of sendFee) */
  standardFee: bigint;
  /** Fee for priority messages (100% of sendFee) */
  priorityFee: bigint;
  /** Owner share percentage (10%) */
  ownerShare: number;
  /** Sender revenue share percentage (90%) */
  senderShare: number;
}

/**
 * Claimable revenue information
 * @interface ClaimableRevenue
 */
export interface ClaimableRevenue {
  /** Amount claimable in USDC */
  amount: bigint;
  /** Timestamp when claim was created */
  timestamp: number;
  /** Expiration timestamp (60 days from creation) */
  expiresAt: number;
  /** Whether the claim has expired */
  isExpired: boolean;
}

// ============================================================================
// CHAIN-SPECIFIC TYPES
// ============================================================================

/**
 * Supported blockchain networks
 * @enum ChainType
 */
export enum ChainType {
  /** Ethereum and EVM-compatible chains */
  EVM = 'evm',
  /** Solana blockchain */
  SOLANA = 'solana'
}

/**
 * Network configuration for different chains
 * @interface NetworkConfig
 */
export interface NetworkConfig {
  /** Chain type */
  chainType: ChainType;
  /** Network name (mainnet, testnet, devnet, etc.) */
  network: string;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Chain ID (for EVM) or Cluster (for Solana) */
  chainId?: number | string;
}

/**
 * Contract/Program addresses for deployment
 * @interface DeploymentAddresses
 */
export interface DeploymentAddresses {
  /** Mailer contract/program address */
  mailer: string;
  /** MailService contract/program address (if applicable) */
  mailService?: string;
  /** USDC token mint/contract address */
  usdcToken: string;
}

// ============================================================================
// CLIENT CONFIGURATION TYPES
// ============================================================================

/**
 * Configuration for unified client
 * @interface ClientConfig
 */
export interface ClientConfig {
  /** Network configuration */
  network: NetworkConfig;
  /** Contract/program addresses */
  addresses: DeploymentAddresses;
  /** Optional wallet private key for signing */
  privateKey?: string;
  /** Optional custom RPC configuration */
  rpcConfig?: RpcConfig;
}

/**
 * RPC configuration options
 * @interface RpcConfig
 */
export interface RpcConfig {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Rate limiting options */
  rateLimit?: {
    requestsPerSecond: number;
    maxConcurrent: number;
  };
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Transaction result for successful operations
 * @interface TransactionResult
 */
export interface TransactionResult {
  /** Transaction hash/signature */
  txHash: string;
  /** Block number/slot */
  block: number;
  /** Gas/compute units used */
  gasUsed?: bigint;
  /** Transaction status */
  status: TransactionStatus;
  /** Optional logs/events emitted */
  logs?: string[];
}

/**
 * Transaction status enumeration
 * @enum TransactionStatus
 */
export enum TransactionStatus {
  /** Transaction successful */
  SUCCESS = 'success',
  /** Transaction failed */
  FAILED = 'failed',
  /** Transaction pending confirmation */
  PENDING = 'pending'
}

/**
 * Error information for failed operations
 * @interface OperationError
 */
export interface OperationError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Optional transaction hash if available */
  txHash?: string;
  /** Optional underlying error details */
  details?: unknown;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Result type for operations that can succeed or fail
 * @template T Success result type
 * @template E Error type (defaults to OperationError)
 */
export type Result<T, E = OperationError> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Options for sending messages
 * @interface SendMessageOptions
 */
export interface SendMessageOptions {
  /** Message priority level */
  priority?: 'standard' | 'priority';
  /** Optional gas price/compute budget override */
  gasConfig?: {
    gasPrice?: bigint;
    gasLimit?: bigint;
  };
  /** Optional confirmation requirements */
  confirmations?: number;
}

/**
 * Pagination options for querying
 * @interface PaginationOptions
 */
export interface PaginationOptions {
  /** Number of items per page */
  limit: number;
  /** Offset from start */
  offset: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Query filters for messages
 * @interface MessageFilter
 */
export interface MessageFilter {
  /** Filter by sender */
  from?: MessageRecipient;
  /** Filter by recipient */
  to?: MessageRecipient;
  /** Filter by message type */
  messageType?: MessageType;
  /** Filter by date range */
  dateRange?: {
    from: Date;
    to: Date;
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a value is a Solana PublicKey
 * @param value - Value to check
 * @returns True if value is PublicKey
 */
export function isPublicKey(value: unknown): value is PublicKey {
  return value != null && typeof value === 'object' && value.constructor.name === 'PublicKey';
}

/**
 * Type guard to check if a value is an EVM address
 * @param value - Value to check  
 * @returns True if value is EVM address string
 */
export function isEvmAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Type guard to check if recipient is for Solana
 * @param recipient - Message recipient
 * @returns True if recipient is Solana PublicKey
 */
export function isSolanaRecipient(recipient: MessageRecipient): recipient is PublicKey {
  return isPublicKey(recipient);
}

/**
 * Type guard to check if recipient is for EVM
 * @param recipient - Message recipient
 * @returns True if recipient is EVM address
 */
export function isEvmRecipient(recipient: MessageRecipient): recipient is string {
  return isEvmAddress(recipient);
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Protocol constants used across implementations
 */
export const PROTOCOL_CONSTANTS = {
  /** Base send fee: 0.1 USDC (100,000 with 6 decimals) */
  SEND_FEE: 100_000n,
  
  /** Claim period: 60 days in seconds */
  CLAIM_PERIOD: CLAIM_PERIOD_DAYS * 24 * 60 * 60,
  
  /** Revenue share percentages */
  REVENUE_SHARES: {
    SENDER: 90,
    OWNER: 10
  },
  
  /** USDC token decimals */
  USDC_DECIMALS,
  
  /** Maximum message lengths */
  MAX_LENGTHS: {
    SUBJECT: 200,
    BODY: 2000,
    MAIL_ID: 100
  }
} as const;

/**
 * Default network configurations
 */
export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  ethereumMainnet: {
    chainType: ChainType.EVM,
    network: 'mainnet',
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
    chainId: 1
  },
  ethereumSepolia: {
    chainType: ChainType.EVM,
    network: 'sepolia',
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY',
    chainId: 11155111
  },
  solanaMainnet: {
    chainType: ChainType.SOLANA,
    network: 'mainnet-beta',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    chainId: 'mainnet-beta'
  },
  solanaDevnet: {
    chainType: ChainType.SOLANA,
    network: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    chainId: 'devnet'
  },
  hardhatLocal: {
    chainType: ChainType.EVM,
    network: 'hardhat',
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 1337
  }
} as const;
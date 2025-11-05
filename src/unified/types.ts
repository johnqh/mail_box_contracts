// Import types from @sudobility/types package (now ESM compatible)
import {
  ChainType,
  MessageSendResponse,
  DomainRegistrationResponse,
  MailboxDelegationResponse,
  Optional,
} from '@sudobility/types';
import type { WalletClient, PublicClient } from 'viem';

// For Solana, we'll use a minimal wallet interface matching what's needed
export interface SolanaWalletInterface {
  publicKey?: { toString(): string } | null;
  signTransaction<T extends { serialize(): Buffer }>(transaction: T): Promise<T>;
  signAllTransactions?<T extends { serialize(): Buffer }>(transactions: T[]): Promise<T[]>;
  connected?: boolean;
}

export interface UnifiedTransaction {
  hash: string;
  chainType: ChainType;
  blockNumber?: Optional<number>;
  slot?: Optional<number>;
  timestamp?: Optional<number>;
}

// Standard wallet types from ecosystem libraries
export type EVMWalletClient = WalletClient;
export type EVMPublicClient = PublicClient;
export type SolanaWalletAdapter = SolanaWalletInterface;

export interface ChainConfig {
  evm?: Optional<EVMConfig>;
  solana?: Optional<SolanaConfig>;
}

export interface EVMConfig {
  rpc: string;
  contracts: {
    mailer: string;
    usdc: string;
  };
  chainId: number;
}

export interface SolanaConfig {
  rpc: string;
  programs: {
    mailer: string;
  };
  usdcMint: string;
}

// Use types from @sudobility/types package for consistency
export type MessageResult = MessageSendResponse;
export type DomainResult = DomainRegistrationResponse;
export type DelegationResult = MailboxDelegationResponse;

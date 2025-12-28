// Import types from @sudobility/types package (now ESM compatible)
import { ChainType, Optional } from '@sudobility/types';
import {
  MessageSendResponse,
  DomainRegistrationResponse,
  MailboxDelegationResponse,
} from '@sudobility/mail_box_types';
import type { WalletClient, PublicClient } from 'viem';
import type { ChainInfo } from '@sudobility/configs';

// For Solana, we'll use a minimal wallet interface matching what's needed
interface SolanaWalletInterfaceLocal {
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
export type SolanaWalletAdapter = SolanaWalletInterfaceLocal;

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

// Re-export ChainInfo from configs
export type { ChainInfo };

// Import Wallet types from the stateless clients for consistency
import type { EVMWallet as EVMWalletType } from '../evm/evm-mailer-client';
import type { SolanaWallet as SolanaWalletType } from '../solana/solana-mailer-client';

// Re-export with consistent names
export type EVMWallet = EVMWalletType;
export type SolanaWallet = SolanaWalletType;

// Union type for both wallet types
export type Wallet = EVMWallet | SolanaWallet;

// Import types from @johnqh/types package (now ESM compatible)
import {
  ChainType,
  MessageSendResponse,
  DomainRegistrationResponse,
  MailboxDelegationResponse
} from '@johnqh/types';

export interface UnifiedTransaction {
  hash: string;
  chainType: ChainType;
  blockNumber?: number;
  slot?: number;
  timestamp?: number;
}

export interface UnifiedWallet {
  address: string;
  chainType: ChainType;
  signTransaction: (tx: unknown) => Promise<unknown>;
  publicKey?: string; // For Solana wallets
}

export interface ChainConfig {
  evm?: EVMConfig;
  solana?: SolanaConfig;
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

// Use types from @johnqh/types package for consistency
export type MessageResult = MessageSendResponse;
export type DomainResult = DomainRegistrationResponse;
export type DelegationResult = MailboxDelegationResponse;
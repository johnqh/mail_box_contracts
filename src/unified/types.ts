// Import types from @sudobility/types package (now ESM compatible)
import {
  ChainType,
  MessageSendResponse,
  DomainRegistrationResponse,
  MailboxDelegationResponse,
  Optional,
} from '@sudobility/types';

export interface UnifiedTransaction {
  hash: string;
  chainType: ChainType;
  blockNumber?: Optional<number>;
  slot?: Optional<number>;
  timestamp?: Optional<number>;
}

export interface UnifiedWallet {
  address: string;
  chainType: ChainType;
  signTransaction: (tx: unknown) => Promise<unknown>;
  publicKey?: Optional<string>; // For Solana wallets
}

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

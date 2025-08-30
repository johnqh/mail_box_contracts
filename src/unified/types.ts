export interface UnifiedTransaction {
  hash: string;
  chainType: 'evm' | 'solana';
  blockNumber?: number;
  slot?: number;
  timestamp?: number;
}

export interface UnifiedWallet {
  address: string;
  chainType: 'evm' | 'solana';
  signTransaction: (tx: any) => Promise<any>;
  publicKey?: string; // For Solana wallets
}

export interface ChainConfig {
  evm?: EVMConfig;
  solana?: SolanaConfig;
}

export interface EVMConfig {
  rpc: string;
  contracts: {
    mailService: string;
    mailer: string;
    usdc: string;
  };
  chainId: number;
}

export interface SolanaConfig {
  rpc: string;
  programs: {
    mailService: string;
    mailer: string;
    mailBoxFactory: string;
  };
  usdcMint: string;
}

export interface MessageResult {
  transactionHash: string;
  chainType: 'evm' | 'solana';
  messageId?: string;
  gasUsed?: bigint;
  fee: bigint;
}

export interface DomainResult {
  transactionHash: string;
  chainType: 'evm' | 'solana';
  domain: string;
  expiryTimestamp: number;
  fee: bigint;
}

export interface DelegationResult {
  transactionHash: string;
  chainType: 'evm' | 'solana';
  delegator: string;
  delegate: string;
  fee: bigint;
}
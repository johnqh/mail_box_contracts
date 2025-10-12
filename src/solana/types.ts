import { PublicKey } from '@solana/web3.js';
import { Optional } from '@sudobility/types';

export interface ClaimableInfo {
  amount: number;
  timestamp: number;
  recipient: string;
  isExpired: boolean;
}

export interface DelegationInfo {
  delegator: PublicKey;
  delegate?: Optional<PublicKey>;
  bump?: Optional<number>;
}

export interface DeploymentConfig {
  network: string;
  cluster: string;
  usdcMint: PublicKey;
  mailer: PublicKey;
}

export interface MailerFees {
  sendFee: number;
  delegationFee: number;
}

// Import from local utils instead of external dependency
export {
  USDC_DECIMALS,
  CLAIM_PERIOD_DAYS,
  formatUSDC,
  parseUSDC,
} from '../utils/currency.js';

// Network configurations
export const NETWORK_CONFIGS: Record<string, { usdcMint: PublicKey }> = {
  'mainnet-beta': {
    usdcMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  },
  devnet: {
    usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  },
  testnet: {
    usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  },
};

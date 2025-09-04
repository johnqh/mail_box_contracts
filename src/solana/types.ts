import { PublicKey } from '@solana/web3.js';

export interface ClaimableInfo {
    amount: number;
    expiresAt: number;
    isExpired: boolean;
}

export interface DelegationInfo {
    delegator: PublicKey;
    delegate: PublicKey | null;
    bump?: number;
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

export const USDC_DECIMALS = 6;
export const CLAIM_PERIOD_DAYS = 60;

// Network configurations
export const NETWORK_CONFIGS: Record<string, { usdcMint: PublicKey }> = {
    'mainnet-beta': {
        usdcMint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    },
    'devnet': {
        usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
    },
    'testnet': {
        usdcMint: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
    }
};

// Utility functions
export function formatUSDC(amount: number): string {
    return (amount / Math.pow(10, USDC_DECIMALS)).toFixed(2);
}

export function parseUSDC(amount: string): number {
    return Math.floor(parseFloat(amount) * Math.pow(10, USDC_DECIMALS));
}
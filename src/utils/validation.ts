/**
 * Validation utilities for multi-chain operations
 */

// Import ChainType and validation functions from @johnqh/types (now ESM compatible)
import { ChainType, isEvmAddress, isSolanaAddress } from '@johnqh/types';

// Re-export ChainType for convenience
export { ChainType };

export function validateDomain(domain: string): boolean {
  if (!domain || domain.length === 0) {
    throw new Error('Domain cannot be empty');
  }
  if (domain.length > 100) {
    throw new Error('Domain cannot exceed 100 characters');
  }
  // Basic domain validation - can be expanded
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!domainRegex.test(domain)) {
    throw new Error('Invalid domain format');
  }
  return true;
}

export function validateMessage(subject: string, body: string): boolean {
  if (!subject || subject.length === 0) {
    throw new Error('Message subject cannot be empty');
  }
  if (subject.length > 200) {
    throw new Error('Message subject cannot exceed 200 characters');
  }
  if (!body || body.length === 0) {
    throw new Error('Message body cannot be empty');
  }
  if (body.length > 10000) {
    throw new Error('Message body cannot exceed 10000 characters');
  }
  return true;
}

export function validateAddress(
  address: string,
  chainType: ChainType
): boolean {
  if (!address || address.length === 0) {
    throw new Error('Address cannot be empty');
  }

  // Use validation functions from @johnqh/types for consistent validation
  if (chainType === ChainType.EVM) {
    if (!isEvmAddress(address)) {
      throw new Error('Invalid EVM address format');
    }
  } else if (chainType === ChainType.SOLANA) {
    if (!isSolanaAddress(address)) {
      throw new Error('Invalid Solana address format');
    }
  } else {
    throw new Error(`Unsupported chain type: ${chainType}`);
  }

  return true;
}

export function validateAmount(amount: string | number | bigint): bigint {
  // Check for null, undefined, or empty string
  if (
    amount === null ||
    amount === undefined ||
    amount === '' ||
    (typeof amount === 'string' && amount.trim() === '')
  ) {
    throw new Error('Invalid amount format');
  }

  let amountBigInt: bigint;

  try {
    if (typeof amount === 'string') {
      // Check for non-numeric strings
      if (!/^-?\d+$/.test(amount.trim())) {
        throw new Error('Invalid amount format');
      }
      amountBigInt = BigInt(amount);
    } else if (typeof amount === 'number') {
      // Check for NaN or Infinity
      if (!Number.isFinite(amount)) {
        throw new Error('Invalid amount format');
      }
      amountBigInt = BigInt(Math.floor(amount));
    } else if (typeof amount === 'bigint') {
      amountBigInt = amount;
    } else {
      throw new Error('Invalid amount format');
    }
  } catch {
    throw new Error('Invalid amount format');
  }

  if (amountBigInt < BigInt(0)) {
    throw new Error('Amount cannot be negative');
  }

  return amountBigInt;
}
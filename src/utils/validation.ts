/**
 * Validation utilities for multi-chain operations
 */

export function validateDomain(domain: string): boolean {
  if (!domain || domain.length === 0) {
    throw new Error('Domain cannot be empty');
  }
  if (domain.length > 100) {
    throw new Error('Domain cannot exceed 100 characters');
  }
  // Basic domain validation - can be expanded
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
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

export function validateAddress(address: string, chainType: 'evm' | 'solana'): boolean {
  if (!address || address.length === 0) {
    throw new Error('Address cannot be empty');
  }

  if (chainType === 'evm') {
    const evmRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!evmRegex.test(address)) {
      throw new Error('Invalid EVM address format');
    }
  } else if (chainType === 'solana') {
    const solanaRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!solanaRegex.test(address)) {
      throw new Error('Invalid Solana address format');
    }
  } else {
    throw new Error(`Unsupported chain type: ${chainType}`);
  }

  return true;
}

export function validateAmount(amount: string | number | bigint): bigint {
  let amountBigInt: bigint;
  
  try {
    if (typeof amount === 'string') {
      amountBigInt = BigInt(amount);
    } else if (typeof amount === 'number') {
      amountBigInt = BigInt(Math.floor(amount));
    } else {
      amountBigInt = amount;
    }
  } catch (error) {
    throw new Error('Invalid amount format');
  }

  if (amountBigInt < 0n) {
    throw new Error('Amount cannot be negative');
  }

  return amountBigInt;
}
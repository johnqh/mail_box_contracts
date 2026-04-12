/**
 * Currency formatting utilities for USDC and other tokens
 */

// USDC configuration constants
export const USDC_DECIMALS = 6;
export const CLAIM_PERIOD_DAYS = 60;

/**
 * Format USDC amount from smallest unit to human-readable string
 * @param amount - Amount in smallest USDC units (with 6 decimals)
 * @returns Formatted string with 2 decimal places
 *
 * @example
 * formatUSDC(1000000) // Returns "1.00"
 * formatUSDC(2500000) // Returns "2.50"
 */
export function formatUSDC(amount: number): string {
  return (amount / Math.pow(10, USDC_DECIMALS)).toFixed(2);
}

/**
 * Parse USDC amount from human-readable string to smallest unit
 * @param amount - Human-readable amount string
 * @returns Amount in smallest USDC units (with 6 decimals)
 *
 * @example
 * parseUSDC("1.00") // Returns 1000000
 * parseUSDC("2.50") // Returns 2500000
 */
export function parseUSDC(amount: string): number {
  return Math.floor(parseFloat(amount) * Math.pow(10, USDC_DECIMALS));
}

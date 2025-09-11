export class WalletDetector {
  /**
   * Detects the wallet type based on its interface
   * @param wallet - The wallet object to analyze
   * @returns The detected chain type
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static detectWalletType(wallet: any): 'evm' | 'solana' {
    // Check for Solana wallet interface
    if (wallet.publicKey && wallet.signTransaction && !wallet.address) {
      return 'solana';
    }
    
    // Check for EVM wallet interface (MetaMask, etc.)
    if (wallet.address && wallet.request && !wallet.publicKey) {
      return 'evm';
    }
    
    // Additional checks for Web3 provider
    if (wallet.currentProvider || wallet._provider || wallet.provider) {
      return 'evm';
    }
    
    // Check for specific Solana wallet adapters
    if (wallet.adapter && typeof wallet.adapter === 'object' && 'name' in wallet.adapter) {
      return 'solana';
    }
    
    throw new Error('Unsupported wallet type - unable to detect EVM or Solana interface');
  }

  /**
   * Checks if a string looks like an EVM address
   * @param address - The address string to check
   * @returns True if it looks like an EVM address
   */
  static isEVMAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Checks if a string looks like a Solana address
   * @param address - The address string to check
   * @returns True if it looks like a Solana address
   */
  static isSolanaAddress(address: string): boolean {
    // Solana addresses are base58 encoded and typically 32-44 characters
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  /**
   * Detects chain type from address format
   * @param address - The address to analyze
   * @returns The detected chain type or null if unknown
   */
  static detectChainFromAddress(address: string): 'evm' | 'solana' | null {
    if (this.isEVMAddress(address)) {
      return 'evm';
    }
    if (this.isSolanaAddress(address)) {
      return 'solana';
    }
    return null;
  }
}
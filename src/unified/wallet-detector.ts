import { ChainType, AddressValidator } from '@johnqh/types';

export class WalletDetector {
  /**
   * Detects the wallet type based on its interface
   * @param wallet - The wallet object to analyze
   * @returns The detected chain type
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static detectWalletType(wallet: any): ChainType {
    // Check for Solana wallet interface
    if (wallet.publicKey && wallet.signTransaction && !wallet.address) {
      return ChainType.SOLANA;
    }

    // Check for EVM wallet interface (MetaMask, etc.)
    if (wallet.address && wallet.request && !wallet.publicKey) {
      return ChainType.EVM;
    }

    // Additional checks for Web3 provider
    if (wallet.currentProvider || wallet._provider || wallet.provider) {
      return ChainType.EVM;
    }

    // Check for specific Solana wallet adapters
    if (wallet.adapter && typeof wallet.adapter === 'object' && 'name' in wallet.adapter) {
      return ChainType.SOLANA;
    }
    
    throw new Error('Unsupported wallet type - unable to detect EVM or Solana interface');
  }

  /**
   * Checks if a string looks like an EVM address
   * @param address - The address string to check
   * @returns True if it looks like an EVM address
   */
  static isEVMAddress(address: string): boolean {
    return AddressValidator.isValidEVMAddress(address);
  }

  /**
   * Checks if a string looks like a Solana address
   * @param address - The address string to check
   * @returns True if it looks like a Solana address
   */
  static isSolanaAddress(address: string): boolean {
    return AddressValidator.isValidSolanaAddress(address);
  }

  /**
   * Detects chain type from address format
   * @param address - The address to analyze
   * @returns The detected chain type or null if unknown
   */
  static detectChainFromAddress(address: string): ChainType | null {
    if (this.isEVMAddress(address)) {
      return ChainType.EVM;
    }
    if (this.isSolanaAddress(address)) {
      return ChainType.SOLANA;
    }
    return null;
  }
}
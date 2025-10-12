/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Suppress false TypeScript errors with ESNext modules accessing class properties
import { ChainType } from '@sudobility/types';
import { WalletDetector } from './wallet-detector.js';
import {
  UnifiedWallet,
  ChainConfig,
  MessageResult,
  DomainResult,
  DelegationResult,
  UnifiedTransaction
} from './types.js';

/**
 * OnchainMailerClient - Multi-chain messaging client for Mailer protocol
 *
 * This class provides a unified interface for interacting with Mailer contracts
 * across different blockchain networks (EVM and Solana). It automatically detects
 * wallet types and routes operations to the appropriate chain implementation.
 * 
 * @example Basic Usage
 * ```typescript
 * // EVM wallet (MetaMask, etc.)
 * const evmWallet = window.ethereum;
 * const evmConfig = {
 *   evm: {
 *     rpc: 'https://eth-mainnet.alchemyapi.io/v2/your-key',
 *     chainId: 1,
 *     contracts: {
 *       mailer: '0x456...',
 *       usdc: '0x789...'
 *     }
 *   }
 * };
 * const evmClient = new OnchainMailerClient(evmWallet, evmConfig);
 * 
 * // Solana wallet (Phantom, etc.)
 * const solanaWallet = window.solana;
 * const solanaConfig = {
 *   solana: {
 *     rpc: 'https://api.mainnet-beta.solana.com',
 *     programs: {
 *       mailer: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF'
 *     },
 *     usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
 *   }
 * };
 * const solanaClient = new OnchainMailerClient(solanaWallet, solanaConfig);
 * 
 * // Send messages
 * const result = await client.sendMessage("Hello", "World!", false);
 * console.log('Transaction:', result.transactionHash);
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * try {
 *   const result = await client.sendMessage("Subject", "Body", true);
 *   console.log('Success:', result);
 * } catch (error) {
 *   if (error.message.includes('insufficient funds')) {
 *     console.log('User needs more USDC');
 *   } else if (error.message.includes('user rejected')) {
 *     console.log('User cancelled transaction');
 *   } else {
 *     console.log('Unknown error:', error);
 *   }
 * }
 * ```
 * 
 * @author Mailer Protocol Team
 * @version 1.5.2
 * @since 1.0.0
 */
export class OnchainMailerClient {
  protected chainType: ChainType;
  protected wallet: UnifiedWallet;
  protected config: ChainConfig;

  // Performance optimization: cache imported modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected static evmModules: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected static solanaModules: any = null;

  /**
   * Initialize OnchainMailerClient with wallet and chain configuration
   * 
   * @param wallet - Wallet instance (EVM or Solana compatible)
   * @param config - Chain configuration for EVM and/or Solana networks
   * 
   * @throws {Error} When wallet type cannot be detected
   * @throws {Error} When required configuration is missing
   * @throws {Error} When wallet doesn't implement required methods
   * 
   * @example
   * ```typescript
   * // EVM wallet initialization
   * const wallet = window.ethereum;
   * const config = { 
   *   evm: { rpc: '...', chainId: 1, contracts: {...} } 
   * };
   * const client = new OnchainMailerClient(wallet, config);
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(wallet: any, config: ChainConfig) {
    try {
      // Automatically detect whether this is an EVM or Solana wallet
      this.chainType = WalletDetector.detectWalletType(wallet);
      
      // Normalize wallet interface for internal use
      this.wallet = {
        address: wallet.address || wallet.publicKey?.toString() || '',
        chainType: this.chainType,
        signTransaction: wallet.signTransaction?.bind(wallet),
        publicKey: wallet.publicKey?.toString()
      };
      this.config = config;

      // Ensure we have valid configuration for the detected chain type
      this.validateConfiguration();
      
      // Ensure wallet implements required methods for its chain type
      this.validateWallet(wallet);
      
    } catch (error) {
      throw new Error(`OnchainMailerClient initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateConfiguration(): void {
    if (this.chainType === 'evm' && !this.config.evm) {
      throw new Error('EVM configuration required for EVM wallet');
    }
    if (this.chainType === 'solana' && !this.config.solana) {
      throw new Error('Solana configuration required for Solana wallet');
    }

    // Validate EVM configuration
    if (this.config.evm) {
      if (!this.config.evm.rpc || !this.config.evm.chainId) {
        throw new Error('EVM configuration missing required fields (rpc, chainId)');
      }
      if (!this.config.evm.contracts || !this.config.evm.contracts.mailer) {
        console.warn('EVM contract addresses not configured - some functionality may fail');
      }
    }

    // Validate Solana configuration  
    if (this.config.solana) {
      if (!this.config.solana.rpc || !this.config.solana.usdcMint) {
        throw new Error('Solana configuration missing required fields (rpc, usdcMint)');
      }
      if (!this.config.solana.programs || !this.config.solana.programs.mailer) {
        console.warn('Solana program addresses not configured - some functionality may fail');
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private validateWallet(wallet: any): void {
    if (!wallet.signTransaction && typeof wallet.signTransaction !== 'function') {
      throw new Error('Wallet must have signTransaction method');
    }

    if (this.chainType === 'evm' && !wallet.address) {
      throw new Error('EVM wallet must have address property');
    }

    if (this.chainType === 'solana' && !wallet.publicKey) {
      throw new Error('Solana wallet must have publicKey property');
    }
  }

  /**
   * Send a message using the appropriate chain implementation
   *
   * This method automatically routes to EVM or Solana based on the detected wallet type.
   * Priority messages cost more but include revenue sharing for recipients.
   *
   * @param subject - Message subject (1-200 characters)
   * @param body - Message body (1-10000 characters)
   * @param priority - Whether to use priority sending with revenue share
   *                   - Priority: Full fee paid, 90% claimable by recipient
   *                   - Standard: 10% fee only, no revenue share
   * @param resolveSenderToName - If true, resolve sender address to name via off-chain service
   *
   * @returns Promise resolving to MessageResult with transaction details
   *
   * @throws {Error} When subject/body validation fails
   * @throws {Error} When insufficient USDC balance
   * @throws {Error} When user rejects transaction
   * @throws {Error} When network connection fails
   *
   * @example Standard Message
   * ```typescript
   * const result = await client.sendMessage(
   *   "Meeting Reminder",
   *   "Don't forget our 3pm call today!",
   *   false, // Standard fee (10% of sendFee)
   *   false  // Don't resolve sender to name
   * );
   * console.log('Sent in tx:', result.transactionHash);
   * ```
   *
   * @example Priority Message with Revenue Share
   * ```typescript
   * const result = await client.sendMessage(
   *   "Important Update",
   *   "Urgent: Please review the attached proposal",
   *   true, // Priority fee (100% paid, 90% claimable by recipient)
   *   true  // Resolve sender to name
   * );
   * console.log('Priority message fee:', result.fee);
   * ```
   */
  async sendMessage(subject: string, body: string, priority: boolean = false, resolveSenderToName: boolean = false): Promise<MessageResult> {
    // Route to appropriate chain implementation based on wallet type
    if (this.chainType === 'evm') {
      return this.sendEVMMessage(subject, body, priority, resolveSenderToName);
    } else {
      return this.sendSolanaMessage(subject, body, priority, resolveSenderToName);
    }
  }

  /**
   * Register a domain using the appropriate chain implementation
   * @param domain - Domain name to register
   * @param isExtension - Whether this is extending an existing domain
   * @returns Domain registration result
   */
  async registerDomain(domain: string, isExtension: boolean = false): Promise<DomainResult> {
    if (this.chainType === 'evm') {
      return this.registerEVMDomain(domain, isExtension);
    } else {
      return this.registerSolanaDomain(domain, isExtension);
    }
  }

  /**
   * Delegate to another address using the appropriate chain implementation
   * @param delegate - Address to delegate to
   * @returns Delegation result
   */
  async delegateTo(delegate: string): Promise<DelegationResult> {
    // Validate delegate address format
    const delegateChainType = WalletDetector.detectChainFromAddress(delegate);
    if (delegateChainType !== this.chainType) {
      throw new Error(`Delegate address format doesn't match wallet chain type (${this.chainType})`);
    }

    if (this.chainType === 'evm') {
      return this.delegateEVM(delegate);
    } else {
      return this.delegateSolana(delegate);
    }
  }

  /**
   * Claim revenue share using the appropriate chain implementation
   * @returns Transaction result
   */
  async claimRevenue(): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.claimEVMRevenue();
    } else {
      return this.claimSolanaRevenue();
    }
  }

  // Performance optimization: cache module imports
  private async getEVMModules() {
    if (!OnchainMailerClient.evmModules) {
      try {
        const [viemModule, evmModule] = await Promise.all([
          import('viem'),
          import('../evm')
        ]);
        OnchainMailerClient.evmModules = {
          viem: viemModule,
          MailerClient: evmModule.MailerClient
        };
      } catch (error) {
        throw new Error(`Failed to load EVM modules: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return OnchainMailerClient.evmModules;
  }

  private async getSolanaModules() {
    if (!OnchainMailerClient.solanaModules) {
      try {
        const [solanaModule, web3Module] = await Promise.all([
          import('../solana'),
          import('@solana/web3.js')
        ]);
        OnchainMailerClient.solanaModules = {
          MailerClient: solanaModule.MailerClient,
          PublicKey: web3Module.PublicKey,
          Connection: web3Module.Connection
        };
      } catch (error) {
        throw new Error(`Failed to load Solana modules: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return OnchainMailerClient.solanaModules;
  }

  // Private methods for EVM implementation
  private async sendEVMMessage(subject: string, body: string, priority: boolean, resolveSenderToName: boolean = false): Promise<MessageResult> {
    try {
      const { viem, MailerClient } = await this.getEVMModules();

      if (!this.config.evm) {
        throw new Error('EVM configuration not provided');
      }

      if (!this.config.evm.contracts.mailer) {
        throw new Error('EVM Mailer contract address not configured');
      }

      // Create clients
      const publicClient = viem.createPublicClient({
        transport: viem.http(this.config.evm.rpc),
        chain: {
          id: this.config.evm.chainId,
          name: 'Custom Chain',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [this.config.evm.rpc] }
          }
        }
      });

      const walletClient = viem.createWalletClient({
        transport: viem.http(this.config.evm.rpc),
        chain: {
          id: this.config.evm.chainId,
          name: 'Custom Chain',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [this.config.evm.rpc] }
          }
        }
      });
      
      // Test connection
      try {
        await Promise.race([
          publicClient.getChainId(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
        ]);
      } catch (error) {
        throw new Error(`Failed to connect to EVM network: ${error instanceof Error ? error.message : String(error)}`);
      }

      const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
      
      // Validate message before sending
      if (!subject || subject.length > 200) {
        throw new Error('Subject must be 1-200 characters');
      }
      if (!body || body.length > 10000) {
        throw new Error('Body must be 1-10000 characters');
      }
      
      let txHash: `0x${string}`;
      try {
        txHash = await client.send(this.wallet.address, subject, body, priority, resolveSenderToName, walletClient, this.wallet.address);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('insufficient funds')) {
          throw new Error('Insufficient USDC balance to send message');
        }
        if (errorMessage.includes('user rejected')) {
          throw new Error('Transaction rejected by user');
        }
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      // Wait for confirmation with timeout
      const receipt = await Promise.race([
        publicClient.waitForTransactionReceipt({ hash: txHash }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
        )
      ]);

      return {
        transactionHash: txHash,
        chainType: ChainType.EVM,
        messageId: undefined, // Could extract from logs if needed
        fee: BigInt(priority ? '100000' : '10000'), // 0.1 or 0.01 USDC in micro-USDC
        gasUsed: receipt.gasUsed,
        isPriority: priority,
        success: true
      };
      
    } catch (error) {
      throw new Error(`EVM message sending failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async registerEVMDomain(_domain: string, _isExtension: boolean): Promise<DomainResult> {
    // Domain registration not implemented in current EVM version (delegation-only)
    throw new Error('Domain registration not yet implemented in EVM version - use delegation instead');
  }

  private async delegateEVM(delegate: string): Promise<DelegationResult> {
    const { viem } = await this.getEVMModules();

    if (!this.config.evm) {
      throw new Error('EVM configuration not provided');
    }

    // Validate EVM address format
    if (!viem.isAddress(delegate)) {
      throw new Error('Invalid EVM address format for delegate');
    }

    // Note: Domain functionality is now integrated into the Mailer contract
    throw new Error('Domain delegation is now handled through the Mailer contract - use MailerClient instead');
  }

  private async claimEVMRevenue(): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm) {
      throw new Error('EVM configuration not provided');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    
    const txHash = await client.claimRecipientShare(walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  // Private methods for Solana implementation
  private async sendSolanaMessage(subject: string, body: string, priority: boolean, resolveSenderToName: boolean = false): Promise<MessageResult> {
    try {
      const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

      if (!this.config.solana) {
        throw new Error('Solana configuration not provided');
      }

      if (!this.config.solana.programs.mailer) {
        throw new Error('Solana Mailer program address not configured');
      }

      const connection = new Connection(this.config.solana.rpc, 'confirmed');
      
      // Test connection
      try {
        await Promise.race([
          connection.getSlot(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
        ]);
      } catch (error) {
        throw new Error(`Failed to connect to Solana RPC: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Create wallet adapter for native client  
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wallet = MailerClient.createWallet(this.wallet as any);
      const programId = new PublicKey(this.config.solana.programs.mailer);
      const usdcMint = new PublicKey(this.config.solana.usdcMint);
      // For now, send to the wallet itself (self-messaging)
      const recipientKey = new PublicKey(this.wallet.address);

      const client = new MailerClient(connection, wallet, programId, usdcMint);

      // Get current fees
      const fees = await client.getFees();

      let txHash: string;
      txHash = await client.send(recipientKey.toBase58(), subject, body, priority, resolveSenderToName);

      // Get transaction details
      const tx = await connection.getTransaction(txHash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      
      // Get current slot for transaction info
      const slot = await connection.getSlot();
      
      return {
        transactionHash: txHash,
        chainType: ChainType.SOLANA,
        fee: priority ? fees.sendFee : fees.sendFee / 10,
        recipient: recipientKey.toBase58(),
        subject,
        body,
        slot,
        timestamp: tx?.blockTime ? tx.blockTime * 1000 : Date.now(),
        isPriority: priority,
        success: true
      };
      
    } catch (error) {
      throw new Error(`Solana message sending failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async registerSolanaDomain(_domain: string, _isExtension: boolean): Promise<DomainResult> {
    // Domain registration not implemented in current Solana version
    throw new Error('Domain registration not yet implemented in Solana version - use delegation instead');
  }

  private async delegateSolana(_delegate: string): Promise<DelegationResult> {
    if (!this.config.solana) {
      throw new Error('Solana configuration not provided');
    }

    // Note: Domain functionality is now integrated into the Mailer contract
    throw new Error('Domain delegation is now handled through the Mailer contract - use MailerClient instead');
  }

  private async claimSolanaRevenue(): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana) {
      throw new Error('Solana configuration not provided');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.claimRecipientShare();
    
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  /**
   * Get send fee using the appropriate chain implementation
   * @returns Send fee in USDC micro-units (6 decimals)
   */
  async getSendFee(): Promise<bigint> {
    if (this.chainType === 'evm') {
      return this.getEVMSendFee();
    } else {
      return this.getSolanaSendFee();
    }
  }

  /**
   * Get claimable amount for an address
   * @param address - Address to check claimable balance for (defaults to connected wallet)
   * @returns Claimable amount in USDC micro-units
   */
  async getClaimableAmount(address?: string): Promise<bigint> {
    const targetAddress = address || this.wallet.address;
    if (this.chainType === 'evm') {
      return this.getEVMClaimableAmount(targetAddress);
    } else {
      return this.getSolanaClaimableAmount(targetAddress);
    }
  }

  /**
   * Get owner's claimable fee balance
   * @returns Owner claimable amount in USDC micro-units
   */
  async getOwnerClaimable(): Promise<bigint> {
    if (this.chainType === 'evm') {
      return this.getEVMOwnerClaimable();
    } else {
      return this.getSolanaOwnerClaimable();
    }
  }

  /**
   * Get delegation information for an address
   * @param address - Address to check delegation for (defaults to connected wallet)
   * @returns Delegation address or null if no delegation
   */
  async getDelegation(address?: string): Promise<string | null> {
    const targetAddress = address || this.wallet.address;
    if (this.chainType === 'evm') {
      return this.getEVMDelegation(targetAddress);
    } else {
      return this.getSolanaDelegation(targetAddress);
    }
  }

  // EVM read methods
  private async getEVMSendFee(): Promise<bigint> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    return client.getSendFee();
  }

  private async getEVMClaimableAmount(address: string): Promise<bigint> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const result = await client.getRecipientClaimable(address);
    return result.amount;
  }

  private async getEVMOwnerClaimable(): Promise<bigint> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    return client.getOwnerClaimable();
  }

  private async getEVMDelegation(_address: string): Promise<string | null> {
    // Delegation read not implemented in EVM client yet
    // Would need to add getDelegation method to EVM MailerClient
    throw new Error('getDelegation not yet implemented for EVM');
  }

  // Solana read methods
  private async getSolanaSendFee(): Promise<bigint> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const fees = await client.getFees();
    return BigInt(fees.sendFee);
  }

  private async getSolanaClaimableAmount(address: string): Promise<bigint> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const recipientKey = new PublicKey(address);
    const claimInfo = await client.getRecipientClaimable(recipientKey);

    return claimInfo ? BigInt(claimInfo.amount) : 0n;
  }

  private async getSolanaOwnerClaimable(): Promise<bigint> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const amount = await client.getOwnerClaimable();
    return BigInt(amount);
  }

  private async getSolanaDelegation(address: string): Promise<string | null> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const delegatorKey = new PublicKey(address);
    const delegationInfo = await client.getDelegation(delegatorKey);

    return delegationInfo?.delegate || null;
  }

  /**
   * Send a prepared message using mail ID (to match cross-chain behavior)
   * @param to - Recipient address
   * @param mailId - Pre-prepared message identifier
   * @param priority - Whether to use priority sending with revenue share
   * @param resolveSenderToName - If true, resolve sender address to name
   * @returns Promise resolving to MessageResult
   */
  async sendPrepared(to: string, mailId: string, priority: boolean = false, resolveSenderToName: boolean = false): Promise<MessageResult> {
    if (this.chainType === 'evm') {
      return this.sendPreparedEVM(to, mailId, priority, resolveSenderToName);
    } else {
      return this.sendPreparedSolana(to, mailId, priority, resolveSenderToName);
    }
  }

  /**
   * Send message to email address (no wallet known)
   * @param toEmail - Email address of the recipient
   * @param subject - Message subject
   * @param body - Message body
   * @returns Promise resolving to MessageResult
   */
  async sendToEmail(toEmail: string, subject: string, body: string): Promise<MessageResult> {
    if (this.chainType === 'evm') {
      return this.sendToEmailEVM(toEmail, subject, body);
    } else {
      return this.sendToEmailSolana(toEmail, subject, body);
    }
  }

  /**
   * Send prepared message to email address (no wallet known)
   * @param toEmail - Email address of the recipient
   * @param mailId - Pre-prepared message identifier
   * @returns Promise resolving to MessageResult
   */
  async sendPreparedToEmail(toEmail: string, mailId: string): Promise<MessageResult> {
    if (this.chainType === 'evm') {
      return this.sendPreparedToEmailEVM(toEmail, mailId);
    } else {
      return this.sendPreparedToEmailSolana(toEmail, mailId);
    }
  }

  /**
   * Set the send fee (owner only)
   * @param newFee - New fee amount in USDC micro-units (6 decimals)
   * @returns Promise resolving to transaction details
   */
  async setFee(newFee: bigint): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.setFeeEVM(newFee);
    } else {
      return this.setFeeSolana(newFee);
    }
  }

  /**
   * Get the current send fee
   * @returns Current send fee in USDC micro-units (6 decimals)
   */
  async getFee(): Promise<bigint> {
    return this.getSendFee();
  }

  /**
   * Set the delegation fee (owner only)
   * @param newFee - New delegation fee in USDC micro-units
   * @returns Promise resolving to transaction details
   */
  async setDelegationFee(newFee: bigint): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.setDelegationFeeEVM(newFee);
    } else {
      return this.setDelegationFeeSolana(newFee);
    }
  }

  /**
   * Get the current delegation fee
   * @returns Current delegation fee in USDC micro-units
   */
  async getDelegationFee(): Promise<bigint> {
    if (this.chainType === 'evm') {
      return this.getDelegationFeeEVM();
    } else {
      return this.getDelegationFeeSolana();
    }
  }

  /**
   * Reject a delegation made to you by another address
   * @param delegatorAddress - Address that delegated to you
   * @returns Promise resolving to transaction details
   */
  async rejectDelegation(delegatorAddress: string): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.rejectDelegationEVM(delegatorAddress);
    } else {
      return this.rejectDelegationSolana(delegatorAddress);
    }
  }

  /**
   * Claim owner share of fees (owner only)
   * @returns Promise resolving to transaction details
   */
  async claimOwnerShare(): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.claimOwnerShareEVM();
    } else {
      return this.claimOwnerShareSolana();
    }
  }

  /**
   * Claim expired shares (owner only, EVM only)
   * @param recipient - Address to claim expired shares for
   * @returns Promise resolving to transaction details
   */
  async claimExpiredShares(recipient: string): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.claimExpiredSharesEVM(recipient);
    } else {
      throw new Error('claimExpiredShares not available on Solana');
    }
  }

  /**
   * Pause the contract and distribute funds (owner only)
   * @returns Promise resolving to transaction details
   */
  async pause(): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.pauseEVM();
    } else {
      return this.pauseSolana();
    }
  }

  /**
   * Unpause the contract (owner only)
   * @returns Promise resolving to transaction details
   */
  async unpause(): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.unpauseEVM();
    } else {
      return this.unpauseSolana();
    }
  }

  /**
   * Emergency unpause without fund distribution (owner only)
   * @returns Promise resolving to transaction details
   */
  async emergencyUnpause(): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.emergencyUnpauseEVM();
    } else {
      return this.emergencyUnpauseSolana();
    }
  }

  /**
   * Check if contract is currently paused
   * @returns True if contract is paused, false otherwise
   */
  async isPaused(): Promise<boolean> {
    if (this.chainType === 'evm') {
      return this.isPausedEVM();
    } else {
      return this.isPausedSolana();
    }
  }

  /**
   * Distribute claimable funds to a recipient when contract is paused
   * @param recipient - Address to distribute funds for
   * @returns Promise resolving to transaction details
   */
  async distributeClaimableFunds(recipient: string): Promise<UnifiedTransaction> {
    if (this.chainType === 'evm') {
      return this.distributeClaimableFundsEVM(recipient);
    } else {
      return this.distributeClaimableFundsSolana(recipient);
    }
  }

  // EVM Implementation Methods
  private async sendPreparedEVM(to: string, mailId: string, priority: boolean, resolveSenderToName: boolean): Promise<MessageResult> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.sendPrepared(to, mailId, priority, resolveSenderToName, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      transactionHash: txHash,
      chainType: ChainType.EVM,
      fee: BigInt(priority ? '100000' : '10000'),
      gasUsed: receipt.gasUsed,
      isPriority: priority,
      success: true
    };
  }

  private async sendToEmailEVM(toEmail: string, subject: string, body: string): Promise<MessageResult> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.sendToEmailAddress(toEmail, subject, body, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      transactionHash: txHash,
      chainType: ChainType.EVM,
      fee: BigInt('10000'), // 10% fee only
      gasUsed: receipt.gasUsed,
      isPriority: false,
      success: true
    };
  }

  private async sendPreparedToEmailEVM(toEmail: string, mailId: string): Promise<MessageResult> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.sendPreparedToEmailAddress(toEmail, mailId, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    return {
      transactionHash: txHash,
      chainType: ChainType.EVM,
      fee: BigInt('10000'), // 10% fee only
      gasUsed: receipt.gasUsed,
      isPriority: false,
      success: true
    };
  }

  private async setFeeEVM(newFee: bigint): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.setFee(newFee, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async setDelegationFeeEVM(newFee: bigint): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.setDelegationFee(newFee, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async getDelegationFeeEVM(): Promise<bigint> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    return client.getDelegationFee();
  }

  private async rejectDelegationEVM(delegatorAddress: string): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.rejectDelegation(delegatorAddress, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async claimOwnerShareEVM(): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.claimOwnerShare(walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async claimExpiredSharesEVM(recipient: string): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.claimExpiredShares(recipient, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async pauseEVM(): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.pause(walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async unpauseEVM(): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.unpause(walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async emergencyUnpauseEVM(): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.emergencyUnpause(walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  private async isPausedEVM(): Promise<boolean> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    return client.isPaused();
  }

  private async distributeClaimableFundsEVM(recipient: string): Promise<UnifiedTransaction> {
    const { viem, MailerClient } = await this.getEVMModules();

    if (!this.config.evm?.contracts.mailer) {
      throw new Error('EVM Mailer contract address not configured');
    }

    const publicClient = viem.createPublicClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const walletClient = viem.createWalletClient({
      transport: viem.http(this.config.evm.rpc),
      chain: {
        id: this.config.evm.chainId,
        name: 'Custom Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.evm.rpc] }
        }
      }
    });

    const client = new MailerClient(this.config.evm.contracts.mailer, publicClient);
    const txHash = await client.distributeClaimableFunds(recipient, walletClient, this.wallet.address);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    return {
      hash: txHash,
      chainType: ChainType.EVM,
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  // Solana Implementation Methods
  private async sendPreparedSolana(to: string, mailId: string, priority: boolean, resolveSenderToName: boolean): Promise<MessageResult> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);
    const recipientKey = new PublicKey(to);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.sendPrepared(recipientKey, mailId, priority, resolveSenderToName);

    const fees = await client.getFees();
    const slot = await connection.getSlot();
    const tx = await connection.getTransaction(txHash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });

    return {
      transactionHash: txHash,
      chainType: ChainType.SOLANA,
      fee: priority ? fees.sendFee : fees.sendFee / 10,
      slot,
      timestamp: tx?.blockTime ? tx.blockTime * 1000 : Date.now(),
      isPriority: priority,
      success: true
    };
  }

  private async sendToEmailSolana(toEmail: string, subject: string, body: string): Promise<MessageResult> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.sendToEmail(toEmail, subject, body);

    const fees = await client.getFees();
    const slot = await connection.getSlot();
    const tx = await connection.getTransaction(txHash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });

    return {
      transactionHash: txHash,
      chainType: ChainType.SOLANA,
      fee: fees.sendFee / 10, // 10% fee only
      slot,
      timestamp: tx?.blockTime ? tx.blockTime * 1000 : Date.now(),
      isPriority: false,
      success: true
    };
  }

  private async sendPreparedToEmailSolana(toEmail: string, mailId: string): Promise<MessageResult> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.sendPreparedToEmail(toEmail, mailId);

    const fees = await client.getFees();
    const slot = await connection.getSlot();
    const tx = await connection.getTransaction(txHash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });

    return {
      transactionHash: txHash,
      chainType: ChainType.SOLANA,
      fee: fees.sendFee / 10, // 10% fee only
      slot,
      timestamp: tx?.blockTime ? tx.blockTime * 1000 : Date.now(),
      isPriority: false,
      success: true
    };
  }

  private async setFeeSolana(newFee: bigint): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.setFee(newFee);
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  private async setDelegationFeeSolana(newFee: bigint): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.setDelegationFee(newFee);
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  private async getDelegationFeeSolana(): Promise<bigint> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const fees = await client.getFees();
    return BigInt(fees.delegationFee);
  }

  private async rejectDelegationSolana(delegatorAddress: string): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.rejectDelegation(delegatorAddress);
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  private async claimOwnerShareSolana(): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.claimOwnerShare();
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  private async pauseSolana(): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.pause();
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  private async unpauseSolana(): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.unpause();
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  private async emergencyUnpauseSolana(): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.emergencyUnpause();
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  private async isPausedSolana(): Promise<boolean> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    return client.isPaused();
  }

  private async distributeClaimableFundsSolana(recipient: string): Promise<UnifiedTransaction> {
    const { MailerClient, PublicKey, Connection } = await this.getSolanaModules();

    if (!this.config.solana?.programs.mailer) {
      throw new Error('Solana Mailer program address not configured');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wallet = MailerClient.createWallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailer);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailerClient(connection, wallet, programId, usdcMint);
    const txHash = await client.distributeClaimableFunds(recipient);
    const slot = await connection.getSlot();

    return {
      hash: txHash,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  // Utility methods
  getChainType(): ChainType {
    return this.chainType;
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }
}
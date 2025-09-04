import { WalletDetector } from './wallet-detector';
import { 
  UnifiedWallet, 
  ChainConfig, 
  MessageResult, 
  DomainResult, 
  DelegationResult,
  UnifiedTransaction 
} from './types';

export class UnifiedMailBoxClient {
  private chainType: 'evm' | 'solana';
  private wallet: UnifiedWallet;
  private config: ChainConfig;
  
  // Performance optimization: cache imported modules
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static evmModules: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static solanaModules: any = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(wallet: any, config: ChainConfig) {
    try {
      this.chainType = WalletDetector.detectWalletType(wallet);
      this.wallet = {
        address: wallet.address || wallet.publicKey?.toString() || '',
        chainType: this.chainType,
        signTransaction: wallet.signTransaction?.bind(wallet),
        publicKey: wallet.publicKey?.toString()
      };
      this.config = config;

      // Validate configuration
      this.validateConfiguration();
      
      // Validate wallet interface
      this.validateWallet(wallet);
      
    } catch (error) {
      throw new Error(`UnifiedMailBoxClient initialization failed: ${error instanceof Error ? error.message : String(error)}`);
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
      if (!this.config.evm.contracts || !this.config.evm.contracts.mailer || !this.config.evm.contracts.mailService) {
        console.warn('EVM contract addresses not configured - some functionality may fail');
      }
    }

    // Validate Solana configuration  
    if (this.config.solana) {
      if (!this.config.solana.rpc || !this.config.solana.usdcMint) {
        throw new Error('Solana configuration missing required fields (rpc, usdcMint)');
      }
      if (!this.config.solana.programs || !this.config.solana.programs.mailer || !this.config.solana.programs.mailService) {
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
   * @param subject - Message subject
   * @param body - Message body
   * @param priority - Whether to use priority sending (revenue share)
   * @returns Message result with transaction details
   */
  async sendMessage(subject: string, body: string, priority: boolean = false): Promise<MessageResult> {
    if (this.chainType === 'evm') {
      return this.sendEVMMessage(subject, body, priority);
    } else {
      return this.sendSolanaMessage(subject, body, priority);
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
    if (!UnifiedMailBoxClient.evmModules) {
      try {
        const [viemModule, evmModule] = await Promise.all([
          import('viem'),
          import('../evm')
        ]);
        UnifiedMailBoxClient.evmModules = {
          viem: viemModule,
          MailerClient: evmModule.MailerClient
        };
      } catch (error) {
        throw new Error(`Failed to load EVM modules: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return UnifiedMailBoxClient.evmModules;
  }

  private async getSolanaModules() {
    if (!UnifiedMailBoxClient.solanaModules) {
      try {
        const [solanaModule, web3Module] = await Promise.all([
          import('../solana'),
          import('@solana/web3.js')
        ]);
        UnifiedMailBoxClient.solanaModules = {
          MailerClient: solanaModule.MailerClient,
          PublicKey: web3Module.PublicKey,
          Connection: web3Module.Connection
        };
      } catch (error) {
        throw new Error(`Failed to load Solana modules: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return UnifiedMailBoxClient.solanaModules;
  }

  // Private methods for EVM implementation
  private async sendEVMMessage(subject: string, body: string, priority: boolean): Promise<MessageResult> {
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
        if (priority) {
          txHash = await client.sendPriority(subject, body, walletClient, this.wallet.address);
        } else {
          txHash = await client.send(subject, body, walletClient, this.wallet.address);
        }
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
        chainType: 'evm',
        messageId: undefined, // Could extract from logs if needed
        fee: BigInt(priority ? '100000' : '10000'), // 0.1 or 0.01 USDC in micro-USDC
        gasUsed: receipt.gasUsed
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
      chainType: 'evm',
      blockNumber: receipt.blockNumber,
      timestamp: Number(block.timestamp) * 1000
    };
  }

  // Private methods for Solana implementation
  private async sendSolanaMessage(subject: string, body: string, priority: boolean): Promise<MessageResult> {
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
      if (priority) {
        txHash = await client.sendPriority(recipientKey.toBase58(), subject, body);
      } else {
        txHash = await client.send(recipientKey.toBase58(), subject, body);
      }

      // Get transaction details
      const tx = await connection.getTransaction(txHash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      
      // Get current slot for transaction info
      const slot = await connection.getSlot();
      
      return {
        transactionHash: txHash,
        chainType: 'solana',
        fee: priority ? fees.sendFee : fees.sendFee / 10,
        recipient: recipientKey.toBase58(),
        subject,
        body,
        slot,
        timestamp: tx?.blockTime ? tx.blockTime * 1000 : Date.now()
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
      chainType: 'solana',
      slot,
      timestamp: Date.now()
    };
  }

  // Utility methods
  getChainType(): 'evm' | 'solana' {
    return this.chainType;
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }
}
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
  private static evmModules: any = null;
  private static solanaModules: any = null;

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
        const [ethersModule, evmModule] = await Promise.all([
          import('ethers'),
          import('../evm')
        ]);
        UnifiedMailBoxClient.evmModules = {
          ethers: ethersModule.ethers,
          MailerClient: evmModule.MailerClient,
          MailServiceClient: evmModule.MailServiceClient
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
        const [solanaModule, anchorModule, web3Module] = await Promise.all([
          import('../solana'),
          import('@coral-xyz/anchor'),
          import('@solana/web3.js')
        ]);
        UnifiedMailBoxClient.solanaModules = {
          MailerClient: solanaModule.MailerClient,
          MailServiceClient: solanaModule.MailServiceClient,
          anchor: anchorModule,
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
      const { ethers, MailerClient } = await this.getEVMModules();

      if (!this.config.evm) {
        throw new Error('EVM configuration not provided');
      }

      if (!this.config.evm.contracts.mailer) {
        throw new Error('EVM Mailer contract address not configured');
      }

      // Create provider and connect wallet
      const provider = new ethers.JsonRpcProvider(this.config.evm.rpc);
      
      // Test connection
      try {
        await Promise.race([
          provider.getNetwork(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
        ]);
      } catch (error) {
        throw new Error(`Failed to connect to EVM network: ${error instanceof Error ? error.message : String(error)}`);
      }

      const signer = this.wallet.signTransaction && typeof this.wallet.signTransaction === 'function' ? 
        new ethers.Wallet(this.wallet as any, provider) : // For direct private key
        provider.getSigner(this.wallet.address); // For connected wallet

      const client = new MailerClient(this.config.evm.contracts.mailer, provider);
      const connectedContract = client.getContract().connect(signer);
      
      // Validate message before sending
      if (!subject || subject.length > 200) {
        throw new Error('Subject must be 1-200 characters');
      }
      if (!body || body.length > 10000) {
        throw new Error('Body must be 1-10000 characters');
      }
      
      let tx: any;
      try {
        if (priority) {
          tx = await connectedContract.sendPriority(subject, body);
        } else {
          tx = await connectedContract.send(subject, body);
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
        tx.wait(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
        )
      ]);

      return {
        transactionHash: tx.hash,
        chainType: 'evm',
        messageId: undefined, // Could extract from logs if needed
        fee: BigInt(priority ? '100000' : '10000'), // 0.1 or 0.01 USDC in micro-USDC
        gasUsed: receipt.gasUsed
      };
      
    } catch (error) {
      throw new Error(`EVM message sending failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async registerEVMDomain(domain: string, isExtension: boolean): Promise<DomainResult> {
    // Domain registration not implemented in current EVM version (delegation-only)
    throw new Error('Domain registration not yet implemented in EVM version - use delegation instead');
  }

  private async delegateEVM(delegate: string): Promise<DelegationResult> {
    const { ethers } = await import('ethers');
    const { MailServiceClient } = await import('../evm');

    if (!this.config.evm) {
      throw new Error('EVM configuration not provided');
    }

    // Validate EVM address format
    if (!ethers.isAddress(delegate)) {
      throw new Error('Invalid EVM address format for delegate');
    }

    const provider = new ethers.JsonRpcProvider(this.config.evm.rpc);
    let signer: import('ethers').Signer;
    if (this.wallet.signTransaction && typeof this.wallet.signTransaction === 'function') {
      signer = new ethers.Wallet(this.wallet as any, provider);
    } else {
      signer = await provider.getSigner(this.wallet.address);
    }

    const client = new MailServiceClient(this.config.evm.contracts.mailService, provider);
    const connectedContract = client.getContract().connect(signer);
    
    const tx = await connectedContract.delegateTo(delegate);
    await tx.wait();
    const receipt = await tx.wait();

    return {
      transactionHash: tx.hash,
      chainType: 'evm',
      delegator: this.wallet.address,
      delegate: delegate,
      fee: BigInt('10000000') // 10 USDC in micro-USDC
    };
  }

  private async claimEVMRevenue(): Promise<UnifiedTransaction> {
    const { ethers } = await import('ethers');
    const { MailerClient } = await import('../evm');

    if (!this.config.evm) {
      throw new Error('EVM configuration not provided');
    }

    const provider = new ethers.JsonRpcProvider(this.config.evm.rpc);
    let signer: import('ethers').Signer;
    if (this.wallet.signTransaction && typeof this.wallet.signTransaction === 'function') {
      signer = new ethers.Wallet(this.wallet as any, provider);
    } else {
      signer = await provider.getSigner(this.wallet.address);
    }

    const client = new MailerClient(this.config.evm.contracts.mailer, provider);
    const connectedContract = client.getContract().connect(signer);
    
    const tx = await connectedContract.claimRecipientShare();
    const receipt = await tx.wait();
    const block = receipt ? await provider.getBlock(receipt.blockNumber) : null;

    return {
      hash: tx.hash,
      chainType: 'evm',
      blockNumber: receipt ? receipt.blockNumber : undefined,
      timestamp: block?.timestamp ? block.timestamp * 1000 : Date.now()
    };
  }

  // Private methods for Solana implementation
  private async sendSolanaMessage(subject: string, body: string, priority: boolean): Promise<MessageResult> {
    try {
      const { MailerClient, PublicKey, Connection, anchor } = await this.getSolanaModules();

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
        throw new Error(`Failed to connect to Solana network: ${error instanceof Error ? error.message : String(error)}`);
      }

      const wallet = new anchor.Wallet(this.wallet as any); // Cast for Solana wallet
      const programId = new PublicKey(this.config.solana.programs.mailer);
      const usdcMint = new PublicKey(this.config.solana.usdcMint);

      // Validate message before sending
      if (!subject || subject.length > 200) {
        throw new Error('Subject must be 1-200 characters');
      }
      if (!body || body.length > 10000) {
        throw new Error('Body must be 1-10000 characters');
      }

      const client = new MailerClient(connection, wallet, programId, usdcMint);
      
      let txHash: string;
      try {
        if (priority) {
          txHash = await client.sendPriority(subject, body);
        } else {
          txHash = await client.send(subject, body);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('insufficient funds')) {
          throw new Error('Insufficient SOL balance for transaction fees');
        }
        if (errorMessage.includes('insufficient balance')) {
          throw new Error('Insufficient USDC balance to send message');
        }
        if (errorMessage.includes('user rejected')) {
          throw new Error('Transaction rejected by user');
        }
        throw new Error(`Transaction failed: ${errorMessage}`);
      }

      // Get current slot for transaction info
      const slot = await connection.getSlot();
      
      return {
        transactionHash: txHash,
        chainType: 'solana',
        messageId: undefined, // Solana doesn't return message ID in same way
        fee: BigInt(priority ? 100000 : 10000), // 0.1 or 0.01 USDC in micro-USDC
        gasUsed: undefined // Solana doesn't use gas
      };
      
    } catch (error) {
      throw new Error(`Solana message sending failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async registerSolanaDomain(domain: string, isExtension: boolean): Promise<DomainResult> {
    // Domain registration not implemented in current Solana version
    throw new Error('Domain registration not yet implemented in Solana version - use delegation instead');
  }

  private async delegateSolana(delegate: string): Promise<DelegationResult> {
    const { MailServiceClient } = await import('../solana');
    const { PublicKey, Connection } = await import('@solana/web3.js');
    const anchor = await import('@coral-xyz/anchor');

    if (!this.config.solana) {
      throw new Error('Solana configuration not provided');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    const wallet = new anchor.Wallet(this.wallet as any);
    const programId = new PublicKey(this.config.solana.programs.mailService);
    const usdcMint = new PublicKey(this.config.solana.usdcMint);

    const client = new MailServiceClient(connection, wallet, programId, usdcMint);
    const delegateKey = new PublicKey(delegate);
    
    const txHash = await client.delegateTo(delegateKey);

    return {
      transactionHash: txHash,
      chainType: 'solana',
      delegator: this.wallet.address,
      delegate: delegate,
      fee: BigInt(10000000) // 10 USDC in micro-USDC
    };
  }

  private async claimSolanaRevenue(): Promise<UnifiedTransaction> {
    const { MailerClient } = await import('../solana');
    const { PublicKey, Connection } = await import('@solana/web3.js');
    const anchor = await import('@coral-xyz/anchor');

    if (!this.config.solana) {
      throw new Error('Solana configuration not provided');
    }

    const connection = new Connection(this.config.solana.rpc, 'confirmed');
    const wallet = new anchor.Wallet(this.wallet as any);
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
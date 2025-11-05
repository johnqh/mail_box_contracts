/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Suppress false TypeScript errors with ESNext modules accessing class properties
import { ChainType } from '@sudobility/types';
import {
  ChainConfig,
  MessageResult,
  DomainResult,
  DelegationResult,
  UnifiedTransaction,
  EVMWalletClient,
  EVMPublicClient
} from './types.js';
import type { Address } from 'viem';

/**
 * OnchainMailerClient v2 - Refactored to use standard wallet libraries
 *
 * This version removes the UnifiedWallet abstraction and instead accepts
 * standard wallet clients from wagmi (EVM) or wallet-adapter (Solana).
 *
 * @example EVM Usage with wagmi
 * ```typescript
 * import { createWalletClient, createPublicClient, http } from 'viem';
 * import { mainnet } from 'viem/chains';
 *
 * const walletClient = createWalletClient({
 *   chain: mainnet,
 *   transport: http()
 * });
 * const publicClient = createPublicClient({
 *   chain: mainnet,
 *   transport: http()
 * });
 *
 * const client = OnchainMailerClient.forEVM(
 *   walletClient,
 *   publicClient,
 *   '0xMailerContractAddress',
 *   '0xUSDCAddress'
 * );
 * ```
 *
 * @example Solana Usage with wallet-adapter
 * ```typescript
 * import { useWallet } from '@solana/wallet-adapter-react';
 * import { Connection } from '@solana/web3.js';
 *
 * const wallet = useWallet();
 * const connection = new Connection('https://api.mainnet-beta.solana.com');
 *
 * const client = OnchainMailerClient.forSolana(
 *   wallet,
 *   connection,
 *   'MailerProgramId',
 *   'USDCMintAddress'
 * );
 * ```
 */
export class OnchainMailerClient {
  protected chainType: ChainType;

  // EVM-specific properties
  protected evmWalletClient?: EVMWalletClient;
  protected evmPublicClient?: EVMPublicClient;
  protected evmContractAddress?: Address;
  protected evmUsdcAddress?: Address;

  // Solana-specific properties
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected solanaWallet?: any; // Wallet adapter interface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected solanaConnection?: any; // Connection
  protected solanaProgramId?: string;
  protected solanaUsdcMint?: string;

  // Cache for dynamic imports
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected static evmModules: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected static solanaModules: any = null;


  /**
   * Create an OnchainMailerClient for EVM chains using wagmi clients
   *
   * @param walletClient - wagmi WalletClient for signing transactions
   * @param publicClient - wagmi PublicClient for reading chain data
   * @param mailerAddress - Deployed Mailer contract address
   * @param usdcAddress - USDC token contract address
   * @returns Configured OnchainMailerClient for EVM
   */
  static forEVM(
    walletClient: EVMWalletClient,
    publicClient: EVMPublicClient,
    mailerAddress: string,
    usdcAddress?: string
  ): OnchainMailerClient {
    const client = new OnchainMailerClient({}, { evm: undefined, solana: undefined });
    client.chainType = ChainType.EVM;
    client.evmWalletClient = walletClient;
    client.evmPublicClient = publicClient;
    client.evmContractAddress = mailerAddress as Address;
    client.evmUsdcAddress = usdcAddress as Address;
    return client;
  }

  /**
   * Create an OnchainMailerClient for Solana using wallet-adapter
   *
   * @param wallet - Solana wallet adapter
   * @param connection - Solana connection
   * @param programId - Deployed Mailer program ID
   * @param usdcMint - USDC mint address
   * @returns Configured OnchainMailerClient for Solana
   */
  static forSolana(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wallet: any, // Wallet adapter interface
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connection: any, // Connection
    programId: string,
    usdcMint: string
  ): OnchainMailerClient {
    const client = new OnchainMailerClient({}, { evm: undefined, solana: undefined });
    client.chainType = ChainType.SOLANA;
    client.solanaWallet = wallet;
    client.solanaConnection = connection;
    client.solanaProgramId = programId;
    client.solanaUsdcMint = usdcMint;
    return client;
  }

  /**
   * Create an OnchainMailerClient from a generic config (backward compatibility)
   * This constructor is provided for backward compatibility with React provider
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(wallet: any, config: ChainConfig) {
    // Simple chain detection based on wallet properties
    const hasEthereumProperties = wallet && (wallet.address || wallet.request || wallet.selectedAddress);
    const hasSolanaProperties = wallet && wallet.publicKey && typeof wallet.signTransaction === 'function';

    if (hasEthereumProperties) {
      this.chainType = ChainType.EVM;
      if (config.evm) {
        // Store config for lazy initialization
        this.evmContractAddress = config.evm.contracts.mailer as Address;
        this.evmUsdcAddress = config.evm.contracts.usdc as Address;
        // Wallet and public clients will be created on first use

        // Store raw wallet for backward compatibility
        // @ts-ignore
        this._rawEvmWallet = wallet;
      } else {
        throw new Error('EVM configuration required for EVM wallet');
      }
    } else if (hasSolanaProperties) {
      this.chainType = ChainType.SOLANA;
      if (config.solana) {
        this.solanaWallet = wallet;
        // Connection will be created on first use
        this.solanaProgramId = config.solana.programs.mailer;
        this.solanaUsdcMint = config.solana.usdcMint;
      } else {
        throw new Error('Solana configuration required for Solana wallet');
      }
    } else {
      throw new Error('Unable to detect wallet type from provided wallet object');
    }
  }


  /**
   * Send a message using the appropriate chain implementation
   * Note: For backward compatibility, 'to' defaults to sender's own address
   */
  async sendMessage(
    subject: string,
    body: string,
    priority: boolean = false,
    resolveSenderToName: boolean = false,
    to?: string
  ): Promise<MessageResult> {
    // For backward compatibility, default to sending to self
    const recipient = to || await this.getWalletAddressAsync();

    if (this.chainType === ChainType.EVM) {
      return this.sendEVMMessage(recipient, subject, body, priority, resolveSenderToName);
    } else {
      return this.sendSolanaMessage(recipient, subject, body, priority, resolveSenderToName);
    }
  }

  /**
   * Register a domain (not implemented - for backward compatibility)
   */
  async registerDomain(_domain: string): Promise<DomainResult> {
    throw new Error('Domain registration not yet implemented');
  }

  /**
   * Delegate to another address
   */
  async delegateTo(delegate: string): Promise<DelegationResult> {
    if (this.chainType === ChainType.EVM) {
      return this.delegateEVM(delegate);
    } else {
      return this.delegateSolana(delegate);
    }
  }

  /**
   * Claim revenue share
   */
  async claimRevenue(): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.claimEVMRevenue();
    } else {
      return this.claimSolanaRevenue();
    }
  }

  // Performance optimization: cache module imports
  private async getEVMModules() {
    if (!OnchainMailerClient.evmModules) {
      const evmModule = await import('../evm/index.js');
      OnchainMailerClient.evmModules = {
        MailerClient: evmModule.MailerClient
      };
    }
    return OnchainMailerClient.evmModules;
  }

  private async getSolanaModules() {
    if (!OnchainMailerClient.solanaModules) {
      const [solanaModule, web3Module] = await Promise.all([
        import('../solana/index.js'),
        import('@solana/web3.js')
      ]);
      OnchainMailerClient.solanaModules = {
        MailerClient: solanaModule.MailerClient,
        PublicKey: web3Module.PublicKey,
        Connection: web3Module.Connection
      };
    }
    return OnchainMailerClient.solanaModules;
  }

  // EVM implementation methods
  private async sendEVMMessage(
    to: string,
    subject: string,
    body: string,
    priority: boolean,
    resolveSenderToName: boolean
  ): Promise<MessageResult> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);

    // Validate message
    if (!subject || subject.length > 200) {
      throw new Error('Subject must be 1-200 characters');
    }
    if (!body || body.length > 10000) {
      throw new Error('Body must be 1-10000 characters');
    }

    const [account] = await this.evmWalletClient.getAddresses();
    const payer = account;

    const result = await client.send(
      to,
      subject,
      body,
      payer,
      priority,
      resolveSenderToName,
      this.evmWalletClient,
      account
    );

    // Convert to MessageResult format
    return {
      transactionHash: result.hash,
      chainType: ChainType.EVM,
      fee: BigInt(priority ? '100000' : '10000'),
      gasUsed: result.gasUsed,
      isPriority: priority,
      success: true
    };
  }

  private async delegateEVM(delegate: string): Promise<DelegationResult> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);

    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.delegateTo(
      delegate,
      this.evmWalletClient,
      account
    );

    return {
      transactionHash: result.hash,
      chainType: ChainType.EVM,
      delegate,
      success: true
    };
  }

  private async claimEVMRevenue(): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);

    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.claimRecipientShare(
      this.evmWalletClient,
      account
    );

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  // Solana implementation methods
  private async sendSolanaMessage(
    to: string,
    subject: string,
    body: string,
    priority: boolean,
    resolveSenderToName: boolean
  ): Promise<MessageResult> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();

    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(
      this.solanaConnection,
      this.solanaWallet,
      programId,
      usdcMint
    );

    const result = await client.send(to, subject, body, priority, resolveSenderToName);

    // Get current fees
    const fees = await client.getFees();

    return {
      transactionHash: result.signature,
      chainType: ChainType.SOLANA,
      fee: priority ? fees.sendFee : fees.sendFee / 10,
      isPriority: priority,
      success: true
    };
  }

  private async delegateSolana(delegate: string): Promise<DelegationResult> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();

    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(
      this.solanaConnection,
      this.solanaWallet,
      programId,
      usdcMint
    );

    const result = await client.delegateTo(delegate);

    return {
      transactionHash: result.signature,
      chainType: ChainType.SOLANA,
      delegate,
      success: true
    };
  }

  private async claimSolanaRevenue(): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();

    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(
      this.solanaConnection,
      this.solanaWallet,
      programId,
      usdcMint
    );

    const result = await client.claimRecipientShare();
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  // Read methods
  async getSendFee(): Promise<bigint> {
    if (this.chainType === ChainType.EVM) {
      return this.getEVMSendFee();
    } else {
      return this.getSolanaSendFee();
    }
  }

  private async getEVMSendFee(): Promise<bigint> {
    if (!this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    return client.getSendFee();
  }

  private async getSolanaSendFee(): Promise<bigint> {
    if (!this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();

    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    // Create a minimal wallet object for reading
    const wallet = { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx };

    const client = new MailerClient(
      this.solanaConnection,
      wallet,
      programId,
      usdcMint
    );

    const fees = await client.getFees();
    return BigInt(fees.sendFee);
  }

  // Additional read methods
  async getClaimableAmount(address?: string): Promise<bigint> {
    const targetAddress = address || await this.getWalletAddressAsync();
    if (this.chainType === ChainType.EVM) {
      return this.getEVMClaimableAmount(targetAddress);
    } else {
      return this.getSolanaClaimableAmount(targetAddress);
    }
  }

  private async getEVMClaimableAmount(address: string): Promise<bigint> {
    if (!this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const result = await client.getRecipientClaimable(address);
    return result.amount;
  }

  private async getSolanaClaimableAmount(address: string): Promise<bigint> {
    if (!this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);
    const wallet = { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx };

    const client = new MailerClient(this.solanaConnection, wallet, programId, usdcMint);
    const recipientKey = new PublicKey(address);
    const claimInfo = await client.getRecipientClaimable(recipientKey);

    return claimInfo ? BigInt(claimInfo.amount) : 0n;
  }

  async getOwnerClaimable(): Promise<bigint> {
    if (this.chainType === ChainType.EVM) {
      return this.getEVMOwnerClaimable();
    } else {
      return this.getSolanaOwnerClaimable();
    }
  }

  private async getEVMOwnerClaimable(): Promise<bigint> {
    if (!this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    return client.getOwnerClaimable();
  }

  private async getSolanaOwnerClaimable(): Promise<bigint> {
    if (!this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);
    const wallet = { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx };

    const client = new MailerClient(this.solanaConnection, wallet, programId, usdcMint);
    const amount = await client.getOwnerClaimable();
    return BigInt(amount);
  }

  async getDelegation(address?: string): Promise<string | null> {
    const targetAddress = address || await this.getWalletAddressAsync();
    if (this.chainType === ChainType.EVM) {
      return this.getEVMDelegation(targetAddress);
    } else {
      return this.getSolanaDelegation(targetAddress);
    }
  }

  private async getEVMDelegation(_address: string): Promise<string | null> {
    // Delegation read not implemented in EVM client yet
    throw new Error('getDelegation not yet implemented for EVM');
  }

  private async getSolanaDelegation(address: string): Promise<string | null> {
    if (!this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);
    const wallet = { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx };

    const client = new MailerClient(this.solanaConnection, wallet, programId, usdcMint);
    const delegatorKey = new PublicKey(address);
    const delegationInfo = await client.getDelegation(delegatorKey);

    return delegationInfo?.delegate || null;
  }

  async getDelegationFee(): Promise<bigint> {
    if (this.chainType === ChainType.EVM) {
      return this.getEVMDelegationFee();
    } else {
      return this.getSolanaDelegationFee();
    }
  }

  private async getEVMDelegationFee(): Promise<bigint> {
    if (!this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    return client.getDelegationFee();
  }

  private async getSolanaDelegationFee(): Promise<bigint> {
    if (!this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);
    const wallet = { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx };

    const client = new MailerClient(this.solanaConnection, wallet, programId, usdcMint);
    const fees = await client.getFees();
    return BigInt(fees.delegationFee);
  }

  async isPaused(): Promise<boolean> {
    if (this.chainType === ChainType.EVM) {
      return this.isPausedEVM();
    } else {
      return this.isPausedSolana();
    }
  }

  private async isPausedEVM(): Promise<boolean> {
    if (!this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    return client.isPaused();
  }

  private async isPausedSolana(): Promise<boolean> {
    if (!this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);
    const wallet = { publicKey: PublicKey.default, signTransaction: async (tx: any) => tx };

    const client = new MailerClient(this.solanaConnection, wallet, programId, usdcMint);
    return client.isPaused();
  }

  // Write methods for contract management
  async unpause(): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.unpauseEVM();
    } else {
      return this.unpauseSolana();
    }
  }

  private async unpauseEVM(): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.unpause(this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async unpauseSolana(): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.unpause();
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  async emergencyUnpause(): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.emergencyUnpauseEVM();
    } else {
      return this.emergencyUnpauseSolana();
    }
  }

  private async emergencyUnpauseEVM(): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.emergencyUnpause(this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async emergencyUnpauseSolana(): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.emergencyUnpause();
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  async distributeClaimableFunds(recipient: string): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.distributeClaimableFundsEVM(recipient);
    } else {
      return this.distributeClaimableFundsSolana(recipient);
    }
  }

  private async distributeClaimableFundsEVM(recipient: string): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.distributeClaimableFunds(recipient, this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async distributeClaimableFundsSolana(recipient: string): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.distributeClaimableFunds(recipient);
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  // Additional methods for complete API compatibility
  async sendPrepared(to: string, mailId: string, priority: boolean = false, resolveSenderToName: boolean = false): Promise<MessageResult> {
    if (this.chainType === ChainType.EVM) {
      return this.sendPreparedEVM(to, mailId, priority, resolveSenderToName);
    } else {
      return this.sendPreparedSolana(to, mailId, priority, resolveSenderToName);
    }
  }

  private async sendPreparedEVM(to: string, mailId: string, priority: boolean, resolveSenderToName: boolean): Promise<MessageResult> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();
    const payer = account;

    const result = await client.sendPrepared(to, mailId, payer, priority, resolveSenderToName, this.evmWalletClient, account);

    return {
      transactionHash: result.hash,
      chainType: ChainType.EVM,
      fee: BigInt(priority ? '100000' : '10000'),
      gasUsed: result.gasUsed,
      isPriority: priority,
      success: true
    };
  }

  private async sendPreparedSolana(to: string, mailId: string, priority: boolean, resolveSenderToName: boolean): Promise<MessageResult> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);
    const recipientKey = new PublicKey(to);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.sendPrepared(recipientKey, mailId, priority, resolveSenderToName);

    const fees = await client.getFees();

    return {
      transactionHash: result.signature,
      chainType: ChainType.SOLANA,
      fee: priority ? fees.sendFee : fees.sendFee / 10,
      isPriority: priority,
      success: true
    };
  }

  async sendToEmail(toEmail: string, subject: string, body: string): Promise<MessageResult> {
    if (this.chainType === ChainType.EVM) {
      return this.sendToEmailEVM(toEmail, subject, body);
    } else {
      return this.sendToEmailSolana(toEmail, subject, body);
    }
  }

  private async sendToEmailEVM(toEmail: string, subject: string, body: string): Promise<MessageResult> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();
    const payer = account;

    const result = await client.sendToEmailAddress(toEmail, subject, body, payer, this.evmWalletClient, account);

    return {
      transactionHash: result.hash,
      chainType: ChainType.EVM,
      fee: BigInt('10000'), // 10% fee only
      gasUsed: result.gasUsed,
      isPriority: false,
      success: true
    };
  }

  private async sendToEmailSolana(toEmail: string, subject: string, body: string): Promise<MessageResult> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.sendToEmail(toEmail, subject, body);

    const fees = await client.getFees();

    return {
      transactionHash: result.signature,
      chainType: ChainType.SOLANA,
      fee: fees.sendFee / 10, // 10% fee only
      isPriority: false,
      success: true
    };
  }

  async sendPreparedToEmail(toEmail: string, mailId: string): Promise<MessageResult> {
    if (this.chainType === ChainType.EVM) {
      return this.sendPreparedToEmailEVM(toEmail, mailId);
    } else {
      return this.sendPreparedToEmailSolana(toEmail, mailId);
    }
  }

  private async sendPreparedToEmailEVM(toEmail: string, mailId: string): Promise<MessageResult> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();
    const payer = account;

    const result = await client.sendPreparedToEmailAddress(toEmail, mailId, payer, this.evmWalletClient, account);

    return {
      transactionHash: result.hash,
      chainType: ChainType.EVM,
      fee: BigInt('10000'), // 10% fee only
      gasUsed: result.gasUsed,
      isPriority: false,
      success: true
    };
  }

  private async sendPreparedToEmailSolana(toEmail: string, mailId: string): Promise<MessageResult> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.sendPreparedToEmail(toEmail, mailId);

    const fees = await client.getFees();

    return {
      transactionHash: result.signature,
      chainType: ChainType.SOLANA,
      fee: fees.sendFee / 10, // 10% fee only
      isPriority: false,
      success: true
    };
  }

  async claimOwnerShare(): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.claimOwnerShareEVM();
    } else {
      return this.claimOwnerShareSolana();
    }
  }

  private async claimOwnerShareEVM(): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.claimOwnerShare(this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async claimOwnerShareSolana(): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.claimOwnerShare();
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  async claimExpiredShares(recipient: string): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.claimExpiredSharesEVM(recipient);
    } else {
      return this.claimExpiredSharesSolana(recipient);
    }
  }

  private async claimExpiredSharesEVM(recipient: string): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.claimExpiredShares(recipient, this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async claimExpiredSharesSolana(recipient: string): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);
    const recipientKey = new PublicKey(recipient);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.claimExpiredShares(recipientKey);
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  async rejectDelegation(delegatorAddress: string): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.rejectDelegationEVM(delegatorAddress);
    } else {
      return this.rejectDelegationSolana(delegatorAddress);
    }
  }

  private async rejectDelegationEVM(delegatorAddress: string): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.rejectDelegation(delegatorAddress, this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async rejectDelegationSolana(delegatorAddress: string): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.rejectDelegation(delegatorAddress);
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  async setFee(newFee: bigint): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.setFeeEVM(newFee);
    } else {
      return this.setFeeSolana(newFee);
    }
  }

  private async setFeeEVM(newFee: bigint): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.setFee(newFee, this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async setFeeSolana(newFee: bigint): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.setFee(newFee);
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  async setDelegationFee(newFee: bigint): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.setDelegationFeeEVM(newFee);
    } else {
      return this.setDelegationFeeSolana(newFee);
    }
  }

  private async setDelegationFeeEVM(newFee: bigint): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.setDelegationFee(newFee, this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async setDelegationFeeSolana(newFee: bigint): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.setDelegationFee(newFee);
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
      chainType: ChainType.SOLANA,
      slot,
      timestamp: Date.now()
    };
  }

  async pause(): Promise<UnifiedTransaction> {
    if (this.chainType === ChainType.EVM) {
      return this.pauseEVM();
    } else {
      return this.pauseSolana();
    }
  }

  private async pauseEVM(): Promise<UnifiedTransaction> {
    if (!this.evmWalletClient || !this.evmPublicClient || !this.evmContractAddress) {
      throw new Error('EVM client not properly initialized');
    }

    const { MailerClient } = await this.getEVMModules();
    const client = new MailerClient(this.evmContractAddress, this.evmPublicClient);
    const [account] = await this.evmWalletClient.getAddresses();

    const result = await client.pause(this.evmWalletClient, account);

    return {
      hash: result.hash,
      chainType: ChainType.EVM,
      blockNumber: result.blockNumber,
      timestamp: Date.now()
    };
  }

  private async pauseSolana(): Promise<UnifiedTransaction> {
    if (!this.solanaWallet || !this.solanaConnection || !this.solanaProgramId || !this.solanaUsdcMint) {
      throw new Error('Solana client not properly initialized');
    }

    const { MailerClient, PublicKey } = await this.getSolanaModules();
    const programId = new PublicKey(this.solanaProgramId);
    const usdcMint = new PublicKey(this.solanaUsdcMint);

    const client = new MailerClient(this.solanaConnection, this.solanaWallet, programId, usdcMint);
    const result = await client.pause();
    const slot = await this.solanaConnection.getSlot();

    return {
      hash: result.signature,
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
    if (this.chainType === ChainType.EVM) {
      // Try to get address from raw wallet for backward compatibility
      // @ts-ignore
      if (this._rawEvmWallet) {
        // @ts-ignore
        return this._rawEvmWallet.address || this._rawEvmWallet.selectedAddress || '';
      }
      return ''; // Caller should use getWalletAddressAsync() for accurate address
    } else if (this.chainType === ChainType.SOLANA && this.solanaWallet) {
      return this.solanaWallet.publicKey?.toString() || '';
    }
    return '';
  }

  /**
   * Get wallet address asynchronously
   */
  async getWalletAddressAsync(): Promise<string> {
    if (this.chainType === ChainType.EVM && this.evmWalletClient) {
      const [address] = await this.evmWalletClient.getAddresses();
      return address;
    } else if (this.chainType === ChainType.SOLANA && this.solanaWallet) {
      return this.solanaWallet.publicKey?.toString() || '';
    }
    throw new Error('Wallet not initialized');
  }
}
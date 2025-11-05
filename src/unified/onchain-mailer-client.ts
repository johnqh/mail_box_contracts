/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Suppress false TypeScript errors with ESNext modules accessing class properties
import { ChainType } from '@sudobility/types';
import { ChainInfo } from '@sudobility/configs';
import type {
  EVMWallet,
} from '../evm/evm-mailer-client.js';
import type {
  SolanaWallet,
} from '../solana/solana-mailer-client.js';

import {
  MessageResult,
  DomainResult,
  DelegationResult,
  UnifiedTransaction,
  Wallet
} from './types.js';

/**
 * OnchainMailerClient - Stateless multi-chain messaging client
 *
 * This version uses stateless EVM and Solana clients underneath.
 * All wallet connections and chain information are passed as parameters to each method.
 *
 * @example EVM Usage
 * ```typescript
 * import { createWalletClient, createPublicClient, http } from 'viem';
 * import { RpcHelpers } from '@sudobility/configs';
 * import { Chain } from '@sudobility/types';
 *
 * const chainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);
 * const walletClient = createWalletClient({
 *   chain: mainnet,
 *   transport: http()
 * });
 *
 * const client = new OnchainMailerClient();
 * await client.sendMessage(
 *   'Subject',
 *   'Body',
 *   { walletClient },
 *   chainInfo,
 *   { priority: true }
 * );
 * ```
 *
 * @example Solana Usage
 * ```typescript
 * import { useWallet } from '@solana/wallet-adapter-react';
 * import { Connection } from '@solana/web3.js';
 * import { RpcHelpers } from '@sudobility/configs';
 * import { Chain } from '@sudobility/types';
 *
 * const chainInfo = RpcHelpers.getChainInfo(Chain.SOLANA_MAINNET);
 * const wallet = useWallet();
 *
 * const client = new OnchainMailerClient();
 * await client.sendMessage(
 *   'Subject',
 *   'Body',
 *   { wallet },
 *   chainInfo,
 *   { priority: true }
 * );
 * ```
 */
export class OnchainMailerClient {
  // Cache for dynamic imports
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static evmClient: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static solanaClient: any = null;

  /**
   * Create a new stateless OnchainMailerClient
   * No configuration needed in constructor
   */
  constructor() {
    // Stateless - no initialization needed
  }

  // Performance optimization: cache client imports
  private async getEVMClient() {
    if (!OnchainMailerClient.evmClient) {
      const { EVMMailerClient } = await import('../evm/evm-mailer-client.js');
      OnchainMailerClient.evmClient = new EVMMailerClient();
    }
    return OnchainMailerClient.evmClient;
  }

  private async getSolanaClient() {
    if (!OnchainMailerClient.solanaClient) {
      const { SolanaMailerClient } = await import('../solana/solana-mailer-client.js');
      OnchainMailerClient.solanaClient = new SolanaMailerClient();
    }
    return OnchainMailerClient.solanaClient;
  }

  /**
   * Send a message on the blockchain
   * @param subject - Message subject (1-200 characters)
   * @param body - Message body (1-10000 characters)
   * @param wallet - Wallet connection (EVM or Solana)
   * @param chainInfo - Chain information including RPC endpoints and contract addresses
   * @param options - Optional parameters
   * @returns Transaction result
   */
  async sendMessage(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    subject: string,
    body: string,
    options?: {
      priority?: boolean;
      to?: string;
      resolveSenderToName?: boolean;
      gasOptions?: any; // Gas options for EVM
      computeOptions?: any; // Compute options for Solana
    }
  ): Promise<MessageResult> {
    // Validate message
    if (!subject || subject.length > 200) {
      throw new Error('Subject must be 1-200 characters');
    }
    if (!body || body.length > 10000) {
      throw new Error('Body must be 1-10000 characters');
    }

    // Route to appropriate implementation based on chain type
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const evmWallet = connectedWallet as EVMWallet;
      const [account] = await evmWallet.walletClient.getAddresses();

      const to = options?.to || account;
      const priority = options?.priority ?? false;
      const resolveSenderToName = options?.resolveSenderToName ?? false;

      const result = await evmClient.send(
        evmWallet,
        chainInfo,
        to,
        subject,
        body,
        account, // payer
        priority, // revenueShareToReceiver
        resolveSenderToName,
        options?.gasOptions
      );

      return {
        transactionHash: result.hash,
        chainType: ChainType.EVM,
        fee: BigInt(priority ? '100000' : '10000'),
        gasUsed: result.gasUsed,
        isPriority: priority,
        success: true
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const solanaWallet = connectedWallet as SolanaWallet;

      const to = options?.to || solanaWallet.wallet.publicKey.toBase58();
      const priority = options?.priority ?? false;

      const result = await solanaClient.send(
        solanaWallet,
        chainInfo,
        to,
        subject,
        body,
        priority, // revenueShareToReceiver
        options?.computeOptions
      );

      return {
        transactionHash: result.transactionHash,
        chainType: ChainType.SOLANA,
        fee: BigInt(priority ? '100000' : '10000'),
        isPriority: priority,
        success: true
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Send a prepared message
   */
  async sendPrepared(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    to: string,
    mailId: string,
    options?: {
      priority?: boolean;
      resolveSenderToName?: boolean;
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<MessageResult> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const evmWallet = connectedWallet as EVMWallet;
      const [account] = await evmWallet.walletClient.getAddresses();

      const priority = options?.priority ?? false;
      const resolveSenderToName = options?.resolveSenderToName ?? false;

      const result = await evmClient.sendPrepared(
        evmWallet,
        chainInfo,
        to,
        mailId,
        account, // payer
        priority, // revenueShareToReceiver
        resolveSenderToName,
        options?.gasOptions
      );

      return {
        transactionHash: result.hash,
        chainType: ChainType.EVM,
        fee: BigInt(priority ? '100000' : '10000'),
        gasUsed: result.gasUsed,
        isPriority: priority,
        success: true
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const solanaWallet = connectedWallet as SolanaWallet;
      const priority = options?.priority ?? false;

      const result = await solanaClient.sendPrepared(
        solanaWallet,
        chainInfo,
        to,
        mailId,
        priority,
        options?.computeOptions
      );

      return {
        transactionHash: result.transactionHash,
        chainType: ChainType.SOLANA,
        fee: BigInt(priority ? '100000' : '10000'),
        isPriority: priority,
        success: true
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Send through webhook
   */
  async sendThroughWebhook(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    to: string,
    webhookId: string,
    options?: {
      priority?: boolean;
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<MessageResult> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const evmWallet = connectedWallet as EVMWallet;
      const [account] = await evmWallet.walletClient.getAddresses();
      const priority = options?.priority ?? false;

      const result = await evmClient.sendThroughWebhook(
        to,
        subject,
        body,
        webhookId,
        account, // payer
        priority,
        evmWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        transactionHash: result.hash,
        chainType: ChainType.EVM,
        fee: BigInt(priority ? '100000' : '10000'),
        gasUsed: result.gasUsed,
        isPriority: priority,
        success: true
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const solanaWallet = connectedWallet as SolanaWallet;
      const priority = options?.priority ?? false;

      const result = await solanaClient.sendThroughWebhook(
        solanaWallet,
        chainInfo,
        to,
        webhookId,
        priority,
        options?.computeOptions
      );

      return {
        transactionHash: result.transactionHash,
        chainType: ChainType.SOLANA,
        fee: BigInt(priority ? '100000' : '10000'),
        isPriority: priority,
        success: true
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Delegate to another address
   * @param delegate - Address to delegate to
   * @param wallet - Wallet connection
   * @param chainInfo - Chain information
   * @returns Transaction result
   */
  async delegateTo(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    delegate: string,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<DelegationResult> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.delegateTo(
        delegate,
        connectedWallet as EVMWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        transactionHash: result.hash,
        chainType: ChainType.EVM,
        delegate,
        success: true
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.delegateTo(
        delegate,
        connectedWallet as SolanaWallet,
        chainInfo,
        options?.computeOptions
      );

      return {
        transactionHash: result.transactionHash,
        chainType: ChainType.SOLANA,
        delegate,
        success: true
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Reject delegation
   */
  async rejectDelegation(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    delegatingAddress: string,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.rejectDelegation(
        connectedWallet as EVMWallet,
        chainInfo,
        delegatingAddress,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.rejectDelegation(
        connectedWallet as SolanaWallet,
        chainInfo,
        delegatingAddress,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Claim revenue share
   * @param wallet - Wallet connection
   * @param chainInfo - Chain information
   * @returns Transaction result
   */
  async claimRevenue(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.claimRecipientShare(
        connectedWallet as EVMWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.claimRecipientShare(
        connectedWallet as SolanaWallet,
        chainInfo,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Claim owner share (owner only)
   */
  async claimOwnerShare(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.claimOwnerShare(
        connectedWallet as EVMWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.claimOwnerShare(
        connectedWallet as SolanaWallet,
        chainInfo,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Claim expired shares (owner only)
   */
  async claimExpiredShares(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    recipient: string,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.claimExpiredShares(
        recipient,
        connectedWallet as EVMWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.claimExpiredShares(
        recipient,
        connectedWallet as SolanaWallet,
        chainInfo,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Set fees (owner only)
   */
  async setFees(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    sendFee: number | bigint,
    delegationFee: number | bigint,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();

      // EVM client uses separate methods
      await evmClient.setFee(
        connectedWallet as EVMWallet,
        chainInfo,
        sendFee,
        options?.gasOptions
      );

      const result2 = await evmClient.setDelegationFee(
        connectedWallet as EVMWallet,
        chainInfo,
        delegationFee,
        options?.gasOptions
      );

      return {
        hash: result2.hash, // Return last transaction
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.setFees(
        connectedWallet as SolanaWallet,
        chainInfo,
        sendFee,
        delegationFee,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Set custom fee percentage
   */
  async setCustomFeePercentage(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    target: string,
    percentage: number,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.setCustomFeePercentage(
        connectedWallet as EVMWallet,
        chainInfo,
        target,
        percentage,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.setCustomFeePercentage(
        connectedWallet as SolanaWallet,
        chainInfo,
        target,
        percentage,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Clear custom fee percentage
   */
  async clearCustomFeePercentage(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    target: string,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.clearCustomFeePercentage(
        connectedWallet as EVMWallet,
        chainInfo,
        target,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.clearCustomFeePercentage(
        connectedWallet as SolanaWallet,
        chainInfo,
        target,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Pause the contract/program (owner only)
   */
  async pause(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.pause(
        connectedWallet as EVMWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.pause(
        connectedWallet as SolanaWallet,
        chainInfo,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Unpause the contract/program (owner only)
   */
  async unpause(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.unpause(
        connectedWallet as EVMWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.unpause(
        connectedWallet as SolanaWallet,
        chainInfo,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Emergency unpause (owner only)
   */
  async emergencyUnpause(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.emergencyUnpause(
        connectedWallet as EVMWallet,
        chainInfo,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const result = await solanaClient.emergencyUnpause(
        connectedWallet as SolanaWallet,
        chainInfo,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Distribute claimable funds when paused
   * Note: EVM supports single recipient, Solana supports multiple
   */
  async distributeClaimableFunds(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    recipient: string | string[],
    options?: {
      gasOptions?: any;
      computeOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      // EVM only supports single recipient
      const singleRecipient = Array.isArray(recipient) ? recipient[0] : recipient;
      const result = await evmClient.distributeClaimableFunds(
        connectedWallet as EVMWallet,
        chainInfo,
        singleRecipient,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      // Solana supports multiple recipients
      const recipients = Array.isArray(recipient) ? recipient : [recipient];
      const result = await solanaClient.distributeClaimableFunds(
        connectedWallet as SolanaWallet,
        chainInfo,
        recipients,
        options?.computeOptions
      );

      return {
        hash: result.transactionHash,
        chainType: ChainType.SOLANA
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Set permission for a contract to use caller's USDC for sending messages
   * Note: Only supported on EVM chains
   */
  async setPermission(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    contractAddress: string,
    options?: {
      gasOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.setPermission(
        connectedWallet as EVMWallet,
        chainInfo,
        contractAddress,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      throw new Error('Permission system is not supported on Solana');
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Remove permission from a contract
   * Note: Only supported on EVM chains
   */
  async removePermission(
    connectedWallet: Wallet,
    chainInfo: ChainInfo,
    contractAddress: string,
    options?: {
      gasOptions?: any;
    }
  ): Promise<UnifiedTransaction> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const result = await evmClient.removePermission(
        connectedWallet as EVMWallet,
        chainInfo,
        contractAddress,
        options?.gasOptions
      );

      return {
        hash: result.hash,
        chainType: ChainType.EVM
      };
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      throw new Error('Permission system is not supported on Solana');
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Check if permission exists for a contract/wallet pair
   * Note: Only supported on EVM chains
   */
  async hasPermission(
    chainInfo: ChainInfo,
    contractAddress: string,
    walletAddress: string,
    publicClient?: PublicClient
  ): Promise<boolean> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.hasPermission(
        chainInfo,
        contractAddress,
        walletAddress,
        publicClient
      );
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      // Solana doesn't have permission system, always return false
      return false;
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  // ============= Read Methods =============

  /**
   * Get the send fee for messages
   * @param chainInfo - Chain information with RPC endpoint
   * @param publicClient - Optional public client for EVM (will create if not provided)
   * @param connection - Optional connection for Solana (will create if not provided)
   * @returns Fee amount in USDC micro-units
   */
  async getSendFee(
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<bigint> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.getSendFee(chainInfo, publicClient);
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      return await solanaClient.getSendFee(chainInfo, connection);
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Get delegation fee
   */
  async getDelegationFee(
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<bigint> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.getDelegationFee(chainInfo, publicClient);
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      return await solanaClient.getDelegationFee(chainInfo, connection);
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Get delegation for an address
   * @param address - Address to check
   * @param chainInfo - Chain information with RPC endpoint
   * @param publicClient - Optional public client for EVM
   * @param connection - Optional connection for Solana
   * @returns Delegated address or null
   */
  async getDelegation(
    address: string,
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<string | null> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      const delegation = await evmClient.getDelegation(address, chainInfo, publicClient);
      return delegation === '0x0000000000000000000000000000000000000000' ? null : delegation;
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const delegation = await solanaClient.getDelegation(address, chainInfo, connection);
      return delegation ? delegation.toBase58() : null;
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Get recipient claimable info
   */
  async getRecipientClaimable(
    recipient: string,
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<{ amount: bigint; expiresAt: bigint; isExpired: boolean } | null> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.getRecipientClaimable(recipient, chainInfo, publicClient);
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const info = await solanaClient.getRecipientClaimable(recipient, chainInfo, connection);
      if (!info) return null;
      return {
        amount: BigInt(info.amount),
        expiresAt: BigInt(info.expiresAt),
        isExpired: info.isExpired
      };
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Get owner claimable amount
   */
  async getOwnerClaimable(
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<bigint> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.getOwnerClaimable(chainInfo, publicClient);
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const amount = await solanaClient.getOwnerClaimable(chainInfo, connection);
      return BigInt(amount);
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Get custom fee percentage
   */
  async getCustomFeePercentage(
    target: string,
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<number> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.getCustomFeePercentage(target, chainInfo, publicClient);
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      return await solanaClient.getCustomFeePercentage(target, chainInfo, connection);
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Check if contract/program is paused
   */
  async isPaused(
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<boolean> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.isPaused(chainInfo, publicClient);
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      return await solanaClient.isPaused(chainInfo, connection);
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Get contract/program owner
   */
  async getOwner(
    chainInfo: ChainInfo,
    publicClient?: PublicClient,
    connection?: Connection
  ): Promise<string> {
    if (chainInfo.chainType === ChainType.EVM) {
      const evmClient = await this.getEVMClient();
      return await evmClient.getOwner(chainInfo, publicClient);
    } else if (chainInfo.chainType === ChainType.SOLANA) {
      const solanaClient = await this.getSolanaClient();
      const owner = await solanaClient.getOwner(chainInfo, connection);
      return owner.toBase58();
    } else {
      throw new Error(`Unsupported chain type: ${chainInfo.chainType}`);
    }
  }

  /**
   * Register a domain (not implemented - for backward compatibility)
   */
  async registerDomain(_domain: string): Promise<DomainResult> {
    throw new Error('Domain registration not yet implemented');
  }
}

// Export wallet types for convenience
export type { EVMWallet, SolanaWallet, Wallet };
import {
  Address,
  Hash,
  PublicClient,
  WalletClient,
  getAddress,
  EstimateGasExecutionError,
} from 'viem';
import { ChainInfo } from '@sudobility/configs';
import { Mailer__factory } from '../../typechain-types/factories/Mailer__factory';

const MAILER_ABI = Mailer__factory.abi;
const MAILER_BYTECODE = Mailer__factory.bytecode as `0x${string}`;

/**
 * Normalize any Address-like input (string with checksum or lowercase) to checksum format.
 */
function normalizeAddress(value: Address | string): Address {
  return getAddress(value);
}

type RecipientClaim = {
  amount: bigint;
  expiresAt: bigint;
  isExpired: boolean;
};

/**
 * Gas estimation options for transactions
 */
export interface GasOptions {
  /**
   * Gas multiplier to apply to estimated gas (e.g., 1.2 for 20% buffer)
   * @default 1.2
   */
  gasMultiplier?: number;

  /**
   * Maximum gas limit to use (prevents excessive gas usage)
   */
  maxGasLimit?: bigint;

  /**
   * Skip gas estimation and use provided gas limit
   */
  gasLimit?: bigint;

  /**
   * Max fee per gas for EIP-1559 transactions
   */
  maxFeePerGas?: bigint;

  /**
   * Max priority fee per gas for EIP-1559 transactions
   */
  maxPriorityFeePerGas?: bigint;
}

/**
 * Transaction result with gas estimation details
 */
export interface TransactionResult {
  /**
   * Transaction hash
   */
  hash: Hash;

  /**
   * Estimated gas used
   */
  estimatedGas?: bigint;

  /**
   * Actual gas limit used
   */
  gasLimit?: bigint;

  /**
   * Gas actually used by transaction (from receipt)
   */
  gasUsed?: bigint;
}

/**
 * EVM Wallet interface
 */
export interface EVMWallet {
  walletClient: WalletClient;
  publicClient?: PublicClient;
}

/**
 * Stateless EVM Mailer client.
 * All methods take wallet and chainInfo as parameters.
 * No state is stored in the instance.
 */
export class EVMMailerClient {
  static readonly abi = MAILER_ABI;
  static readonly bytecode = MAILER_BYTECODE;

  private readonly defaultGasMultiplier = 1.2; // 20% buffer by default

  // Default gas limits for common operations to use as fallbacks
  private readonly defaultGasLimits = {
    send: BigInt(150000),
    sendPriority: BigInt(200000),
    sendPrepared: BigInt(120000),
    sendPriorityPrepared: BigInt(150000),
    claimRevenue: BigInt(100000),
    claimOwnerShare: BigInt(100000),
    delegateTo: BigInt(80000),
    setFee: BigInt(60000),
    setPermission: BigInt(60000),
    pause: BigInt(50000),
    unpause: BigInt(50000),
    deploy: BigInt(3000000),
  };

  /**
   * Ensure publicClient is provided
   */
  private ensurePublicClient(publicClient: PublicClient | undefined): PublicClient {
    if (!publicClient) {
      throw new Error('PublicClient is required for this operation. Please provide it in the EVMWallet.');
    }
    return publicClient;
  }

  /**
   * Switch chain if needed for EVM wallet
   */
  private async switchChainIfNeeded(
    walletClient: WalletClient,
    targetChainId: number
  ): Promise<void> {
    try {
      const currentChainId = walletClient.chain?.id;

      if (currentChainId && currentChainId !== targetChainId) {
        // Request chain switch
        await walletClient.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }]
        });
      }
    } catch (error) {
      console.warn('Chain switch failed or not supported:', error);
      // Continue anyway - the transaction might still work
    }
  }

  /**
   * Helper method to estimate gas for a transaction with optional buffer
   */
  private async estimateGasWithBuffer(
    estimateFn: () => Promise<bigint>,
    gasOptions?: GasOptions,
    fallbackGasLimit?: bigint
  ): Promise<bigint> {
    // If gas limit is explicitly provided, use it
    if (gasOptions?.gasLimit) {
      return gasOptions.gasLimit;
    }

    let estimatedGas: bigint;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        // Estimate gas for the transaction
        estimatedGas = await estimateFn();
        break; // Success, exit retry loop
      } catch (error) {
        retryCount++;

        // If we've exhausted retries, use fallback or throw
        if (retryCount > maxRetries) {
          if (fallbackGasLimit) {
            console.warn(`Gas estimation failed after ${maxRetries} retries, using fallback: ${fallbackGasLimit}`);
            estimatedGas = fallbackGasLimit;
          } else if (error instanceof EstimateGasExecutionError) {
            throw new Error(`Gas estimation failed: ${error.message}`);
          } else {
            throw error;
          }
        } else {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }

    // Apply multiplier for safety buffer
    const multiplier = gasOptions?.gasMultiplier ?? this.defaultGasMultiplier;
    const gasWithBuffer = BigInt(Math.ceil(Number(estimatedGas!) * multiplier));

    // Apply max gas limit if specified
    if (gasOptions?.maxGasLimit) {
      return gasWithBuffer > gasOptions.maxGasLimit ? gasOptions.maxGasLimit : gasWithBuffer;
    }

    return gasWithBuffer;
  }

  /**
   * Helper method to build transaction parameters with gas options
   */
  private buildTxParams(gasLimit: bigint, gasOptions?: GasOptions): {
    gas: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  } {
    const params: {
      gas: bigint;
      maxFeePerGas?: bigint;
      maxPriorityFeePerGas?: bigint;
    } = { gas: gasLimit };

    if (gasOptions?.maxFeePerGas) {
      params.maxFeePerGas = gasOptions.maxFeePerGas;
    }

    if (gasOptions?.maxPriorityFeePerGas) {
      params.maxPriorityFeePerGas = gasOptions.maxPriorityFeePerGas;
    }

    return params;
  }

  /**
   * Deploy a fresh Mailer contract instance
   */
  async deploy(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    ownerAddress: string | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC address configured for chain ${chainInfo.name}`);
    }

    // Switch chain if needed
    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);

    const [account] = await connectedWallet.walletClient.getAddresses();

    // For deployment, use a reasonable default gas
    const estimatedGas = BigInt(3000000);
    const multiplier = gasOptions?.gasMultiplier ?? 1.5;
    const gasLimit = gasOptions?.gasLimit ?? BigInt(Math.ceil(Number(estimatedGas) * multiplier));

    const hash = await connectedWallet.walletClient.deployContract({
      abi: MAILER_ABI,
      bytecode: MAILER_BYTECODE,
      args: [normalizeAddress(chainInfo.usdcAddress), normalizeAddress(ownerAddress)] as const,
      account,
      chain: connectedWallet.walletClient.chain,
      gas: gasLimit,
      ...(gasOptions?.maxFeePerGas && { maxFeePerGas: gasOptions.maxFeePerGas }),
      ...(gasOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: gasOptions.maxPriorityFeePerGas }),
    });

    return { hash, estimatedGas, gasLimit };
  }

  /**
   * Core message send with explicit payer control
   */
  async send(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    to: Address | string,
    subject: string,
    body: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    // Switch chain if needed
    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);

    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'send',
        args: [
          normalizeAddress(to),
          subject,
          body,
          normalizeAddress(payer),
          revenueShareToReceiver,
          resolveSenderToName,
        ],
        account,
      }),
      gasOptions,
      this.defaultGasLimits.send
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'send',
      args: [
        normalizeAddress(to),
        subject,
        body,
        normalizeAddress(payer),
        revenueShareToReceiver,
        resolveSenderToName,
      ],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Send a prepared message
   */
  async sendPrepared(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    to: Address | string,
    mailId: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'sendPrepared',
        args: [
          normalizeAddress(to),
          mailId,
          normalizeAddress(payer),
          revenueShareToReceiver,
          resolveSenderToName,
        ],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendPrepared',
      args: [
        normalizeAddress(to),
        mailId,
        normalizeAddress(payer),
        revenueShareToReceiver,
        resolveSenderToName,
      ],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Send through webhook
   */
  async sendThroughWebhook(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    to: Address | string,
    webhookId: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'sendThroughWebhook',
        args: [
          normalizeAddress(to),
          webhookId,
          normalizeAddress(payer),
          revenueShareToReceiver,
          resolveSenderToName,
        ],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendThroughWebhook',
      args: [
        normalizeAddress(to),
        webhookId,
        normalizeAddress(payer),
        revenueShareToReceiver,
        resolveSenderToName,
      ],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Send to email address
   */
  async sendToEmailAddress(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    toEmail: string,
    subject: string,
    body: string,
    payer: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'sendToEmailAddress',
        args: [toEmail, subject, body, normalizeAddress(payer)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendToEmailAddress',
      args: [toEmail, subject, body, normalizeAddress(payer)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Send prepared to email address
   */
  async sendPreparedToEmailAddress(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    toEmail: string,
    mailId: string,
    payer: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'sendPreparedToEmailAddress',
        args: [toEmail, mailId, normalizeAddress(payer)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendPreparedToEmailAddress',
      args: [toEmail, mailId, normalizeAddress(payer)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Get the current send fee
   */
  async getSendFee(chainInfo: ChainInfo, publicClient?: PublicClient): Promise<bigint> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    return await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendFee',
    });
  }

  /**
   * Set the send fee (owner only)
   */
  async setFee(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    usdcAmount: number | bigint,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'setFee',
        args: [BigInt(usdcAmount)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'setFee',
      args: [BigInt(usdcAmount)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Set fee paused state (owner only)
   */
  async setFeePaused(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    feePaused: boolean,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'setFeePaused',
        args: [feePaused],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'setFeePaused',
      args: [feePaused],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Get USDC token address
   */
  async getUsdcToken(chainInfo: ChainInfo, publicClient?: PublicClient): Promise<Address> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    return await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'usdcToken',
    });
  }

  /**
   * Get contract owner
   */
  async getOwner(chainInfo: ChainInfo, publicClient?: PublicClient): Promise<Address> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    return await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'owner',
    });
  }

  /**
   * Claim recipient share
   */
  async claimRecipientShare(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'claimRecipientShare',
        args: [],
        account,
      }),
      gasOptions,
      this.defaultGasLimits.claimRevenue
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimRecipientShare',
      args: [],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Claim owner share (owner only)
   */
  async claimOwnerShare(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'claimOwnerShare',
        args: [],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimOwnerShare',
      args: [],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Claim expired shares (owner only)
   */
  async claimExpiredShares(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    recipient: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'claimExpiredShares',
        args: [normalizeAddress(recipient)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimExpiredShares',
      args: [normalizeAddress(recipient)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Get recipient claimable info
   */
  async getRecipientClaimable(
    recipient: Address | string,
    chainInfo: ChainInfo,
    publicClient?: PublicClient
  ): Promise<RecipientClaim> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const result = await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'getRecipientClaimable',
      args: [normalizeAddress(recipient)],
    }) as readonly [bigint, bigint, boolean];

    return {
      amount: result[0],
      expiresAt: result[1],
      isExpired: result[2],
    };
  }

  /**
   * Get owner claimable amount
   */
  async getOwnerClaimable(chainInfo: ChainInfo, publicClient?: PublicClient): Promise<bigint> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    return await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'ownerClaimable',
    });
  }

  /**
   * Delegate to another address
   */
  async delegateTo(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    delegate: Address | string | null,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    console.log('=== EVMMailerClient.delegateTo - Entry ===');
    console.log('Parameter 1 - connectedWallet:', connectedWallet);
    console.log('Parameter 2 - chainInfo:', chainInfo);
    console.log('Parameter 3 - delegate:', delegate);
    console.log('Parameter 4 - gasOptions:', gasOptions);
    console.log('chainInfo object:', JSON.stringify(chainInfo, null, 2));
    console.log('chainInfo.name:', chainInfo?.name);
    console.log('chainInfo.mailerAddress:', chainInfo?.mailerAddress);
    console.log('typeof chainInfo:', typeof chainInfo);

    if (!chainInfo.mailerAddress) {
      const errorMsg = `No mailer contract deployed on ${chainInfo.name}`;
      console.error('=== EVMMailerClient.delegateTo - ERROR ===');
      console.error('Error message:', errorMsg);
      console.error('chainInfo was:', chainInfo);
      throw new Error(errorMsg);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const delegateAddress = delegate ? normalizeAddress(delegate) : '0x0000000000000000000000000000000000000000';

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'delegateTo',
        args: [delegateAddress],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'delegateTo',
      args: [delegateAddress],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Reject delegation
   */
  async rejectDelegation(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    delegatingAddress: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'rejectDelegation',
        args: [normalizeAddress(delegatingAddress)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'rejectDelegation',
      args: [normalizeAddress(delegatingAddress)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Get delegation fee
   */
  async getDelegationFee(chainInfo: ChainInfo, publicClient?: PublicClient): Promise<bigint> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    return await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'delegationFee',
    });
  }

  /**
   * Set delegation fee (owner only)
   */
  async setDelegationFee(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    usdcAmount: number | bigint,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'setDelegationFee',
        args: [BigInt(usdcAmount)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'setDelegationFee',
      args: [BigInt(usdcAmount)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Set custom fee percentage
   */
  async setCustomFeePercentage(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    account: Address | string,
    percentage: number,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    if (percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [senderAccount] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'setCustomFeePercentage',
        args: [normalizeAddress(account), BigInt(percentage)],
        account: senderAccount,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'setCustomFeePercentage',
      args: [normalizeAddress(account), BigInt(percentage)],
      account: senderAccount,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Clear custom fee percentage
   */
  async clearCustomFeePercentage(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    account: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [senderAccount] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'clearCustomFeePercentage',
        args: [normalizeAddress(account)],
        account: senderAccount,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'clearCustomFeePercentage',
      args: [normalizeAddress(account)],
      account: senderAccount,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Get custom fee percentage
   */
  async getCustomFeePercentage(
    chainInfo: ChainInfo,
    account: Address | string,
    publicClient?: PublicClient
  ): Promise<number> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const result = await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'getCustomFeePercentage',
      args: [normalizeAddress(account)],
    });

    return Number(result);
  }

  /**
   * Set permission for a contract to use caller's USDC for sending messages
   */
  async setPermission(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    contractAddress: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const mailerAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: mailerAddress,
        abi: MAILER_ABI,
        functionName: 'setPermission',
        args: [normalizeAddress(contractAddress)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: mailerAddress,
      abi: MAILER_ABI,
      functionName: 'setPermission',
      args: [normalizeAddress(contractAddress)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Remove permission
   */
  async removePermission(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    contractAddress: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const mailerAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: mailerAddress,
        abi: MAILER_ABI,
        functionName: 'removePermission',
        args: [normalizeAddress(contractAddress)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: mailerAddress,
      abi: MAILER_ABI,
      functionName: 'removePermission',
      args: [normalizeAddress(contractAddress)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Check if permission exists
   */
  async hasPermission(
    contractAddress: Address | string,
    wallet: Address | string,
    chainInfo: ChainInfo,
    publicClient?: PublicClient
  ): Promise<boolean> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const mailerAddress = normalizeAddress(chainInfo.mailerAddress);

    return await client.readContract({
      address: mailerAddress,
      abi: MAILER_ABI,
      functionName: 'permissions',
      args: [normalizeAddress(contractAddress), normalizeAddress(wallet)],
    });
  }

  /**
   * Pause the contract (owner only)
   */
  async pause(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'pause',
        args: [],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'pause',
      args: [],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Unpause the contract (owner only)
   */
  async unpause(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'unpause',
        args: [],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'unpause',
      args: [],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Emergency unpause (owner only)
   */
  async emergencyUnpause(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'emergencyUnpause',
        args: [],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'emergencyUnpause',
      args: [],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  /**
   * Check if contract is paused
   */
  async isPaused(chainInfo: ChainInfo, publicClient?: PublicClient): Promise<boolean> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    const client = this.ensurePublicClient(publicClient);
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    return await client.readContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'paused',
    });
  }

  /**
   * Distribute claimable funds when paused (anyone can call)
   */
  async distributeClaimableFunds(
    connectedWallet: EVMWallet,
    chainInfo: ChainInfo,
    recipient: Address | string,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer contract deployed on ${chainInfo.name}`);
    }

    await this.switchChainIfNeeded(connectedWallet.walletClient, chainInfo.chainId);
    const publicClient = this.ensurePublicClient(connectedWallet.publicClient);
    const [account] = await connectedWallet.walletClient.getAddresses();
    const contractAddress = normalizeAddress(chainInfo.mailerAddress);

    const gasLimit = await this.estimateGasWithBuffer(
      () => publicClient.estimateContractGas({
        address: contractAddress,
        abi: MAILER_ABI,
        functionName: 'distributeClaimableFunds',
        args: [normalizeAddress(recipient)],
        account,
      }),
      gasOptions
    );

    const hash = await connectedWallet.walletClient.writeContract({
      address: contractAddress,
      abi: MAILER_ABI,
      functionName: 'distributeClaimableFunds',
      args: [normalizeAddress(recipient)],
      account,
      chain: connectedWallet.walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

}

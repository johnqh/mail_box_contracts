import {
  Account,
  Address,
  Hash,
  PublicClient,
  WalletClient,
  getAddress,
  EstimateGasExecutionError,
} from 'viem';
import { Mailer__factory } from '../../typechain-types/factories/Mailer__factory.js';

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
}

/**
 * High-level client for interacting with the EVM Mailer contract.
 * Exposes every callable contract function with type-safe wrappers.
 * Includes automatic gas estimation with configurable buffer for all transactions.
 */
export class MailerClient {
  static readonly abi = MAILER_ABI;
  static readonly bytecode = MAILER_BYTECODE;

  private readonly contractAddress: Address;
  private readonly publicClient: PublicClient;
  private readonly defaultGasMultiplier = 1.2; // 20% buffer by default

  constructor(contractAddress: string | Address, publicClient: PublicClient) {
    this.contractAddress = normalizeAddress(contractAddress);
    this.publicClient = publicClient;
  }

  /**
   * Helper method to estimate gas for a transaction with optional buffer
   */
  private async estimateGasWithBuffer(
    estimateFn: () => Promise<bigint>,
    gasOptions?: GasOptions
  ): Promise<bigint> {
    // If gas limit is explicitly provided, use it
    if (gasOptions?.gasLimit) {
      return gasOptions.gasLimit;
    }

    try {
      // Estimate gas for the transaction
      const estimatedGas = await estimateFn();

      // Apply multiplier for safety buffer
      const multiplier = gasOptions?.gasMultiplier ?? this.defaultGasMultiplier;
      const gasWithBuffer = BigInt(Math.ceil(Number(estimatedGas) * multiplier));

      // Apply max gas limit if specified
      if (gasOptions?.maxGasLimit) {
        return gasWithBuffer > gasOptions.maxGasLimit ? gasOptions.maxGasLimit : gasWithBuffer;
      }

      return gasWithBuffer;
    } catch (error) {
      // If estimation fails, throw with helpful message
      if (error instanceof EstimateGasExecutionError) {
        throw new Error(`Gas estimation failed: ${error.message}`);
      }
      throw error;
    }
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
   * Deploy a fresh Mailer contract instance with gas estimation.
   */
  static async deploy(
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account | Address,
    usdcTokenAddress: string | Address,
    ownerAddress: string | Address,
    gasOptions?: GasOptions
  ): Promise<{ client: MailerClient; result: TransactionResult }> {
    // For deployment, we need to estimate gas differently
    // Use a reasonable default for deployment gas
    const estimatedGas = BigInt(3000000); // Default deployment gas

    // Apply gas buffer
    const multiplier = gasOptions?.gasMultiplier ?? 1.5; // Higher multiplier for deployment
    const gasLimit = gasOptions?.gasLimit ?? BigInt(Math.ceil(Number(estimatedGas) * multiplier));

    // Deploy with estimated gas
    const hash = await walletClient.deployContract({
      abi: MAILER_ABI,
      bytecode: MAILER_BYTECODE,
      args: [normalizeAddress(usdcTokenAddress), normalizeAddress(ownerAddress)] as const,
      account,
      chain: walletClient.chain,
      gas: gasLimit,
      ...(gasOptions?.maxFeePerGas && { maxFeePerGas: gasOptions.maxFeePerGas }),
      ...(gasOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: gasOptions.maxPriorityFeePerGas }),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) {
      throw new Error('Contract deployment failed');
    }

    return {
      client: new MailerClient(receipt.contractAddress, publicClient),
      result: { hash, estimatedGas, gasLimit }
    };
  }

  getAddress(): Address {
    return this.contractAddress;
  }

  /**
   * Core message send with explicit payer control and gas estimation.
   */
  async send(
    to: Address | string,
    subject: string,
    body: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
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
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
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
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async sendPrepared(
    to: Address | string,
    mailId: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
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

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
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
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async sendThroughWebhook(
    to: Address | string,
    webhookId: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
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

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
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
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async sendToEmailAddress(
    toEmail: string,
    subject: string,
    body: string,
    payer: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'sendToEmailAddress',
        args: [toEmail, subject, body, normalizeAddress(payer)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendToEmailAddress',
      args: [toEmail, subject, body, normalizeAddress(payer)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async sendPreparedToEmailAddress(
    toEmail: string,
    mailId: string,
    payer: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'sendPreparedToEmailAddress',
        args: [toEmail, mailId, normalizeAddress(payer)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendPreparedToEmailAddress',
      args: [toEmail, mailId, normalizeAddress(payer)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async getFee(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getFee',
    })) as bigint;
  }

  async getSendFee(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendFee',
    })) as bigint;
  }

  async setFee(
    newFee: bigint,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'setFee',
        args: [newFee],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setFee',
      args: [newFee],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async getUsdcToken(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'usdcToken',
    })) as Address;
  }

  async getOwner(): Promise<Address> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'owner',
    })) as Address;
  }

  async claimRecipientShare(
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'claimRecipientShare',
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimRecipientShare',
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async claimOwnerShare(
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'claimOwnerShare',
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimOwnerShare',
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async claimExpiredShares(
    recipient: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'claimExpiredShares',
        args: [normalizeAddress(recipient)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimExpiredShares',
      args: [normalizeAddress(recipient)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async getRecipientClaimable(recipient: Address | string): Promise<RecipientClaim> {
    const [amount, expiresAt, isExpired] = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getRecipientClaimable',
      args: [normalizeAddress(recipient)],
    })) as [bigint, bigint, boolean];

    return { amount, expiresAt, isExpired };
  }

  async getOwnerClaimable(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getOwnerClaimable',
    })) as bigint;
  }

  async delegateTo(
    delegate: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'delegateTo',
        args: [normalizeAddress(delegate)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'delegateTo',
      args: [normalizeAddress(delegate)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async rejectDelegation(
    delegatingAddress: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'rejectDelegation',
        args: [normalizeAddress(delegatingAddress)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'rejectDelegation',
      args: [normalizeAddress(delegatingAddress)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async getDelegationFee(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getDelegationFee',
    })) as bigint;
  }

  async setDelegationFee(
    newFee: bigint,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'setDelegationFee',
        args: [newFee],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setDelegationFee',
      args: [newFee],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async setCustomFeePercentage(
    target: Address | string,
    percentage: number,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'setCustomFeePercentage',
        args: [normalizeAddress(target), BigInt(percentage)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setCustomFeePercentage',
      args: [normalizeAddress(target), BigInt(percentage)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async clearCustomFeePercentage(
    target: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'clearCustomFeePercentage',
        args: [normalizeAddress(target)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'clearCustomFeePercentage',
      args: [normalizeAddress(target)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async getCustomFeePercentage(target: Address | string): Promise<number> {
    const percentage = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getCustomFeePercentage',
      args: [normalizeAddress(target)],
    })) as bigint;
    return Number(percentage);
  }

  async getCustomFeeDiscount(target: Address | string): Promise<number> {
    const discount = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'customFeeDiscount',
      args: [normalizeAddress(target)],
    })) as bigint;
    return Number(discount);
  }

  async setPermission(
    contractAddress: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'setPermission',
        args: [normalizeAddress(contractAddress)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setPermission',
      args: [normalizeAddress(contractAddress)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async removePermission(
    contractAddress: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'removePermission',
        args: [normalizeAddress(contractAddress)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'removePermission',
      args: [normalizeAddress(contractAddress)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async hasPermission(contractAddress: Address | string, wallet: Address | string): Promise<boolean> {
    const permitted = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'permissions',
      args: [normalizeAddress(contractAddress), normalizeAddress(wallet)],
    })) as boolean;
    return permitted;
  }

  async pause(
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'pause',
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'pause',
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async unpause(
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'unpause',
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'unpause',
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async emergencyUnpause(
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'emergencyUnpause',
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'emergencyUnpause',
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }

  async isPaused(): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'isPaused',
    })) as boolean;
  }

  async distributeClaimableFunds(
    recipient: Address | string,
    walletClient: WalletClient,
    account: Account | Address,
    gasOptions?: GasOptions
  ): Promise<TransactionResult> {
    // Estimate gas for the transaction
    const gasLimit = await this.estimateGasWithBuffer(
      () => this.publicClient.estimateContractGas({
        address: this.contractAddress,
        abi: MAILER_ABI,
        functionName: 'distributeClaimableFunds',
        args: [normalizeAddress(recipient)],
        account,
      }),
      gasOptions
    );

    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'distributeClaimableFunds',
      args: [normalizeAddress(recipient)],
      account,
      chain: walletClient.chain,
      ...this.buildTxParams(gasLimit, gasOptions),
    });

    return { hash, estimatedGas: gasLimit, gasLimit };
  }
}

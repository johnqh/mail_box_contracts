import {
  Account,
  Address,
  Hash,
  PublicClient,
  WalletClient,
  getAddress,
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
 * High-level client for interacting with the EVM Mailer contract.
 * Exposes every callable contract function with type-safe wrappers.
 */
export class MailerClient {
  static readonly abi = MAILER_ABI;
  static readonly bytecode = MAILER_BYTECODE;

  private readonly contractAddress: Address;
  private readonly publicClient: PublicClient;

  constructor(contractAddress: string | Address, publicClient: PublicClient) {
    this.contractAddress = normalizeAddress(contractAddress);
    this.publicClient = publicClient;
  }

  /**
   * Deploy a fresh Mailer contract instance.
   */
  static async deploy(
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account | Address,
    usdcTokenAddress: string | Address,
    ownerAddress: string | Address
  ): Promise<MailerClient> {
    const hash = await walletClient.deployContract({
      abi: MAILER_ABI,
      bytecode: MAILER_BYTECODE,
      args: [normalizeAddress(usdcTokenAddress), normalizeAddress(ownerAddress)],
      account,
      chain: walletClient.chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) {
      throw new Error('Contract deployment failed');
    }

    return new MailerClient(receipt.contractAddress, publicClient);
  }

  getAddress(): Address {
    return this.contractAddress;
  }

  /**
   * Core message send with explicit payer control.
   */
  async send(
    to: Address | string,
    subject: string,
    body: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
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
    });
  }

  async sendPrepared(
    to: Address | string,
    mailId: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
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
    });
  }

  async sendThroughWebhook(
    to: Address | string,
    webhookId: string,
    payer: Address | string,
    revenueShareToReceiver: boolean,
    resolveSenderToName: boolean,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
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
    });
  }

  async sendToEmailAddress(
    toEmail: string,
    subject: string,
    body: string,
    payer: Address | string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendToEmailAddress',
      args: [toEmail, subject, body, normalizeAddress(payer)],
      account,
      chain: walletClient.chain,
    });
  }

  async sendPreparedToEmailAddress(
    toEmail: string,
    mailId: string,
    payer: Address | string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendPreparedToEmailAddress',
      args: [toEmail, mailId, normalizeAddress(payer)],
      account,
      chain: walletClient.chain,
    });
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
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setFee',
      args: [newFee],
      account,
      chain: walletClient.chain,
    });
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
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimRecipientShare',
      account,
      chain: walletClient.chain,
    });
  }

  async claimOwnerShare(
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimOwnerShare',
      account,
      chain: walletClient.chain,
    });
  }

  async claimExpiredShares(
    recipient: Address | string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimExpiredShares',
      args: [normalizeAddress(recipient)],
      account,
      chain: walletClient.chain,
    });
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
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'delegateTo',
      args: [normalizeAddress(delegate)],
      account,
      chain: walletClient.chain,
    });
  }

  async rejectDelegation(
    delegatingAddress: Address | string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'rejectDelegation',
      args: [normalizeAddress(delegatingAddress)],
      account,
      chain: walletClient.chain,
    });
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
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setDelegationFee',
      args: [newFee],
      account,
      chain: walletClient.chain,
    });
  }

  async setCustomFeePercentage(
    target: Address | string,
    percentage: number,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setCustomFeePercentage',
      args: [normalizeAddress(target), BigInt(percentage)],
      account,
      chain: walletClient.chain,
    });
  }

  async clearCustomFeePercentage(
    target: Address | string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'clearCustomFeePercentage',
      args: [normalizeAddress(target)],
      account,
      chain: walletClient.chain,
    });
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
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setPermission',
      args: [normalizeAddress(contractAddress)],
      account,
      chain: walletClient.chain,
    });
  }

  async removePermission(
    contractAddress: Address | string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'removePermission',
      args: [normalizeAddress(contractAddress)],
      account,
      chain: walletClient.chain,
    });
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
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'pause',
      account,
      chain: walletClient.chain,
    });
  }

  async unpause(
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'unpause',
      account,
      chain: walletClient.chain,
    });
  }

  async emergencyUnpause(
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'emergencyUnpause',
      account,
      chain: walletClient.chain,
    });
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
    account: Account | Address
  ): Promise<Hash> {
    return walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'distributeClaimableFunds',
      args: [normalizeAddress(recipient)],
      account,
      chain: walletClient.chain,
    });
  }
}

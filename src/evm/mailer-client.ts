import { 
  Account,
  Address,
  Chain,
  Client,
  Hash,
  PublicClient,
  Transport,
  WalletClient,
  getContract,
  getAddress,
  parseUnits,
  formatUnits,
  decodeEventLog,
  encodeDeployData,
  encodeFunctionData,
  decodeFunctionResult
} from "viem";
import { 
  Mailer__factory
} from "../../typechain-types";

// Get ABI from typechain-generated factories
const MAILER_ABI = Mailer__factory.abi;

// Get bytecode from typechain-generated factories
const MAILER_BYTECODE = Mailer__factory.bytecode as `0x${string}`;

/**
 * @class MailerClient
 * @description High-level TypeScript client for the Mailer contract using viem
 * @notice Provides easy-to-use methods for sending messages with USDC fees and revenue sharing
 * 
 * ## Key Features:
 * - **Delegation Management**: Delegate mail handling with rejection capability
 * - **Priority Messages**: Full fee (0.1 USDC) with 90% revenue share back to sender
 * - **Standard Messages**: 10% fee only (0.01 USDC) with no revenue share
 * - **Revenue Claims**: 60-day claim period for priority message revenue shares
 * 
 * ## Usage Examples:
 * ```typescript
 * // Connect to existing contract
 * import { createPublicClient, createWalletClient, http } from 'viem';
 * import { mainnet } from 'viem/chains';
 * 
 * const publicClient = createPublicClient({
 *   chain: mainnet,
 *   transport: http()
 * });
 * 
 * const mailer = new MailerClient('CONTRACT_ADDRESS', publicClient);
 * 
 * // Send priority message (with revenue sharing)
 * const walletClient = createWalletClient({
 *   chain: mainnet,
 *   transport: http()
 * });
 * 
 * await mailer.sendPriority('Subject', 'Body', walletClient, account);
 * 
 * // Claim your revenue share
 * await mailer.claimRecipientShare(walletClient, account);
 * ```
 */
export class MailerClient {
  private contractAddress: Address;
  private publicClient: PublicClient;

  /**
   * @description Creates a new MailerClient instance
   * @param contractAddress The deployed Mailer contract address
   * @param publicClient Viem public client for reading blockchain state
   */
  constructor(contractAddress: string, publicClient: PublicClient) {
    this.contractAddress = getAddress(contractAddress);
    this.publicClient = publicClient;
  }

  /**
   * @description Deploy a new Mailer contract and return a client instance
   * @param walletClient Viem wallet client with deployment permissions
   * @param account Account to deploy from
   * @param usdcTokenAddress Address of the USDC token contract
   * @param ownerAddress Address that will own the deployed contract
   * @returns Promise resolving to a MailerClient instance
   */
  static async deploy(
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account | Address,
    usdcTokenAddress: string,
    ownerAddress: string
  ): Promise<MailerClient> {
    const hash = await walletClient.deployContract({
      abi: MAILER_ABI,
      bytecode: MAILER_BYTECODE,
      args: [getAddress(usdcTokenAddress), getAddress(ownerAddress)],
      account,
      chain: walletClient.chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (!receipt.contractAddress) {
      throw new Error("Contract deployment failed");
    }

    return new MailerClient(receipt.contractAddress, publicClient);
  }

  /**
   * @description Send a priority message with full fee and 90% revenue share
   * @notice Sender pays 0.1 USDC, gets 90% back as claimable revenue within 60 days
   * @param to Recipient address
   * @param subject Message subject line
   * @param body Message content
   * @param walletClient Viem wallet client for transaction
   * @param account Account to send from
   * @returns Promise resolving to transaction hash
   * @example
   * ```typescript
   * const hash = await mailer.sendPriority('0x...', 'Hello', 'This is a priority message', walletClient, account);
   * await publicClient.waitForTransactionReceipt({ hash });
   * ```
   */
  async sendPriority(
    to: Address,
    subject: string,
    body: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendPriority',
      args: [to, subject, body],
      account,
      chain: walletClient.chain,
    });
  }

  /**
   * @description Send a priority message using a pre-prepared mail ID
   * @notice Sender pays 0.1 USDC, gets 90% back as claimable revenue within 60 days
   * @param to Recipient address
   * @param mailId Pre-prepared message identifier
   * @param walletClient Viem wallet client for transaction
   * @param account Account to send from
   * @returns Promise resolving to transaction hash
   */
  async sendPriorityPrepared(
    to: Address,
    mailId: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendPriorityPrepared',
      args: [to, mailId],
      account,
      chain: walletClient.chain,
    });
  }

  /**
   * @description Send a standard message with 10% fee only (no revenue share)
   * @notice Sender pays 0.01 USDC with no revenue share back
   * @param to Recipient address
   * @param subject Message subject line
   * @param body Message content
   * @param walletClient Viem wallet client for transaction
   * @param account Account to send from
   * @returns Promise resolving to transaction hash
   * @example
   * ```typescript
   * const hash = await mailer.send('0x...', 'Subject', 'Standard message', walletClient, account);
   * await publicClient.waitForTransactionReceipt({ hash });
   * ```
   */
  async send(
    to: Address,
    subject: string,
    body: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'send',
      args: [to, subject, body],
      account,
      chain: walletClient.chain,
    });
  }

  /**
   * @description Send a standard message using a pre-prepared mail ID
   * @notice Sender pays 0.01 USDC with no revenue share back
   * @param to Recipient address
   * @param mailId Pre-prepared message identifier
   * @param walletClient Viem wallet client for transaction
   * @param account Account to send from
   * @returns Promise resolving to transaction hash
   */
  async sendPrepared(
    to: Address,
    mailId: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendPrepared',
      args: [to, mailId],
      account,
      chain: walletClient.chain,
    });
  }

  async getSendFee(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'sendFee',
    }) as bigint;
  }

  async getUsdcToken(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'usdcToken',
    }) as Address;
  }

  getAddress(): Address {
    return this.contractAddress;
  }

  async claimRecipientShare(
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
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
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimOwnerShare',
      account,
      chain: walletClient.chain,
    });
  }

  async claimExpiredShares(
    recipient: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'claimExpiredShares',
      args: [getAddress(recipient)],
      account,
      chain: walletClient.chain,
    });
  }

  async getRecipientClaimable(recipient: string): Promise<{amount: bigint, expiresAt: bigint, isExpired: boolean}> {
    const result = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getRecipientClaimable',
      args: [getAddress(recipient)],
    }) as [bigint, bigint, boolean];
    
    return {
      amount: result[0],
      expiresAt: result[1], 
      isExpired: result[2]
    };
  }

  async getOwnerClaimable(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getOwnerClaimable',
    }) as bigint;
  }

  // Delegation functionality

  /**
   * Delegate mail handling to another address
   * @param delegate Address to delegate to (or 0x0 to clear delegation)
   * @param walletClient Connected wallet client
   * @param account Account to send transaction from
   * @returns Transaction hash
   */
  async delegateTo(
    delegate: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'delegateTo',
      args: [getAddress(delegate)],
      account,
      chain: walletClient.chain,
    });
  }

  /**
   * Reject a delegation made to you by another address
   * @param delegatingAddress Address that delegated to you
   * @param walletClient Connected wallet client
   * @param account Account to send transaction from
   * @returns Transaction hash
   */
  async rejectDelegation(
    delegatingAddress: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'rejectDelegation',
      args: [getAddress(delegatingAddress)],
      account,
      chain: walletClient.chain,
    });
  }

  /**
   * Get current delegation fee in USDC (6 decimals)
   * @returns Delegation fee amount
   */
  async getDelegationFee(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'getDelegationFee',
    }) as bigint;
  }

  /**
   * Update delegation fee (owner only)
   * @param newFee New fee amount in USDC (6 decimals) 
   * @param walletClient Connected wallet client
   * @param account Account to send transaction from
   * @returns Transaction hash
   */
  async setDelegationFee(
    newFee: bigint,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILER_ABI,
      functionName: 'setDelegationFee',
      args: [newFee],
      account,
      chain: walletClient.chain,
    });
  }
}

export class MailBoxClient {
  public mailer: MailerClient;

  constructor(
    mailerAddress: string,
    publicClient: PublicClient
  ) {
    this.mailer = new MailerClient(mailerAddress, publicClient);
  }

  static async deploy(
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account | Address,
    usdcTokenAddress: string,
    ownerAddress: string
  ): Promise<MailBoxClient> {
    const mailerClient = await MailerClient.deploy(walletClient, publicClient, account, usdcTokenAddress, ownerAddress);
    
    return new MailBoxClient(
      mailerClient.getAddress(),
      publicClient
    );
  }
}

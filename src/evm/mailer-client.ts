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
  Mailer__factory, 
  MailService__factory, 
  MailBoxFactory__factory 
} from "../../typechain-types";

// Get ABI from typechain-generated factories
const MAILER_ABI = Mailer__factory.abi;
const MAIL_SERVICE_ABI = MailService__factory.abi;
const MAILBOX_FACTORY_ABI = MailBoxFactory__factory.abi;

// Get bytecode from typechain-generated factories
const MAILER_BYTECODE = Mailer__factory.bytecode as `0x${string}`;
const MAIL_SERVICE_BYTECODE = MailService__factory.bytecode as `0x${string}`;
const MAILBOX_FACTORY_BYTECODE = MailBoxFactory__factory.bytecode as `0x${string}`;

/**
 * @class MailerClient
 * @description High-level TypeScript client for the Mailer contract using viem
 * @notice Provides easy-to-use methods for sending messages with USDC fees and revenue sharing
 * 
 * ## Key Features:
 * - **Priority Messages**: Full fee (0.1 USDC) with 90% revenue share back to sender
 * - **Standard Messages**: 10% fee only (0.01 USDC) with no revenue share
 * - **Revenue Claims**: 60-day claim period for priority message revenue shares
 * - **Self-messaging**: All messages are sent to the sender's own address
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
}

export class MailServiceClient {
  private contractAddress: Address;
  private publicClient: PublicClient;

  constructor(contractAddress: string, publicClient: PublicClient) {
    this.contractAddress = getAddress(contractAddress);
    this.publicClient = publicClient;
  }

  static async deploy(
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account | Address,
    usdcTokenAddress: string,
    ownerAddress: string
  ): Promise<MailServiceClient> {
    const hash = await walletClient.deployContract({
      abi: MAIL_SERVICE_ABI,
      bytecode: MAIL_SERVICE_BYTECODE,
      args: [getAddress(usdcTokenAddress), getAddress(ownerAddress)],
      account,
      chain: walletClient.chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (!receipt.contractAddress) {
      throw new Error("Contract deployment failed");
    }

    return new MailServiceClient(receipt.contractAddress, publicClient);
  }

  async delegateTo(
    delegate: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAIL_SERVICE_ABI,
      functionName: 'delegateTo',
      args: [getAddress(delegate)],
      account,
      chain: walletClient.chain,
    });
  }

  async rejectDelegation(
    delegatingAddress: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Hash> {
    return await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAIL_SERVICE_ABI,
      functionName: 'rejectDelegation',
      args: [getAddress(delegatingAddress)],
      account,
      chain: walletClient.chain,
    });
  }

  async getDelegationFee(): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAIL_SERVICE_ABI,
      functionName: 'delegationFee',
    }) as bigint;
  }

  async getUsdcToken(): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAIL_SERVICE_ABI,
      functionName: 'usdcToken',
    }) as Address;
  }

  getAddress(): Address {
    return this.contractAddress;
  }
}

export class MailBoxClient {
  public mailer: MailerClient;
  public mailService: MailServiceClient;

  constructor(
    mailerAddress: string,
    mailServiceAddress: string,
    publicClient: PublicClient
  ) {
    this.mailer = new MailerClient(mailerAddress, publicClient);
    this.mailService = new MailServiceClient(mailServiceAddress, publicClient);
  }

  static async deployBoth(
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account | Address,
    usdcTokenAddress: string,
    ownerAddress: string
  ): Promise<MailBoxClient> {
    const mailerClient = await MailerClient.deploy(walletClient, publicClient, account, usdcTokenAddress, ownerAddress);
    const mailServiceClient = await MailServiceClient.deploy(walletClient, publicClient, account, usdcTokenAddress, ownerAddress);
    
    return new MailBoxClient(
      mailerClient.getAddress(),
      mailServiceClient.getAddress(),
      publicClient
    );
  }
}

/**
 * @class MailBoxFactoryClient
 * @description High-level TypeScript client for the MailBoxFactory contract using viem
 * @notice Provides easy-to-use methods for CREATE2 deterministic deployment
 * 
 * ## Key Features:
 * - **CREATE2 Deployment**: Deploy contracts with identical addresses across chains
 * - **Address Prediction**: Predict addresses before deployment
 * - **Salt Generation**: Generate deterministic salts for reproducible deployments
 * - **Batch Deployment**: Deploy both contracts in single transaction
 * 
 * ## Usage Examples:
 * ```typescript
 * // Deploy factory
 * const factory = await MailBoxFactoryClient.deploy(walletClient, account);
 * 
 * // Predict addresses
 * const salt = await factory.generateSalt("MailBox", "1.0.0", "Mailer");
 * const address = await factory.predictMailerAddress(usdcAddress, ownerAddress, salt);
 * 
 * // Deploy contracts
 * const mailerAddress = await factory.deployMailer(usdcAddress, ownerAddress, salt, walletClient, account);
 * ```
 */
export class MailBoxFactoryClient {
  private contractAddress: Address;
  private publicClient: PublicClient;

  /**
   * @description Creates a new MailBoxFactoryClient instance
   * @param contractAddress The deployed MailBoxFactory contract address
   * @param publicClient Viem public client for reading blockchain state
   */
  constructor(contractAddress: string, publicClient: PublicClient) {
    this.contractAddress = getAddress(contractAddress);
    this.publicClient = publicClient;
  }

  /**
   * @description Deploy a new MailBoxFactory contract and return a client instance
   * @param walletClient Viem wallet client with deployment permissions
   * @param account Account to deploy from
   * @returns Promise resolving to a MailBoxFactoryClient instance
   */
  static async deploy(
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account | Address
  ): Promise<MailBoxFactoryClient> {
    const hash = await walletClient.deployContract({
      abi: MAILBOX_FACTORY_ABI,
      bytecode: MAILBOX_FACTORY_BYTECODE,
      account,
      chain: walletClient.chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (!receipt.contractAddress) {
      throw new Error("Contract deployment failed");
    }

    return new MailBoxFactoryClient(receipt.contractAddress, publicClient);
  }

  /**
   * @description Deploy a Mailer contract using CREATE2
   * @param usdcToken Address of the USDC token contract
   * @param owner Address that will own the deployed contract
   * @param salt Salt value for deterministic deployment
   * @param walletClient Viem wallet client for transaction
   * @param account Account to deploy from
   * @returns Promise resolving to deployed Mailer address
   */
  async deployMailer(
    usdcToken: string,
    owner: string,
    salt: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Address> {
    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILBOX_FACTORY_ABI,
      functionName: 'deployMailer',
      args: [getAddress(usdcToken), getAddress(owner), salt as `0x${string}`],
      account,
      chain: walletClient.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    
    // Find the MailerDeployed event in the logs
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: MAILBOX_FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        });
        
        if (decoded.eventName === 'MailerDeployed') {
          return (decoded.args as any).mailer;
        }
      } catch {
        // Continue if this log is not the event we're looking for
      }
    }
    
    throw new Error("MailerDeployed event not found");
  }

  /**
   * @description Deploy a MailService contract using CREATE2
   * @param usdcToken Address of the USDC token contract
   * @param owner Address that will own the deployed contract
   * @param salt Salt value for deterministic deployment
   * @param walletClient Viem wallet client for transaction
   * @param account Account to deploy from
   * @returns Promise resolving to deployed MailService address
   */
  async deployMailService(
    usdcToken: string,
    owner: string,
    salt: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<Address> {
    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILBOX_FACTORY_ABI,
      functionName: 'deployMailService',
      args: [getAddress(usdcToken), getAddress(owner), salt as `0x${string}`],
      account,
      chain: walletClient.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    
    // Find the MailServiceDeployed event in the logs
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: MAILBOX_FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        });
        
        if (decoded.eventName === 'MailServiceDeployed') {
          return (decoded.args as any).mailService;
        }
      } catch {
        // Continue if this log is not the event we're looking for
      }
    }
    
    throw new Error("MailServiceDeployed event not found");
  }

  /**
   * @description Deploy both Mailer and MailService contracts in single transaction
   * @param usdcToken Address of the USDC token contract
   * @param owner Address that will own both contracts
   * @param mailerSalt Salt for Mailer deployment
   * @param mailServiceSalt Salt for MailService deployment
   * @param walletClient Viem wallet client for transaction
   * @param account Account to deploy from
   * @returns Promise resolving to both deployed addresses
   */
  async deployBoth(
    usdcToken: string,
    owner: string,
    mailerSalt: string,
    mailServiceSalt: string,
    walletClient: WalletClient,
    account: Account | Address
  ): Promise<{ mailer: Address; mailService: Address }> {
    const hash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: MAILBOX_FACTORY_ABI,
      functionName: 'deployBoth',
      args: [
        getAddress(usdcToken), 
        getAddress(owner), 
        mailerSalt as `0x${string}`, 
        mailServiceSalt as `0x${string}`
      ],
      account,
      chain: walletClient.chain,
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    let mailerAddress: Address | undefined;
    let mailServiceAddress: Address | undefined;

    // Find events in the logs
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: MAILBOX_FACTORY_ABI,
          data: log.data,
          topics: log.topics,
        });
        
        if (decoded.eventName === 'MailerDeployed') {
          mailerAddress = (decoded.args as any).mailer;
        } else if (decoded.eventName === 'MailServiceDeployed') {
          mailServiceAddress = (decoded.args as any).mailService;
        }
      } catch {
        // Continue if this log is not the event we're looking for
      }
    }

    if (!mailerAddress || !mailServiceAddress) {
      throw new Error("Deployment events not found");
    }

    return {
      mailer: mailerAddress,
      mailService: mailServiceAddress
    };
  }

  /**
   * @description Predict the address of a Mailer contract before deployment
   * @param usdcToken Address of the USDC token contract
   * @param owner Address that will own the contract
   * @param salt Salt value for deterministic deployment
   * @returns Promise resolving to predicted address
   */
  async predictMailerAddress(usdcToken: string, owner: string, salt: string): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILBOX_FACTORY_ABI,
      functionName: 'predictMailerAddress',
      args: [getAddress(usdcToken), getAddress(owner), salt as `0x${string}`],
    }) as Address;
  }

  /**
   * @description Predict the address of a MailService contract before deployment
   * @param usdcToken Address of the USDC token contract
   * @param owner Address that will own the contract
   * @param salt Salt value for deterministic deployment
   * @returns Promise resolving to predicted address
   */
  async predictMailServiceAddress(usdcToken: string, owner: string, salt: string): Promise<Address> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILBOX_FACTORY_ABI,
      functionName: 'predictMailServiceAddress',
      args: [getAddress(usdcToken), getAddress(owner), salt as `0x${string}`],
    }) as Address;
  }

  /**
   * @description Generate a deterministic salt for deployment
   * @param projectName Name of the project
   * @param version Version identifier
   * @param contractType Type of contract ("Mailer" or "MailService")
   * @returns Promise resolving to generated salt
   */
  async generateSalt(projectName: string, version: string, contractType: string): Promise<`0x${string}`> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILBOX_FACTORY_ABI,
      functionName: 'generateSalt',
      args: [projectName, version, contractType],
    }) as `0x${string}`;
  }

  /**
   * @description Check if a contract exists at the given address
   * @param address Address to check
   * @returns Promise resolving to true if contract exists
   */
  async isContractDeployed(address: string): Promise<boolean> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: MAILBOX_FACTORY_ABI,
      functionName: 'isContractDeployed',
      args: [getAddress(address)],
    }) as boolean;
  }

  /**
   * @description Get the MailBoxFactory contract address
   * @returns Contract address
   */
  getAddress(): Address {
    return this.contractAddress;
  }
}
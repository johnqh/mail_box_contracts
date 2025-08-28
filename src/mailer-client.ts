import { ethers } from "ethers";
import { Mailer, Mailer__factory, MailService, MailService__factory } from "../typechain-types";

/**
 * @class MailerClient
 * @description High-level TypeScript client for the Mailer contract
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
 * const provider = new ethers.JsonRpcProvider('RPC_URL');
 * const mailer = new MailerClient('CONTRACT_ADDRESS', provider);
 * 
 * // Send priority message (with revenue sharing)
 * const signer = new ethers.Wallet('PRIVATE_KEY', provider);
 * await mailer.connect(signer).sendPriority('Subject', 'Body');
 * 
 * // Claim your revenue share
 * await mailer.claimRecipientShare();
 * ```
 */
export class MailerClient {
  private contract: Mailer;

  /**
   * @description Creates a new MailerClient instance
   * @param contractAddress The deployed Mailer contract address
   * @param provider Ethereum provider for blockchain connection
   */
  constructor(contractAddress: string, provider: ethers.Provider) {
    this.contract = Mailer__factory.connect(contractAddress, provider);
  }

  /**
   * @description Deploy a new Mailer contract and return a client instance
   * @param signer Ethereum signer with deployment permissions
   * @param usdcTokenAddress Address of the USDC token contract
   * @param ownerAddress Address that will own the deployed contract
   * @returns Promise resolving to a MailerClient instance
   */
  static async deploy(signer: ethers.Signer, usdcTokenAddress: string, ownerAddress: string): Promise<MailerClient> {
    const factory = new Mailer__factory(signer);
    const contract = await factory.deploy(usdcTokenAddress, ownerAddress);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    return new MailerClient(address, signer.provider!);
  }


  /**
   * @description Send a priority message with full fee and 90% revenue share
   * @notice Sender pays 0.1 USDC, gets 90% back as claimable revenue within 60 days
   * @param subject Message subject line
   * @param body Message content
   * @returns Promise resolving to transaction response
   * @example
   * ```typescript
   * const tx = await mailer.connect(signer).sendPriority('Hello', 'This is a priority message');
   * await tx.wait();
   * ```
   */
  async sendPriority(
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPriority(subject, body);
  }

  /**
   * @description Send a priority message using a pre-prepared mail ID
   * @notice Sender pays 0.1 USDC, gets 90% back as claimable revenue within 60 days
   * @param mailId Pre-prepared message identifier
   * @returns Promise resolving to transaction response
   */
  async sendPriorityPrepared(
    mailId: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPriorityPrepared(mailId);
  }

  /**
   * @description Send a standard message with 10% fee only (no revenue share)
   * @notice Sender pays 0.01 USDC with no revenue share back
   * @param subject Message subject line
   * @param body Message content
   * @returns Promise resolving to transaction response
   * @example
   * ```typescript
   * const tx = await mailer.connect(signer).send('Subject', 'Standard message');
   * await tx.wait();
   * ```
   */
  async send(
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.send(subject, body);
  }

  /**
   * @description Send a standard message using a pre-prepared mail ID
   * @notice Sender pays 0.01 USDC with no revenue share back
   * @param mailId Pre-prepared message identifier
   * @returns Promise resolving to transaction response
   */
  async sendPrepared(
    mailId: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPrepared(mailId);
  }

  async getSendFee(): Promise<bigint> {
    return await this.contract.sendFee();
  }

  async getUsdcToken(): Promise<string> {
    return await this.contract.usdcToken();
  }

  getAddress(): Promise<string> {
    return this.contract.getAddress();
  }

  async claimRecipientShare(): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.claimRecipientShare();
  }

  async claimOwnerShare(): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.claimOwnerShare();
  }

  async claimExpiredShares(recipient: string): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.claimExpiredShares(recipient);
  }

  async getRecipientClaimable(recipient: string): Promise<{amount: bigint, expiresAt: bigint, isExpired: boolean}> {
    const result = await this.contract.getRecipientClaimable(recipient);
    return {
      amount: result[0],
      expiresAt: result[1], 
      isExpired: result[2]
    };
  }

  async getOwnerClaimable(): Promise<bigint> {
    return await this.contract.getOwnerClaimable();
  }

  getContract(): Mailer {
    return this.contract;
  }
}

export class MailServiceClient {
  private contract: MailService;

  constructor(contractAddress: string, provider: ethers.Provider) {
    this.contract = MailService__factory.connect(contractAddress, provider);
  }

  static async deploy(signer: ethers.Signer, usdcTokenAddress: string, ownerAddress: string): Promise<MailServiceClient> {
    const factory = new MailService__factory(signer);
    const contract = await factory.deploy(usdcTokenAddress, ownerAddress);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    return new MailServiceClient(address, signer.provider!);
  }

  async delegateTo(delegate: string): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.delegateTo(delegate);
  }

  async rejectDelegation(delegatingAddress: string): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.rejectDelegation(delegatingAddress);
  }

  async registerDomain(domain: string, isExtension: boolean): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.registerDomain(domain, isExtension);
  }

  async getRegistrationFee(): Promise<bigint> {
    return await this.contract.registrationFee();
  }

  async getDelegationFee(): Promise<bigint> {
    return await this.contract.delegationFee();
  }

  async getDelegation(address: string): Promise<string> {
    return await this.contract.delegations(address);
  }

  async getUsdcToken(): Promise<string> {
    return await this.contract.usdcToken();
  }

  getAddress(): Promise<string> {
    return this.contract.getAddress();
  }

  getContract(): MailService {
    return this.contract;
  }
}

export class MailBoxClient {
  public mailer: MailerClient;
  public mailService: MailServiceClient;

  constructor(
    mailerAddress: string,
    mailServiceAddress: string,
    provider: ethers.Provider
  ) {
    this.mailer = new MailerClient(mailerAddress, provider);
    this.mailService = new MailServiceClient(mailServiceAddress, provider);
  }

  static async deployBoth(
    signer: ethers.Signer,
    usdcTokenAddress: string,
    ownerAddress: string
  ): Promise<MailBoxClient> {
    const mailerClient = await MailerClient.deploy(signer, usdcTokenAddress, ownerAddress);
    const mailServiceClient = await MailServiceClient.deploy(signer, usdcTokenAddress, ownerAddress);
    
    return new MailBoxClient(
      await mailerClient.getAddress(),
      await mailServiceClient.getAddress(),
      signer.provider!
    );
  }
}
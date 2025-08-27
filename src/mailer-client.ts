import { ethers } from "ethers";
import { Mailer, Mailer__factory, MailService, MailService__factory } from "../typechain-types";

export class MailerClient {
  private contract: Mailer;

  constructor(contractAddress: string, provider: ethers.Provider) {
    this.contract = Mailer__factory.connect(contractAddress, provider);
  }

  static async deploy(signer: ethers.Signer, usdcTokenAddress: string, ownerAddress: string): Promise<MailerClient> {
    const factory = new Mailer__factory(signer);
    const contract = await factory.deploy(usdcTokenAddress, ownerAddress);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    return new MailerClient(address, signer.provider!);
  }


  async sendPriority(
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPriority(subject, body);
  }

  async sendPriorityPrepared(
    mailId: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPriorityPrepared(mailId);
  }

  async send(
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.send(subject, body);
  }

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
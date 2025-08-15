import { ethers } from "ethers";
import { Mailer, Mailer__factory } from "../typechain-types";

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
    to: string,
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPriority(to, subject, body);
  }

  async sendPriorityPrepared(
    to: string,
    mailId: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPriorityPrepared(to, mailId);
  }

  async send(
    to: string,
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.send(to, subject, body);
  }

  async sendPrepared(
    to: string,
    mailId: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPrepared(to, mailId);
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
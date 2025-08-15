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
    mailId: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendPriorityPrepared(mailId);
  }

  async sendFree(
    to: string,
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendFree(to, subject, body);
  }

  async sendFreePrepared(
    mailId: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.sendFreePrepared(mailId);
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

  getContract(): Mailer {
    return this.contract;
  }
}
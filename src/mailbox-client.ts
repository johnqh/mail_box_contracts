import { ethers } from "ethers";
import { MailBox, MailBox__factory } from "../typechain-types";

export class MailBoxClient {
  private contract: MailBox;

  constructor(contractAddress: string, provider: ethers.Provider) {
    this.contract = MailBox__factory.connect(contractAddress, provider);
  }

  static async deploy(signer: ethers.Signer, usdcTokenAddress: string): Promise<MailBoxClient> {
    const factory = new MailBox__factory(signer);
    const contract = await factory.deploy(usdcTokenAddress);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    return new MailBoxClient(address, signer.provider!);
  }


  async send(
    from: string,
    to: string,
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.send(from, to, subject, body);
  }

  async getSendFee(): Promise<bigint> {
    return await this.contract.SEND_FEE();
  }

  async getUsdcToken(): Promise<string> {
    return await this.contract.usdcToken();
  }

  getAddress(): Promise<string> {
    return this.contract.getAddress();
  }

  getContract(): MailBox {
    return this.contract;
  }
}
import { ethers } from "ethers";
import { PrivilegedMail, PrivilegedMail__factory } from "../typechain-types";

export class PrivilegedMailClient {
  private contract: PrivilegedMail;

  constructor(contractAddress: string, provider: ethers.Provider) {
    this.contract = PrivilegedMail__factory.connect(contractAddress, provider);
  }

  static async deploy(signer: ethers.Signer, usdcTokenAddress: string): Promise<PrivilegedMailClient> {
    const factory = new PrivilegedMail__factory(signer);
    const contract = await factory.deploy(usdcTokenAddress);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    return new PrivilegedMailClient(address, signer.provider!);
  }


  async send(
    to: string,
    subject: string,
    body: string
  ): Promise<ethers.ContractTransactionResponse> {
    return await this.contract.send(to, subject, body);
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

  getContract(): PrivilegedMail {
    return this.contract;
  }
}
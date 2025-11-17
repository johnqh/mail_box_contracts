import { expect } from "chai";
import hre from "hardhat";
import { parseUnits } from "viem";

describe("MailerIntegrationExample", function () {
  it("Should compile and deploy successfully", async function () {
    const [owner, user1, user2] = await hre.viem.getWalletClients();

    // Deploy mock USDC
    const mockUSDC = await hre.viem.deployContract("MockUSDC");

    // Deploy Mailer as upgradeable UUPS proxy
    const { ethers, upgrades } = hre;
    const Mailer = await ethers.getContractFactory("Mailer");

    const mailerProxy = await upgrades.deployProxy(
      Mailer,
      [mockUSDC.address, owner.account.address],
      {
        kind: "uups",
        initializer: "initialize",
      }
    );
    await mailerProxy.waitForDeployment();
    const mailerAddress = await mailerProxy.getAddress();

    // Deploy integration example - this tests that the interface works
    const integration = await hre.viem.deployContract("MailerIntegrationExample", [
      mailerAddress as `0x${string}`,
      mockUSDC.address,
    ]);

    // Verify deployment
    const storedMailer = await integration.read.mailer();
    const storedUsdc = await integration.read.usdcToken();
    const storedOwner = await integration.read.owner();

    expect(storedMailer.toLowerCase()).to.equal(mailerAddress.toLowerCase());
    expect(storedUsdc.toLowerCase()).to.equal(mockUSDC.address.toLowerCase());
    expect(storedOwner.toLowerCase()).to.equal(owner.account.address.toLowerCase());
  });

  it("Should successfully call Mailer through the integration contract", async function () {
    const [owner, user1, user2] = await hre.viem.getWalletClients();

    // Deploy mock USDC
    const mockUSDC = await hre.viem.deployContract("MockUSDC");

    // Deploy Mailer
    const { ethers, upgrades } = hre;
    const Mailer = await ethers.getContractFactory("Mailer");
    const mailerProxy = await upgrades.deployProxy(
      Mailer,
      [mockUSDC.address, owner.account.address],
      {
        kind: "uups",
        initializer: "initialize",
      }
    );
    await mailerProxy.waitForDeployment();
    const mailerAddress = await mailerProxy.getAddress();
    const mailer = await hre.viem.getContractAt("Mailer", mailerAddress as `0x${string}`);

    // Deploy integration example
    const integration = await hre.viem.deployContract("MailerIntegrationExample", [
      mailerAddress as `0x${string}`,
      mockUSDC.address,
    ]);

    // Mint USDC to user1 and approve
    await mockUSDC.write.mint([user1.account.address, parseUnits("100", 6)]);
    await mockUSDC.write.approve(
      [mailerAddress as `0x${string}`, parseUnits("1", 6)],
      { account: user1.account }
    );

    // User1 grants permission to integration contract to pay on their behalf
    await mailer.write.setPermission([integration.address], { account: user1.account });

    // Send notification through integration contract
    const hash = await integration.write.sendNotification(
      [user2.account.address, "Hello from integration!"],
      { account: user1.account }
    );

    // Verify the transaction succeeded (which means the interface worked)
    const publicClient = await hre.viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).to.equal("success");
  });
});

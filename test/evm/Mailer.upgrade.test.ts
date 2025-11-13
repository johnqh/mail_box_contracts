import { expect } from "chai";
import hre from "hardhat";
import { parseUnits, getAddress } from "viem";

describe("Mailer Upgrades (UUPS)", function () {
  beforeEach(async function () {
    const [owner, addr1, addr2] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    // Deploy mock USDC (non-upgradeable, test token only)
    const mockUSDC = await hre.viem.deployContract("MockUSDC");

    // Deploy Mailer as upgradeable UUPS proxy using ethers
    const { ethers, upgrades } = hre;
    const Mailer = await ethers.getContractFactory("Mailer");

    const mailerProxy = await upgrades.deployProxy(
      Mailer,
      [mockUSDC.address, owner.account.address],
      {
        kind: 'uups',
        initializer: 'initialize'
      }
    );
    await mailerProxy.waitForDeployment();
    const mailerAddress = getAddress(await mailerProxy.getAddress());

    // Get viem contract instance for the proxy
    const mailer = await hre.viem.getContractAt("Mailer", mailerAddress);

    // Give addr1 some USDC and approve Mailer to spend
    await mockUSDC.write.mint([addr1.account.address, parseUnits("10", 6)], { account: owner.account });
    await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr1.account });

    this.mailer = mailer;
    this.mailerProxy = mailerProxy;
    this.mockUSDC = mockUSDC;
    this.owner = owner;
    this.addr1 = addr1;
    this.addr2 = addr2;
    this.publicClient = publicClient;
    this.Mailer = Mailer;
    this.ethers = ethers;
    this.upgrades = upgrades;
  });

  describe("Proxy deployment", function () {
    it("Should deploy as UUPS proxy", async function () {
      const { mailer, upgrades } = this;
      const implementationAddress = await upgrades.erc1967.getImplementationAddress(mailer.address);
      expect(implementationAddress).to.not.equal(mailer.address);
      expect(implementationAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    it("Should initialize correctly through proxy", async function () {
      const { mailer, mockUSDC, owner } = this;
      expect((await mailer.read.usdcToken()).toLowerCase()).to.equal(mockUSDC.address.toLowerCase());
      expect((await mailer.read.owner()).toLowerCase()).to.equal(owner.account.address.toLowerCase());
      expect(await mailer.read.sendFee()).to.equal(100000n); // 0.1 USDC
      expect(await mailer.read.delegationFee()).to.equal(10000000n); // 10 USDC
    });

    it("Should not allow re-initialization", async function () {
      const { mailerProxy, mockUSDC, owner } = this;
      await expect(
        mailerProxy.initialize(mockUSDC.address, owner.account.address)
      ).to.be.rejectedWith("InvalidInitialization");
    });
  });

  describe("Upgrade functionality", function () {
    it("Should allow owner to upgrade the contract", async function () {
      const { mailer, Mailer, upgrades } = this;

      const oldImplementation = await upgrades.erc1967.getImplementationAddress(mailer.address);

      // Upgrade to new implementation (same contract for testing)
      const upgraded = await upgrades.upgradeProxy(mailer.address, Mailer, {
        kind: 'uups'
      });
      await upgraded.waitForDeployment();

      const newImplementation = await upgrades.erc1967.getImplementationAddress(mailer.address);

      // Implementation address should change
      expect(newImplementation).to.not.equal(oldImplementation);
    });

    it("Should preserve state after upgrade", async function () {
      const { mailer, addr1, addr2, Mailer, upgrades } = this;

      // Set some state before upgrade
      await mailer.write.send(
        [addr2.account.address, "Test", "Body", addr1.account.address, true, false],
        { account: addr1.account }
      );

      const sendFeeBefore = await mailer.read.sendFee();
      const usdcBefore = await mailer.read.usdcToken();
      const ownerBefore = await mailer.read.owner();
      const claimableBefore = await mailer.read.getRecipientClaimable([addr2.account.address]);

      // Upgrade contract
      await upgrades.upgradeProxy(mailer.address, Mailer, {
        kind: 'uups'
      });

      // Get new viem instance pointing to same proxy address
      const upgradedMailer = await hre.viem.getContractAt("Mailer", mailer.address);

      // Verify state is preserved
      expect(await upgradedMailer.read.sendFee()).to.equal(sendFeeBefore);
      expect((await upgradedMailer.read.usdcToken()).toLowerCase()).to.equal(usdcBefore.toLowerCase());
      expect((await upgradedMailer.read.owner()).toLowerCase()).to.equal(ownerBefore.toLowerCase());

      const claimableAfter = await upgradedMailer.read.getRecipientClaimable([addr2.account.address]);
      expect(claimableAfter[0]).to.equal(claimableBefore[0]); // amount
      expect(claimableAfter[1]).to.equal(claimableBefore[1]); // expiresAt
    });

    it("Should continue to work after upgrade", async function () {
      const { mailer, addr1, addr2, mockUSDC, Mailer, upgrades, publicClient } = this;

      // Upgrade contract
      await upgrades.upgradeProxy(mailer.address, Mailer, {
        kind: 'uups'
      });

      // Get new viem instance
      const upgradedMailer = await hre.viem.getContractAt("Mailer", mailer.address);

      // Fund and approve for addr1
      await mockUSDC.write.approve([upgradedMailer.address, parseUnits("10", 6)], { account: addr1.account });

      // Test that send still works after upgrade
      const hash = await upgradedMailer.write.send(
        [addr2.account.address, "After Upgrade", "Still works!", addr1.account.address, true, false],
        { account: addr1.account }
      );

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await upgradedMailer.getEvents.MailSent();
      expect(logs.length).to.be.greaterThan(0);
    });

    it("Should not allow non-owner to upgrade", async function () {
      const { mailer, ethers, upgrades } = this;

      // Connect as non-owner (addr1)
      const [, signer1] = await ethers.getSigners();
      const MailerFactory = await ethers.getContractFactory("Mailer", signer1);

      // Attempt upgrade as non-owner should fail
      await expect(
        upgrades.upgradeProxy(mailer.address, MailerFactory, {
          kind: 'uups'
        })
      ).to.be.rejected; // Will fail during authorization check
    });

    it("Should maintain correct implementation address", async function () {
      const { mailer, Mailer, upgrades } = this;

      const implementationBefore = await upgrades.erc1967.getImplementationAddress(mailer.address);

      // Upgrade
      await upgrades.upgradeProxy(mailer.address, Mailer, {
        kind: 'uups'
      });

      const implementationAfter = await upgrades.erc1967.getImplementationAddress(mailer.address);

      // Implementation should change
      expect(implementationAfter).to.not.equal(implementationBefore);
      // Both should be valid addresses
      expect(implementationBefore).to.match(/^0x[a-fA-F0-9]{40}$/);
      expect(implementationAfter).to.match(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe("Storage layout validation", function () {
    it("Should maintain storage layout after upgrade", async function () {
      const { mailer, addr1, addr2, owner, mockUSDC, Mailer, upgrades } = this;

      // Set various state variables
      await mailer.write.setFee([parseUnits("0.2", 6)], { account: owner.account });
      await mailer.write.setDelegationFee([parseUnits("20", 6)], { account: owner.account });

      // Fund addr1 more and send a message
      await mockUSDC.write.mint([addr1.account.address, parseUnits("10", 6)], { account: owner.account });
      await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr1.account });
      await mailer.write.send(
        [addr2.account.address, "Test", "Body", addr1.account.address, true, false],
        { account: addr1.account }
      );

      const sendFee = await mailer.read.sendFee();
      const delegationFee = await mailer.read.delegationFee();
      const ownerClaimable = await mailer.read.ownerClaimable();
      const recipientClaim = await mailer.read.getRecipientClaimable([addr2.account.address]);

      // Upgrade
      await upgrades.upgradeProxy(mailer.address, Mailer, {
        kind: 'uups'
      });

      const upgradedMailer = await hre.viem.getContractAt("Mailer", mailer.address);

      // All state should be preserved
      expect(await upgradedMailer.read.sendFee()).to.equal(sendFee);
      expect(await upgradedMailer.read.delegationFee()).to.equal(delegationFee);
      expect(await upgradedMailer.read.ownerClaimable()).to.equal(ownerClaimable);

      const recipientClaimAfter = await upgradedMailer.read.getRecipientClaimable([addr2.account.address]);
      expect(recipientClaimAfter[0]).to.equal(recipientClaim[0]);
    });
  });

  describe("Owner management", function () {
    it("Should maintain owner through upgrade", async function () {
      const { mailer, owner, Mailer, upgrades } = this;

      const ownerBefore = await mailer.read.owner();

      await upgrades.upgradeProxy(mailer.address, Mailer, {
        kind: 'uups'
      });

      const upgradedMailer = await hre.viem.getContractAt("Mailer", mailer.address);
      const ownerAfter = await upgradedMailer.read.owner();

      expect(ownerAfter.toLowerCase()).to.equal(ownerBefore.toLowerCase());
      expect(ownerAfter.toLowerCase()).to.equal(owner.account.address.toLowerCase());
    });
  });
});

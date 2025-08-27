import { expect } from "chai";
import { ethers } from "hardhat";
import { MailerClient, MailServiceClient, MailBoxClient } from "../src/mailer-client";
import { MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MailBox Client", function () {
  let mockUSDC: MockUSDC;
  let mailerClient: MailerClient;
  let mailServiceClient: MailServiceClient;
  let mailBoxClient: MailBoxClient;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDCFactory.deploy();
    await mockUSDC.waitForDeployment();

    // Deploy using clients
    mailerClient = await MailerClient.deploy(owner, await mockUSDC.getAddress(), owner.address);
    mailServiceClient = await MailServiceClient.deploy(owner, await mockUSDC.getAddress(), owner.address);

    // Create unified client
    mailBoxClient = new MailBoxClient(
      await mailerClient.getAddress(),
      await mailServiceClient.getAddress(),
      owner.provider
    );

    // Fund test accounts
    await mockUSDC.mint(addr1.address, ethers.parseUnits("1000", 6));
    await mockUSDC.mint(addr2.address, ethers.parseUnits("1000", 6));

    // Approve spending
    await mockUSDC.connect(addr1).approve(await mailServiceClient.getAddress(), ethers.parseUnits("1000", 6));
    await mockUSDC.connect(addr2).approve(await mailServiceClient.getAddress(), ethers.parseUnits("1000", 6));
    await mockUSDC.connect(addr1).approve(await mailerClient.getAddress(), ethers.parseUnits("1000", 6));
    await mockUSDC.connect(addr2).approve(await mailerClient.getAddress(), ethers.parseUnits("1000", 6));
  });

  describe("MailServiceClient", function () {
    it("Should handle delegation functionality", async function () {
      // Connect client to addr1
      const addr1MailServiceClient = new MailServiceClient(
        await mailServiceClient.getAddress(),
        addr1.provider
      );

      // Check initial delegation state
      expect(await mailServiceClient.getDelegation(addr1.address)).to.equal(ethers.ZeroAddress);

      // Delegate from addr1 to addr2
      await expect(addr1MailServiceClient.getContract().connect(addr1).delegateTo(addr2.address))
        .to.emit(addr1MailServiceClient.getContract(), "DelegationSet")
        .withArgs(addr1.address, addr2.address);

      // Verify delegation
      expect(await mailServiceClient.getDelegation(addr1.address)).to.equal(addr2.address);

      // addr2 rejects the delegation
      const addr2MailServiceClient = new MailServiceClient(
        await mailServiceClient.getAddress(),
        addr2.provider
      );

      await expect(addr2MailServiceClient.getContract().connect(addr2).rejectDelegation(addr1.address))
        .to.emit(addr2MailServiceClient.getContract(), "DelegationSet")
        .withArgs(addr1.address, ethers.ZeroAddress);

      // Verify delegation was cleared
      expect(await mailServiceClient.getDelegation(addr1.address)).to.equal(ethers.ZeroAddress);
    });

    it("Should handle domain registration", async function () {
      const addr1MailServiceClient = new MailServiceClient(
        await mailServiceClient.getAddress(),
        addr1.provider
      );

      // Register a domain
      await expect(addr1MailServiceClient.getContract().connect(addr1).registerDomain("test.mail", false))
        .to.emit(addr1MailServiceClient.getContract(), "DomainRegistered");
    });

    it("Should get fees correctly", async function () {
      expect(await mailServiceClient.getRegistrationFee()).to.equal(ethers.parseUnits("100", 6));
      expect(await mailServiceClient.getDelegationFee()).to.equal(ethers.parseUnits("10", 6));
    });
  });

  describe("MailerClient", function () {
    it("Should send messages correctly", async function () {
      const addr1MailerClient = new MailerClient(
        await mailerClient.getAddress(),
        addr1.provider
      );

      // Send priority message
      await expect(addr1MailerClient.getContract().connect(addr1).sendPriority("Test Subject", "Test Body"))
        .to.emit(addr1MailerClient.getContract(), "MailSent")
        .withArgs(addr1.address, addr1.address, "Test Subject", "Test Body");
    });

    it("Should get fees correctly", async function () {
      expect(await mailerClient.getSendFee()).to.equal(ethers.parseUnits("0.1", 6));
    });
  });

  describe("MailBoxClient unified", function () {
    it("Should provide access to both services", async function () {
      expect(mailBoxClient.mailer).to.be.instanceOf(MailerClient);
      expect(mailBoxClient.mailService).to.be.instanceOf(MailServiceClient);

      // Test that both clients work through unified interface
      expect(await mailBoxClient.mailer.getSendFee()).to.equal(ethers.parseUnits("0.1", 6));
      expect(await mailBoxClient.mailService.getRegistrationFee()).to.equal(ethers.parseUnits("100", 6));
    });

    it("Should deploy both contracts using deployBoth", async function () {
      const unifiedClient = await MailBoxClient.deployBoth(
        owner,
        await mockUSDC.getAddress(),
        owner.address
      );

      expect(unifiedClient.mailer).to.be.instanceOf(MailerClient);
      expect(unifiedClient.mailService).to.be.instanceOf(MailServiceClient);

      // Verify they work
      expect(await unifiedClient.mailer.getSendFee()).to.equal(ethers.parseUnits("0.1", 6));
      expect(await unifiedClient.mailService.getRegistrationFee()).to.equal(ethers.parseUnits("100", 6));
    });
  });
});
import { expect } from "chai";
import { ethers } from "hardhat";
import { MailBoxFactory, MockUSDC, Mailer, MailService } from "../typechain-types";

describe("MailBoxFactory", function () {
  let mailBoxFactory: MailBoxFactory;
  let mockUSDC: MockUSDC;
  let owner: any, addr1: any;
  let usdcAddress: string;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    usdcAddress = await mockUSDC.getAddress();

    // Deploy MailBoxFactory
    const MailBoxFactory = await ethers.getContractFactory("MailBoxFactory");
    mailBoxFactory = await MailBoxFactory.deploy();
    await mailBoxFactory.waitForDeployment();
  });

  describe("Salt generation", function () {
    it("Should generate consistent salts for same parameters", async function () {
      const salt1 = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      const salt2 = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      expect(salt1).to.equal(salt2);
    });

    it("Should generate different salts for different parameters", async function () {
      const mailerSalt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      const mailServiceSalt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "MailService");
      expect(mailerSalt).to.not.equal(mailServiceSalt);
    });

    it("Should generate different salts for different versions", async function () {
      const v1Salt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      const v2Salt = await mailBoxFactory.generateSalt("MailBox", "2.0.0", "Mailer");
      expect(v1Salt).to.not.equal(v2Salt);
    });
  });

  describe("Address prediction", function () {
    let salt: string;

    beforeEach(async function () {
      salt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
    });

    it("Should predict Mailer address correctly", async function () {
      const predictedAddress = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt);
      expect(ethers.isAddress(predictedAddress)).to.be.true;
      expect(predictedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should predict MailService address correctly", async function () {
      const predictedAddress = await mailBoxFactory.predictMailServiceAddress(usdcAddress, owner.address, salt);
      expect(ethers.isAddress(predictedAddress)).to.be.true;
      expect(predictedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should predict different addresses for different salts", async function () {
      const salt1 = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      const salt2 = await mailBoxFactory.generateSalt("MailBox", "2.0.0", "Mailer");
      
      const addr1 = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt1);
      const addr2 = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt2);
      
      expect(addr1).to.not.equal(addr2);
    });
  });

  describe("Mailer deployment", function () {
    let salt: string;

    beforeEach(async function () {
      salt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
    });

    it("Should deploy Mailer contract successfully", async function () {
      const predictedAddress = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt);
      
      await expect(mailBoxFactory.deployMailer(usdcAddress, owner.address, salt))
        .to.emit(mailBoxFactory, "MailerDeployed")
        .withArgs(predictedAddress, usdcAddress, owner.address, salt);

      // Verify contract is deployed at predicted address
      const isDeployed = await mailBoxFactory.isContractDeployed(predictedAddress);
      expect(isDeployed).to.be.true;
    });

    it("Should revert when deploying with invalid parameters", async function () {
      await expect(mailBoxFactory.deployMailer(ethers.ZeroAddress, owner.address, salt))
        .to.be.revertedWithCustomError(mailBoxFactory, "InvalidParameters");

      await expect(mailBoxFactory.deployMailer(usdcAddress, ethers.ZeroAddress, salt))
        .to.be.revertedWithCustomError(mailBoxFactory, "InvalidParameters");
    });

    it("Should revert when deploying to same address twice", async function () {
      await mailBoxFactory.deployMailer(usdcAddress, owner.address, salt);
      
      await expect(mailBoxFactory.deployMailer(usdcAddress, owner.address, salt))
        .to.be.revertedWithCustomError(mailBoxFactory, "ContractAlreadyDeployed");
    });

    it("Should deploy functional Mailer contract", async function () {
      const predictedAddress = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt);
      await mailBoxFactory.deployMailer(usdcAddress, owner.address, salt);

      // Connect to deployed contract and test functionality
      const Mailer = await ethers.getContractFactory("Mailer");
      const mailer = Mailer.attach(predictedAddress) as Mailer;

      expect(await mailer.owner()).to.equal(owner.address);
      expect(await mailer.usdcToken()).to.equal(usdcAddress);
      expect(await mailer.sendFee()).to.equal(100000); // 0.1 USDC
    });
  });

  describe("MailService deployment", function () {
    let salt: string;

    beforeEach(async function () {
      salt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "MailService");
    });

    it("Should deploy MailService contract successfully", async function () {
      const predictedAddress = await mailBoxFactory.predictMailServiceAddress(usdcAddress, owner.address, salt);
      
      await expect(mailBoxFactory.deployMailService(usdcAddress, owner.address, salt))
        .to.emit(mailBoxFactory, "MailServiceDeployed")
        .withArgs(predictedAddress, usdcAddress, owner.address, salt);

      // Verify contract is deployed at predicted address
      const isDeployed = await mailBoxFactory.isContractDeployed(predictedAddress);
      expect(isDeployed).to.be.true;
    });

    it("Should revert when deploying with invalid parameters", async function () {
      await expect(mailBoxFactory.deployMailService(ethers.ZeroAddress, owner.address, salt))
        .to.be.revertedWithCustomError(mailBoxFactory, "InvalidParameters");

      await expect(mailBoxFactory.deployMailService(usdcAddress, ethers.ZeroAddress, salt))
        .to.be.revertedWithCustomError(mailBoxFactory, "InvalidParameters");
    });

    it("Should deploy functional MailService contract", async function () {
      const predictedAddress = await mailBoxFactory.predictMailServiceAddress(usdcAddress, owner.address, salt);
      await mailBoxFactory.deployMailService(usdcAddress, owner.address, salt);

      // Connect to deployed contract and test functionality
      const MailService = await ethers.getContractFactory("MailService");
      const mailService = MailService.attach(predictedAddress) as MailService;

      expect(await mailService.owner()).to.equal(owner.address);
      expect(await mailService.usdcToken()).to.equal(usdcAddress);
      expect(await mailService.delegationFee()).to.equal(10000000); // 10 USDC
    });
  });

  describe("Batch deployment", function () {
    let mailerSalt: string;
    let mailServiceSalt: string;

    beforeEach(async function () {
      mailerSalt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      mailServiceSalt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "MailService");
    });

    it("Should deploy both contracts in single transaction", async function () {
      const predictedMailer = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, mailerSalt);
      const predictedMailService = await mailBoxFactory.predictMailServiceAddress(usdcAddress, owner.address, mailServiceSalt);

      const tx = await mailBoxFactory.deployBoth(usdcAddress, owner.address, mailerSalt, mailServiceSalt);
      const receipt = await tx.wait();

      // Check for both events
      const mailerEvent = receipt?.logs.find((log: any) => 
        log.fragment?.name === "MailerDeployed"
      );
      const mailServiceEvent = receipt?.logs.find((log: any) => 
        log.fragment?.name === "MailServiceDeployed"
      );

      expect(mailerEvent).to.exist;
      expect(mailServiceEvent).to.exist;

      // Verify both contracts are deployed
      expect(await mailBoxFactory.isContractDeployed(predictedMailer)).to.be.true;
      expect(await mailBoxFactory.isContractDeployed(predictedMailService)).to.be.true;
    });

    it("Should return correct addresses from deployBoth", async function () {
      const predictedMailer = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, mailerSalt);
      const predictedMailService = await mailBoxFactory.predictMailServiceAddress(usdcAddress, owner.address, mailServiceSalt);

      // Note: For external calls, we need to use staticCall or parse return values from events
      const tx = await mailBoxFactory.deployBoth(usdcAddress, owner.address, mailerSalt, mailServiceSalt);
      const receipt = await tx.wait();

      const mailerEvent = receipt?.logs.find((log: any) => 
        log.fragment?.name === "MailerDeployed"
      );
      const mailServiceEvent = receipt?.logs.find((log: any) => 
        log.fragment?.name === "MailServiceDeployed"
      );

      expect(mailerEvent?.args[0]).to.equal(predictedMailer);
      expect(mailServiceEvent?.args[0]).to.equal(predictedMailService);
    });
  });

  describe("Contract existence checking", function () {
    it("Should return false for non-existent contracts", async function () {
      const randomAddress = "0x1234567890123456789012345678901234567890";
      expect(await mailBoxFactory.isContractDeployed(randomAddress)).to.be.false;
    });

    it("Should return false for EOA addresses", async function () {
      expect(await mailBoxFactory.isContractDeployed(addr1.address)).to.be.false;
    });

    it("Should return true for deployed contracts", async function () {
      const salt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      const predictedAddress = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt);
      
      // Before deployment
      expect(await mailBoxFactory.isContractDeployed(predictedAddress)).to.be.false;
      
      // Deploy contract
      await mailBoxFactory.deployMailer(usdcAddress, owner.address, salt);
      
      // After deployment
      expect(await mailBoxFactory.isContractDeployed(predictedAddress)).to.be.true;
    });
  });

  describe("Cross-chain consistency", function () {
    it("Should generate same addresses when using same factory address", async function () {
      // This test demonstrates that the same factory at the same address
      // will generate the same predicted addresses
      const salt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      
      // Multiple calls to the same factory should predict the same address
      const addr1 = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt);
      const addr2 = await mailBoxFactory.predictMailerAddress(usdcAddress, owner.address, salt);
      
      expect(addr1).to.equal(addr2);
      
      // Different factories will generate different addresses (this is expected)
      // For true cross-chain consistency, the factory must be deployed at the same address
    });

    it("Should maintain address consistency across different networks with same USDC", async function () {
      // Simulate different network USDC addresses
      const mainnetUSDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
      const polygonUSDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
      
      const salt = await mailBoxFactory.generateSalt("MailBox", "1.0.0", "Mailer");
      
      const mainnetAddr = await mailBoxFactory.predictMailerAddress(mainnetUSDC, owner.address, salt);
      const polygonAddr = await mailBoxFactory.predictMailerAddress(polygonUSDC, owner.address, salt);
      
      // Different USDC addresses should result in different predicted addresses
      expect(mainnetAddr).to.not.equal(polygonAddr);
      
      // But same USDC should give same address
      const mainnetAddr2 = await mailBoxFactory.predictMailerAddress(mainnetUSDC, owner.address, salt);
      expect(mainnetAddr).to.equal(mainnetAddr2);
    });
  });
});
import { expect } from "chai";
import { ethers } from "hardhat";
import { MailBoxFactory, MockUSDC } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("MailBoxFactory", function () {
  let factory: MailBoxFactory;
  let mockUSDC: MockUSDC;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const PROJECT_NAME = "MailBox";
  const VERSION = "v1.2.0";

  function getBytecodeWithConstructor(contractFactory: any, ...constructorArgs: any[]) {
    // Combine bytecode with encoded constructor args
    const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
      contractFactory.interface.deploy.inputs,
      constructorArgs
    );
    return contractFactory.bytecode + encodedArgs.slice(2); // Remove '0x' prefix from encoded args
  }

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDCFactory.deploy();
    await mockUSDC.waitForDeployment();

    // Deploy MailBoxFactory
    const MailBoxFactoryContract = await ethers.getContractFactory("MailBoxFactory");
    factory = await MailBoxFactoryContract.deploy();
    await factory.waitForDeployment();
  });

  describe("Salt Generation", function () {
    it("Should generate deterministic salts", async function () {
      const salt1 = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const salt2 = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const salt3 = await factory.generateSalt(PROJECT_NAME, VERSION, "MailService");

      expect(salt1).to.equal(salt2);
      expect(salt1).to.not.equal(salt3);
    });

    it("Should generate different salts for different inputs", async function () {
      const mailerSalt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const mailServiceSalt = await factory.generateSalt(PROJECT_NAME, VERSION, "MailService");
      const differentVersionSalt = await factory.generateSalt(PROJECT_NAME, "v2.0.0", "Mailer");

      expect(mailerSalt).to.not.equal(mailServiceSalt);
      expect(mailerSalt).to.not.equal(differentVersionSalt);
    });
  });

  describe("Address Prediction", function () {
    it("Should predict addresses correctly", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const factoryAddress = await factory.getAddress();
      const usdcAddress = await mockUSDC.getAddress();

      // Get bytecode for Mailer contract
      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      const predictedAddress = await factory.predictAddress(
        mailerBytecode,
        salt,
        factoryAddress
      );

      expect(predictedAddress).to.be.properAddress;
      expect(predictedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should predict different addresses for different salts", async function () {
      const factoryAddress = await factory.getAddress();
      const usdcAddress = await mockUSDC.getAddress();

      const mailerSalt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const mailServiceSalt = await factory.generateSalt(PROJECT_NAME, VERSION, "MailService");

      // Get bytecode for both contracts
      const MailerFactory = await ethers.getContractFactory("Mailer");
      const MailServiceFactory = await ethers.getContractFactory("MailService");
      
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);
      const mailServiceBytecode = getBytecodeWithConstructor(MailServiceFactory, usdcAddress, owner.address);

      const mailerAddress = await factory.predictAddress(
        mailerBytecode,
        mailerSalt,
        factoryAddress
      );

      const mailServiceAddress = await factory.predictAddress(
        mailServiceBytecode,
        mailServiceSalt,
        factoryAddress
      );

      expect(mailerAddress).to.not.equal(mailServiceAddress);
    });

    it("Should predict same addresses for same parameters", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const factoryAddress = await factory.getAddress();
      const usdcAddress = await mockUSDC.getAddress();

      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      const address1 = await factory.predictAddress(
        mailerBytecode,
        salt,
        factoryAddress
      );

      const address2 = await factory.predictAddress(
        mailerBytecode,
        salt,
        factoryAddress
      );

      expect(address1).to.equal(address2);
    });
  });

  describe("Contract Deployment", function () {
    it("Should deploy Mailer contract using CREATE2", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const usdcAddress = await mockUSDC.getAddress();
      const factoryAddress = await factory.getAddress();

      // Get bytecode
      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      // Predict address
      const predictedAddress = await factory.predictAddress(
        mailerBytecode,
        salt,
        factoryAddress
      );

      // Deploy contract
      const tx = await factory.deployContract(mailerBytecode, salt, "Mailer");
      const receipt = await tx.wait();

      // Check event
      const event = receipt?.logs.find(log => {
        try {
          const parsed = factory.interface.parseLog(log as any);
          return parsed?.name === "ContractDeployed";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;

      // Verify deployed address matches prediction
      const deployedMailer = await ethers.getContractAt("Mailer", predictedAddress);
      expect(await deployedMailer.getAddress()).to.equal(predictedAddress);

      // Verify contract functionality
      expect(await deployedMailer.owner()).to.equal(owner.address);
      expect(await deployedMailer.usdcToken()).to.equal(usdcAddress);
    });

    it("Should deploy MailService contract using CREATE2", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "MailService");
      const usdcAddress = await mockUSDC.getAddress();
      const factoryAddress = await factory.getAddress();

      // Get bytecode
      const MailServiceFactory = await ethers.getContractFactory("MailService");
      const mailServiceBytecode = getBytecodeWithConstructor(MailServiceFactory, usdcAddress, owner.address);

      // Predict address
      const predictedAddress = await factory.predictAddress(
        mailServiceBytecode,
        salt,
        factoryAddress
      );

      // Deploy contract
      const tx = await factory.deployContract(mailServiceBytecode, salt, "MailService");
      const receipt = await tx.wait();

      // Check event
      const event = receipt?.logs.find(log => {
        try {
          const parsed = factory.interface.parseLog(log as any);
          return parsed?.name === "ContractDeployed";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;

      // Verify deployed address matches prediction
      const deployedMailService = await ethers.getContractAt("MailService", predictedAddress);
      expect(await deployedMailService.getAddress()).to.equal(predictedAddress);

      // Verify contract functionality
      expect(await deployedMailService.owner()).to.equal(owner.address);
      expect(await deployedMailService.usdcToken()).to.equal(usdcAddress);
    });

    it("Should deploy multiple contracts in batch", async function () {
      const mailerSalt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const mailServiceSalt = await factory.generateSalt(PROJECT_NAME, VERSION, "MailService");
      const usdcAddress = await mockUSDC.getAddress();
      const factoryAddress = await factory.getAddress();

      // Get bytecode
      const MailerFactory = await ethers.getContractFactory("Mailer");
      const MailServiceFactory = await ethers.getContractFactory("MailService");
      
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);
      const mailServiceBytecode = getBytecodeWithConstructor(MailServiceFactory, usdcAddress, owner.address);

      // Predict addresses
      const predictedMailerAddress = await factory.predictAddress(
        mailerBytecode,
        mailerSalt,
        factoryAddress
      );

      const predictedMailServiceAddress = await factory.predictAddress(
        mailServiceBytecode,
        mailServiceSalt,
        factoryAddress
      );

      // Deploy both contracts
      const tx = await factory.batchDeploy(
        [mailerBytecode, mailServiceBytecode],
        [mailerSalt, mailServiceSalt],
        ["Mailer", "MailService"]
      );
      
      const receipt = await tx.wait();

      // Check events
      const contractEvents = receipt?.logs.filter(log => {
        try {
          const parsed = factory.interface.parseLog(log as any);
          return parsed?.name === "ContractDeployed";
        } catch {
          return false;
        }
      });

      expect(contractEvents).to.have.length(2);

      // Verify deployed contracts
      const mailer = await ethers.getContractAt("Mailer", predictedMailerAddress);
      const mailService = await ethers.getContractAt("MailService", predictedMailServiceAddress);

      expect(await mailer.getAddress()).to.equal(predictedMailerAddress);
      expect(await mailService.getAddress()).to.equal(predictedMailServiceAddress);

      // Verify ownership
      expect(await mailer.owner()).to.equal(owner.address);
      expect(await mailService.owner()).to.equal(owner.address);
    });

    it("Should revert when trying to deploy to the same address twice", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const usdcAddress = await mockUSDC.getAddress();

      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      // Deploy first time
      await factory.deployContract(mailerBytecode, salt, "Mailer");

      // Try to deploy again with the same salt
      await expect(
        factory.deployContract(mailerBytecode, salt, "Mailer")
      ).to.be.reverted;
    });
  });

  describe("Contract Detection", function () {
    it("Should detect deployed contracts correctly", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const usdcAddress = await mockUSDC.getAddress();
      const factoryAddress = await factory.getAddress();

      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      const predictedAddress = await factory.predictAddress(
        mailerBytecode,
        salt,
        factoryAddress
      );

      // Before deployment
      expect(await factory.isContractDeployed(predictedAddress)).to.be.false;

      // Deploy contract
      await factory.deployContract(mailerBytecode, salt, "Mailer");

      // After deployment
      expect(await factory.isContractDeployed(predictedAddress)).to.be.true;
    });

    it("Should return false for non-contract addresses", async function () {
      expect(await factory.isContractDeployed(addr1.address)).to.be.false;
      expect(await factory.isContractDeployed(ethers.ZeroAddress)).to.be.false;
    });
  });

  describe("Utility Functions", function () {
    it("Should return correct code hash", async function () {
      const MailerFactory = await ethers.getContractFactory("Mailer");
      const usdcAddress = await mockUSDC.getAddress();
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      const hash1 = await factory.getCodeHash(mailerBytecode);
      const hash2 = ethers.keccak256(mailerBytecode);

      expect(hash1).to.equal(hash2);
    });

    it("Should handle batch deployment array length mismatches", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const usdcAddress = await mockUSDC.getAddress();

      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      // Mismatched arrays
      await expect(
        factory.batchDeploy(
          [mailerBytecode],
          [salt, salt], // Too many salts
          ["Mailer"]
        )
      ).to.be.revertedWith("Arrays length mismatch");

      await expect(
        factory.batchDeploy(
          [mailerBytecode],
          [salt],
          ["Mailer", "MailService"] // Too many types
        )
      ).to.be.revertedWith("Arrays length mismatch");
    });
  });

  describe("Deterministic Deployment Across Networks", function () {
    it("Should produce identical addresses with same parameters", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const factoryAddress = await factory.getAddress();
      const usdcAddress = await mockUSDC.getAddress();

      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode = getBytecodeWithConstructor(MailerFactory, usdcAddress, owner.address);

      // Get predicted address multiple times (simulating different network calls)
      const address1 = await factory.predictAddress(mailerBytecode, salt, factoryAddress);
      const address2 = await factory.predictAddress(mailerBytecode, salt, factoryAddress);
      const address3 = await factory.predictAddress(mailerBytecode, salt, factoryAddress);

      expect(address1).to.equal(address2);
      expect(address2).to.equal(address3);
    });

    it("Should handle different USDC addresses correctly", async function () {
      const salt = await factory.generateSalt(PROJECT_NAME, VERSION, "Mailer");
      const factoryAddress = await factory.getAddress();

      // Deploy another mock USDC to simulate different network
      const MockUSDC2 = await ethers.getContractFactory("MockUSDC");
      const mockUSDC2 = await MockUSDC2.deploy();
      await mockUSDC2.waitForDeployment();

      const MailerFactory = await ethers.getContractFactory("Mailer");
      const mailerBytecode1 = getBytecodeWithConstructor(MailerFactory, await mockUSDC.getAddress(), owner.address);
      const mailerBytecode2 = getBytecodeWithConstructor(MailerFactory, await mockUSDC2.getAddress(), owner.address);

      const address1 = await factory.predictAddress(mailerBytecode1, salt, factoryAddress);
      const address2 = await factory.predictAddress(mailerBytecode2, salt, factoryAddress);

      // Different USDC addresses should result in different contract addresses
      expect(address1).to.not.equal(address2);
    });
  });
});
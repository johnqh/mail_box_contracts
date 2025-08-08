import { expect } from "chai";
import { ethers } from "hardhat";
import { SafeChecker, SafeDelegateHelper } from "../typechain-types";

describe("SafeChecker", function () {
  let safeChecker: SafeChecker;
  let mockUSDC: any;
  let mailService: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Deploy SafeChecker
    const SafeChecker = await ethers.getContractFactory("SafeChecker");
    safeChecker = await SafeChecker.deploy();
    await safeChecker.waitForDeployment();

    // Deploy mock USDC for helper contracts
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    // Deploy MailService for helper contracts
    const MailService = await ethers.getContractFactory("MailService");
    mailService = await MailService.deploy(await mockUSDC.getAddress(), await safeChecker.getAddress());
    await mailService.waitForDeployment();
  });

  describe("isSafe function", function () {
    it("Should return false for EOA (externally owned account)", async function () {
      const result = await safeChecker.isSafe(addr1.address);
      expect(result).to.be.false;
    });

    it("Should return false for contract without Safe interface", async function () {
      // mockUSDC doesn't implement Safe interface
      const result = await safeChecker.isSafe(await mockUSDC.getAddress());
      expect(result).to.be.false;
    });

    it("Should return true for valid SafeDelegateHelper (mock Safe)", async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();

      const result = await safeChecker.isSafe(await helper.getAddress());
      expect(result).to.be.true;
    });

    it("Should return false for Safe with threshold 0", async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();

      // Set threshold to 0
      await helper.setThreshold(0);

      const result = await safeChecker.isSafe(await helper.getAddress());
      expect(result).to.be.false;
    });

    it("Should return false for Safe with threshold greater than owner count", async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();

      // Set threshold higher than owner count (2 owners by default)
      await helper.setThreshold(5);

      const result = await safeChecker.isSafe(await helper.getAddress());
      expect(result).to.be.false;
    });

    it("Should return false for Safe with no valid owners", async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();

      // Remove all owners
      await helper.removeOwner(owner.address);
      await helper.removeOwner(ethers.ZeroAddress);
      await helper.removeOwner("0x0000000000000000000000000000000000000001");

      const result = await safeChecker.isSafe(await helper.getAddress());
      expect(result).to.be.false;
    });
  });

  describe("getSafeInfo function", function () {
    it("Should return correct info for valid Safe", async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();

      const [threshold, ownerCount, isValidSafe] = await safeChecker.getSafeInfo(await helper.getAddress());
      
      expect(threshold).to.equal(2);
      expect(ownerCount).to.equal(2);
      expect(isValidSafe).to.be.true;
    });

    it("Should return zeros for invalid address", async function () {
      const [threshold, ownerCount, isValidSafe] = await safeChecker.getSafeInfo(addr1.address);
      
      expect(threshold).to.equal(0);
      expect(ownerCount).to.equal(0);
      expect(isValidSafe).to.be.false;
    });
  });

  describe("isOwnerOfSafe function", function () {
    let helper: SafeDelegateHelper;

    beforeEach(async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();
    });

    it("Should return true for valid owner", async function () {
      const result = await safeChecker.isOwnerOfSafe(await helper.getAddress(), owner.address);
      expect(result).to.be.true;
    });

    it("Should return false for non-owner", async function () {
      const result = await safeChecker.isOwnerOfSafe(await helper.getAddress(), addr2.address);
      expect(result).to.be.false;
    });

    it("Should return false for invalid Safe address", async function () {
      const result = await safeChecker.isOwnerOfSafe(addr1.address, owner.address);
      expect(result).to.be.false;
    });

    it("Should return true after adding new owner", async function () {
      // Add new owner
      await helper.addOwner(addr2.address);
      
      const result = await safeChecker.isOwnerOfSafe(await helper.getAddress(), addr2.address);
      expect(result).to.be.true;
    });
  });
});
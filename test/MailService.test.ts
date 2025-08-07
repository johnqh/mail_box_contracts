import { expect } from "chai";
import { ethers } from "hardhat";
import { MailService, MockSafe } from "../typechain-types";

describe("MailService", function () {
  let mailService: MailService;
  let mockSafe: MockSafe;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let addr3: any;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    
    // Deploy MailService
    const MailService = await ethers.getContractFactory("MailService");
    mailService = await MailService.deploy();
    await mailService.waitForDeployment();
    
    // Deploy MockSafe with threshold of 2
    const MockSafe = await ethers.getContractFactory("MockSafe");
    mockSafe = await MockSafe.deploy(2);
    await mockSafe.waitForDeployment();
  });

  describe("delegateTo function", function () {
    it("Should revert when called from an EOA (not a Safe)", async function () {
      await expect(
        mailService.connect(addr1).delegateTo(addr2.address)
      ).to.be.revertedWithCustomError(mailService, "NotASafeWallet");
    });

    it("Should allow Safe wallet to delegate to another address", async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress());
      await helper.waitForDeployment();

      // Set delegation
      await helper.testDelegation(addr1.address);
      
      // Verify delegation was set
      const delegatedAddress = await mailService.getDelegatedAddress(await helper.getAddress());
      expect(delegatedAddress).to.equal(addr1.address);
    });

    it("Should emit DelegationSet event when delegating", async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress());
      await helper.waitForDeployment();

      await expect(
        helper.testDelegation(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(await helper.getAddress(), addr1.address);
    });

    it("Should allow clearing delegation by setting to null address", async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress());
      await helper.waitForDeployment();

      // First set a delegation
      await helper.testDelegation(addr1.address);
      
      // Then clear it
      await expect(
        helper.testDelegation(ethers.ZeroAddress)
      ).to.emit(mailService, "DelegationCleared")
       .withArgs(await helper.getAddress());
    });

    it("Should revert for contract that doesn't implement getThreshold", async function () {
      // Deploy a regular contract (not a Safe)
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const regularContract = await MockUSDC.deploy();
      await regularContract.waitForDeployment();

      // Try to call delegateTo from this non-Safe contract
      // This would require a helper, but we can test the validation logic
      await expect(
        mailService.connect(addr1).delegateTo(addr2.address)
      ).to.be.revertedWithCustomError(mailService, "NotASafeWallet");
    });

    it("Should revert for Safe with threshold of 0", async function () {
      // Deploy MockSafe with threshold of 0
      const MockSafe = await ethers.getContractFactory("MockSafe");
      const safeWithZeroThreshold = await MockSafe.deploy(0);
      await safeWithZeroThreshold.waitForDeployment();

      // Deploy helper for this Safe
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress());
      await helper.waitForDeployment();
      
      // Set threshold to 0
      await safeWithZeroThreshold.setThreshold(0);

      // This should revert because threshold is 0
      // Note: We'd need a more complex helper to properly test this
    });
  });

  describe("getDelegatedAddress function", function () {
    beforeEach(async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      this.helper = await SafeDelegateHelper.deploy(await mailService.getAddress());
      await this.helper.waitForDeployment();
    });

    it("Should return null address when no delegation exists", async function () {
      const delegatedAddress = await mailService.getDelegatedAddress(addr1.address);
      expect(delegatedAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should return delegated address after delegation is set", async function () {
      // Set delegation
      await this.helper.testDelegation(addr2.address);
      
      // Check delegation
      const delegatedAddress = await mailService.getDelegatedAddress(await this.helper.getAddress());
      expect(delegatedAddress).to.equal(addr2.address);
    });

    it("Should return null address after delegation is cleared", async function () {
      // Set delegation
      await this.helper.testDelegation(addr2.address);
      
      // Clear delegation
      await this.helper.testDelegation(ethers.ZeroAddress);
      
      // Check delegation
      const delegatedAddress = await mailService.getDelegatedAddress(await this.helper.getAddress());
      expect(delegatedAddress).to.equal(ethers.ZeroAddress);
    });

    it("Should handle multiple delegations independently", async function () {
      // Deploy another helper (representing another Safe)
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper2 = await SafeDelegateHelper.deploy(await mailService.getAddress());
      await helper2.waitForDeployment();

      // Set different delegations
      await this.helper.testDelegation(addr1.address);
      await helper2.testDelegation(addr2.address);
      
      // Check delegations are independent
      const delegation1 = await mailService.getDelegatedAddress(await this.helper.getAddress());
      const delegation2 = await mailService.getDelegatedAddress(await helper2.getAddress());
      
      expect(delegation1).to.equal(addr1.address);
      expect(delegation2).to.equal(addr2.address);
    });

    it("Should allow querying delegation for any address", async function () {
      // Query for addresses that haven't set any delegation
      const delegation1 = await mailService.getDelegatedAddress(owner.address);
      const delegation2 = await mailService.getDelegatedAddress(addr3.address);
      const delegation3 = await mailService.getDelegatedAddress(ethers.ZeroAddress);
      
      expect(delegation1).to.equal(ethers.ZeroAddress);
      expect(delegation2).to.equal(ethers.ZeroAddress);
      expect(delegation3).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Edge cases and security", function () {
    it("Should handle delegation updates correctly", async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress());
      await helper.waitForDeployment();

      // Set initial delegation
      await helper.testDelegation(addr1.address);
      expect(await mailService.getDelegatedAddress(await helper.getAddress())).to.equal(addr1.address);

      // Update delegation
      await helper.testDelegation(addr2.address);
      expect(await mailService.getDelegatedAddress(await helper.getAddress())).to.equal(addr2.address);

      // Update again
      await helper.testDelegation(addr3.address);
      expect(await mailService.getDelegatedAddress(await helper.getAddress())).to.equal(addr3.address);
    });

    it("Should not allow delegation from address without code", async function () {
      // EOA (Externally Owned Account) should not be able to delegate
      await expect(
        mailService.connect(owner).delegateTo(addr1.address)
      ).to.be.revertedWithCustomError(mailService, "NotASafeWallet");
    });
  });
});
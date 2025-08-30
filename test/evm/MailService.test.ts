import { expect } from "chai";
import { ethers } from "hardhat";
import { MailService } from "../typechain-types";

describe("MailService", function () {
  let mailService: MailService;
  let mockUSDC: any;
  let owner: any;
  let addr1: any;
  let addr2: any;
  let addr3: any;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    
    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    
    // Deploy MailService with USDC token and owner
    const MailService = await ethers.getContractFactory("MailService");
    mailService = await MailService.deploy(await mockUSDC.getAddress(), owner.address);
    await mailService.waitForDeployment();
    
  });

  describe("Contract setup", function () {
    it("Should set owner as deployer", async function () {
      expect(await mailService.owner()).to.equal(owner.address);
    });

    it("Should set USDC token address correctly", async function () {
      expect(await mailService.usdcToken()).to.equal(await mockUSDC.getAddress());
    });

    it("Should set correct default delegation fee", async function () {
      expect(await mailService.delegationFee()).to.equal(10000000); // 10 USDC
    });
  });

  describe("delegateTo function", function () {
    beforeEach(async function () {
      // Fund addresses with USDC for delegation fees
      await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr1).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
    });

    it("Should allow EOA to delegate and charge fee", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      
      await expect(
        mailService.connect(addr1).delegateTo(addr2.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, addr2.address);
      
      // Verify fee was charged
      const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      expect(finalBalance - initialBalance).to.equal(10000000); // 10 USDC
    });

    it("Should allow addr2 to delegate and charge fee", async function () {
      // Fund addr2 with USDC for delegation fees
      await mockUSDC.mint(addr2.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr2).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());

      // Set delegation
      await expect(
        mailService.connect(addr2).delegateTo(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr2.address, addr1.address);
      
      // Verify fee was charged
      const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      expect(finalBalance - initialBalance).to.equal(10000000); // 10 USDC
    });

    it("Should fail delegation when insufficient USDC", async function () {
      // Don't fund addr2, should fail
      await expect(
        mailService.connect(addr2).delegateTo(addr1.address)
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientBalance");
    });

    it("Should allow clearing delegation without fee", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      
      // Set delegation first
      await mailService.connect(addr1).delegateTo(addr2.address);
      
      // Clear delegation - should not charge fee
      const midBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      
      await expect(
        mailService.connect(addr1).delegateTo(ethers.ZeroAddress)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, ethers.ZeroAddress);
      
      // Balance should remain the same after clearing
      const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      expect(finalBalance).to.equal(midBalance);
    });

    it("Should emit correct events for multiple delegations", async function () {
      // Fund more USDC for multiple operations
      await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr1).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      // Set delegation to addr2
      await expect(
        mailService.connect(addr1).delegateTo(addr2.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, addr2.address);
      
      // Change delegation to addr3
      await expect(
        mailService.connect(addr1).delegateTo(addr3.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, addr3.address);
    });

    it("Should have delegation fee setter for owner", async function () {
      const newFee = 20000000; // 20 USDC
      
      await expect(
        mailService.connect(owner).setDelegationFee(newFee)
      ).to.emit(mailService, "DelegationFeeUpdated")
       .withArgs(10000000, newFee);
      
      expect(await mailService.delegationFee()).to.equal(newFee);
    });
  });

  describe("rejectDelegation function", function () {
    beforeEach(async function () {
      // Fund addr1 for delegation fee
      await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr1).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      // Set delegation from addr1 to addr2
      await mailService.connect(addr1).delegateTo(addr2.address);
    });

    it("Should allow delegate to reject delegation", async function () {
      await expect(
        mailService.connect(addr2).rejectDelegation(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, ethers.ZeroAddress);
    });

    it("Should allow any address to emit rejection events", async function () {
      // Anyone can emit rejection events - validation is handled off-chain
      await expect(
        mailService.connect(addr3).rejectDelegation(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, ethers.ZeroAddress);
    });

    it("Should allow rejection without validation", async function () {
      // No validation - anyone can reject any delegation
      await expect(
        mailService.connect(addr3).rejectDelegation(addr2.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr2.address, ethers.ZeroAddress);
    });

    it("Should allow multiple rejection events for same address", async function () {
      // Clear delegation first
      await mailService.connect(addr1).delegateTo(ethers.ZeroAddress);
      
      // Can still emit rejection event
      await expect(
        mailService.connect(addr2).rejectDelegation(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, ethers.ZeroAddress);
    });

    it("Should handle multiple delegations and rejections", async function () {
      // Fund addr3 for delegation
      await mockUSDC.mint(addr3.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr3).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      // Set delegation from addr3 to addr2
      await mailService.connect(addr3).delegateTo(addr2.address);
      
      // addr2 can reject delegation from addr1
      await expect(
        mailService.connect(addr2).rejectDelegation(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, ethers.ZeroAddress);
      
      // addr2 can also reject delegation from addr3
      await expect(
        mailService.connect(addr2).rejectDelegation(addr3.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr3.address, ethers.ZeroAddress);
    });
  });

  describe("Edge cases and security", function () {
    it("Should handle delegation updates correctly", async function () {
      // Fund addr1 for multiple delegation fees
      await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr1).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));

      // Set initial delegation
      await expect(
        mailService.connect(addr1).delegateTo(addr2.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, addr2.address);
      
      // Update delegation
      await expect(
        mailService.connect(addr1).delegateTo(addr3.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, addr3.address);
    });

    it("Should allow delegation from EOA addresses", async function () {
      // Fund owner with USDC for delegation fee
      await mockUSDC.mint(owner.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(owner).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      // EOA (Externally Owned Account) can now delegate
      await expect(
        mailService.connect(owner).delegateTo(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(owner.address, addr1.address);
    });
  });
});
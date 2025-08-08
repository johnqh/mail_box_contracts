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
    
    // Deploy MailService with USDC token only
    const MailService = await ethers.getContractFactory("MailService");
    mailService = await MailService.deploy(await mockUSDC.getAddress());
    await mailService.waitForDeployment();
    
  });

  describe("Contract setup", function () {
    it("Should set owner as deployer", async function () {
      expect(await mailService.owner()).to.equal(owner.address);
    });

    it("Should set USDC token address correctly", async function () {
      expect(await mailService.usdcToken()).to.equal(await mockUSDC.getAddress());
    });

    it("Should set correct default registration fee", async function () {
      expect(await mailService.registrationFee()).to.equal(100000000); // 100 USDC
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
      ).to.not.emit(mailService, "DelegationSet");
    });

    it("Should allow clearing delegation and charge fee", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      
      await expect(
        mailService.connect(addr1).delegateTo(ethers.ZeroAddress)
      ).to.emit(mailService, "DelegationCleared")
       .withArgs(addr1.address);
      
      // Verify fee was charged even for clearing
      const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      expect(finalBalance - initialBalance).to.equal(10000000); // 10 USDC
    });

    it("Should emit correct events for multiple delegations", async function () {
      // Fund more addresses
      await mockUSDC.mint(addr2.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr2).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      // Multiple delegations
      await expect(
        mailService.connect(addr1).delegateTo(addr2.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr1.address, addr2.address);
      
      await expect(
        mailService.connect(addr2).delegateTo(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(addr2.address, addr1.address);
    });

    it("Should have delegation fee setter for owner", async function () {
      await expect(
        mailService.connect(owner).setDelegationFee(20000000) // 20 USDC
      ).to.emit(mailService, "DelegationFeeUpdated")
       .withArgs(10000000, 20000000);
      
      expect(await mailService.getDelegationFee()).to.equal(20000000);
    });
  });


  describe("Domain registration", function () {
    // No beforeEach needed - tests will fund accounts individually as needed

    it("Should allow EOA to register a domain when funded", async function () {
      // Fund addr1 with USDC and approve
      await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr1).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      const tx = mailService.connect(addr1).registerDomain("example.com", false);
      const block = await ethers.provider.getBlock('latest');
      const expectedExpiration = BigInt(block!.timestamp + 1) + BigInt(365 * 24 * 60 * 60); // +1 for next block
      
      await expect(tx)
        .to.emit(mailService, "DomainRegistered")
        .withArgs("example.com", addr1.address, expectedExpiration);
    });

    it("Should allow addr2 to register a domain", async function () {
      // Fund addr2 with USDC and approve
      await mockUSDC.mint(addr2.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr2).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      const tx = mailService.connect(addr2).registerDomain("example.com", false);
      const block = await ethers.provider.getBlock('latest');
      const expectedExpiration = BigInt(block!.timestamp + 1) + BigInt(365 * 24 * 60 * 60); // +1 for next block
      
      await expect(tx)
      .to.emit(mailService, "DomainRegistered")
      .withArgs("example.com", addr2.address, expectedExpiration);
      
      // Note: Storage functions removed in event-only architecture
      // Domain registration is tracked via events only
    });

    it("Should revert when registering an empty domain", async function () {
      // Fund addr2 with USDC
      await mockUSDC.mint(addr2.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr2).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
      
      await expect(
        mailService.connect(addr2).registerDomain("", false)
      ).to.be.revertedWithCustomError(mailService, "EmptyDomain");
    });

    it("Should allow same owner to extend registration and allow different owners to also register", async function () {
      // Fund addr2 and addr3 with USDC
      await mockUSDC.mint(addr2.address, ethers.parseUnits("500", 6));
      await mockUSDC.connect(addr2).approve(await mailService.getAddress(), ethers.parseUnits("500", 6));
      await mockUSDC.mint(addr3.address, ethers.parseUnits("500", 6));
      await mockUSDC.connect(addr3).approve(await mailService.getAddress(), ethers.parseUnits("500", 6));
      
      // First registration should succeed  
      await mailService.connect(addr2).registerDomain("taken.com", false);
      
      // Same owner can re-register (extend) the domain
      await expect(
        mailService.connect(addr2).registerDomain("taken.com", true)
      ).to.emit(mailService, "DomainExtended");
      
      // Note: Storage functions removed - expiration tracking via events only
      
      // Different owner can also register - should succeed now
      await expect(
        mailService.connect(addr3).registerDomain("taken.com", false)
      ).to.emit(mailService, "DomainRegistered");
      
      // Note: Storage functions removed - multi-registration tracking via events only
    });




  });

  describe("Registration fee management", function () {
    describe("getRegistrationFee function", function () {
      it("Should return current registration fee", async function () {
        expect(await mailService.getRegistrationFee()).to.equal(100000000); // 100 USDC
      });

      it("Should return updated fee after change", async function () {
        await mailService.connect(owner).setRegistrationFee(200000000);
        expect(await mailService.getRegistrationFee()).to.equal(200000000);
      });
    });

    describe("setRegistrationFee function", function () {
      it("Should allow owner to update registration fee", async function () {
        const newFee = 200000000; // 200 USDC
        
        await expect(
          mailService.connect(owner).setRegistrationFee(newFee)
        ).to.emit(mailService, "RegistrationFeeUpdated")
         .withArgs(100000000, newFee);
        
        expect(await mailService.registrationFee()).to.equal(newFee);
      });

      it("Should revert when non-owner tries to set fee", async function () {
        await expect(
          mailService.connect(addr1).setRegistrationFee(200000000)
        ).to.be.revertedWithCustomError(mailService, "OnlyOwner");
      });

      it("Should allow setting fee to zero", async function () {
        await expect(
          mailService.connect(owner).setRegistrationFee(0)
        ).to.emit(mailService, "RegistrationFeeUpdated")
         .withArgs(100000000, 0);
        
        expect(await mailService.registrationFee()).to.equal(0);
      });

      it("Should emit correct event with old and new fee values", async function () {
        // First change
        await mailService.connect(owner).setRegistrationFee(150000000);
        
        // Second change should emit with correct old fee
        await expect(
          mailService.connect(owner).setRegistrationFee(250000000)
        ).to.emit(mailService, "RegistrationFeeUpdated")
         .withArgs(150000000, 250000000);
      });
    });

    describe("Fee integration with domain registration", function () {
      // No beforeEach needed - individual tests will fund accounts as needed

      it("Should transfer correct USDC amount on registration", async function () {
        // Fund addr2 with USDC
        await mockUSDC.mint(addr2.address, ethers.parseUnits("200", 6));
        await mockUSDC.connect(addr2).approve(await mailService.getAddress(), ethers.parseUnits("200", 6));
        
        const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        
        await mailService.connect(addr2).registerDomain("test.com", false);
        
        const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        expect(finalBalance - initialBalance).to.equal(100000000); // 100 USDC
      });

      it("Should use updated fee for registration", async function () {
        // Set a custom fee
        await mailService.connect(owner).setRegistrationFee(50000000); // 50 USDC
        
        // Fund addr3 with USDC
        await mockUSDC.mint(addr3.address, ethers.parseUnits("100", 6));
        await mockUSDC.connect(addr3).approve(await mailService.getAddress(), ethers.parseUnits("100", 6));
        
        const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        
        await mailService.connect(addr3).registerDomain("custom-fee.com", false);
        
        const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        expect(finalBalance - initialBalance).to.equal(50000000); // 50 USDC
      });

      it("Should fail when account has insufficient USDC balance", async function () {
        // Don't fund addr1 - it should have 0 USDC balance
        
        // No domain should be registered and no event emitted
        await expect(
          mailService.connect(addr1).registerDomain("expensive.com", false)
        ).to.not.emit(mailService, "DomainRegistered");
        
        // Note: Storage functions removed - registration tracking via events only
      });
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
      
      // Note: Storage functions removed - delegation tracking via events only
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
      
      // Note: Storage functions removed - delegation tracking via events only
    });
  });
});
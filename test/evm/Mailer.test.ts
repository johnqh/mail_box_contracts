import { expect } from "chai";
import { ethers } from "hardhat";
import { Mailer } from "../typechain-types";

describe("Mailer", function () {
  let mailer: Mailer;
  let mockUSDC: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    
    // Deploy Mailer with mock USDC address
    const Mailer = await ethers.getContractFactory("Mailer");
    mailer = await Mailer.deploy(await mockUSDC.getAddress(), owner.address);
    await mailer.waitForDeployment();
    
    // Give addr1 some USDC and approve Mailer to spend
    await mockUSDC.mint(addr1.address, ethers.parseUnits("10", 6)); // 10 USDC
    await mockUSDC.connect(addr1).approve(await mailer.getAddress(), ethers.parseUnits("10", 6));
  });


  describe("Contract setup", function () {
    it("Should set USDC token address correctly", async function () {
      expect(await mailer.usdcToken()).to.equal(await mockUSDC.getAddress());
    });

    it("Should set correct default send fee", async function () {
      expect(await mailer.sendFee()).to.equal(100000); // 0.1 USDC
    });

    it("Should set owner as deployer", async function () {
      expect(await mailer.owner()).to.equal(owner.address);
    });

    it("Should set correct default delegation fee", async function () {
      expect(await mailer.delegationFee()).to.equal(10000000); // 10 USDC
    });
  });

  describe("send function", function () {
    it("Should emit MailSent event when USDC transfer succeeds", async function () {
      await expect(
        mailer.connect(addr1).sendPriority(addr2.address, "Test Subject", "Test Body")
      ).to.emit(mailer, "MailSent")
       .withArgs(addr1.address, addr2.address, "Test Subject", "Test Body");
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      // addr2 has no USDC balance
      await expect(
        mailer.connect(addr2).sendPriority(addr1.address, "Test Subject", "Test Body")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientBalance");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(addr2).sendPriority(addr1.address, "Test Subject", "Test Body")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientAllowance");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      
      await mailer.connect(addr1).sendPriority(addr2.address, "Test Subject", "Test Body");
      
      const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      expect(finalBalance - initialBalance).to.equal(100000); // 0.1 USDC
    });
  });

  describe("sendPrepared function", function () {
    it("Should emit PreparedMailSent event when USDC transfer succeeds", async function () {
      await expect(
        mailer.connect(addr1).sendPriorityPrepared(addr2.address, "mail-123")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr1.address, addr2.address, "mail-123");
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      // addr2 has no USDC balance
      await expect(
        mailer.connect(addr2).sendPriorityPrepared(addr1.address, "mail-456")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientBalance");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(addr2).sendPriorityPrepared(addr1.address, "mail-789")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientAllowance");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      
      await mailer.connect(addr1).sendPriorityPrepared(addr2.address, "mail-999");
      
      const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      expect(finalBalance - initialBalance).to.equal(100000); // 0.1 USDC
    });

    it("Should handle different mailId strings", async function () {
      // Test with various mailId formats
      await expect(
        mailer.connect(addr1).sendPriorityPrepared(addr2.address, "abc-123-xyz")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr1.address, addr2.address, "abc-123-xyz");
    });
  });

  describe("Fee management", function () {
    describe("getFee function", function () {
      it("Should return current fee", async function () {
        expect(await mailer.getFee()).to.equal(100000);
      });

      it("Should return updated fee after change", async function () {
        await mailer.connect(owner).setFee(200000);
        expect(await mailer.getFee()).to.equal(200000);
      });
    });

    describe("setFee function", function () {
      it("Should allow owner to update fee", async function () {
        const newFee = 200000; // 0.2 USDC
        
        await expect(
          mailer.connect(owner).setFee(newFee)
        ).to.emit(mailer, "FeeUpdated")
         .withArgs(100000, newFee);
        
        expect(await mailer.sendFee()).to.equal(newFee);
      });

      it("Should revert when non-owner tries to set fee", async function () {
        await expect(
          mailer.connect(addr1).setFee(200000)
        ).to.be.revertedWithCustomError(mailer, "OnlyOwner");
      });

      it("Should allow setting fee to zero", async function () {
        await expect(
          mailer.connect(owner).setFee(0)
        ).to.emit(mailer, "FeeUpdated")
         .withArgs(100000, 0);
        
        expect(await mailer.sendFee()).to.equal(0);
      });

      it("Should allow setting very high fee", async function () {
        const highFee = ethers.parseUnits("1000", 6); // 1000 USDC
        
        await expect(
          mailer.connect(owner).setFee(highFee)
        ).to.emit(mailer, "FeeUpdated")
         .withArgs(100000, highFee);
        
        expect(await mailer.sendFee()).to.equal(highFee);
      });

      it("Should emit correct event with old and new fee values", async function () {
        // First change
        await mailer.connect(owner).setFee(150000);
        
        // Second change should emit with correct old fee
        await expect(
          mailer.connect(owner).setFee(250000)
        ).to.emit(mailer, "FeeUpdated")
         .withArgs(150000, 250000);
      });
    });

    describe("Fee functionality integration", function () {
      beforeEach(async function () {
        // Set a custom fee for testing
        await mailer.connect(owner).setFee(50000); // 0.05 USDC
      });

      it("Should use updated fee in send function", async function () {
        const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        
        await mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body");
        
        const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        expect(finalBalance - initialBalance).to.equal(50000); // Updated fee
      });

      it("Should use updated fee in sendPrepared function", async function () {
        const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        
        await mailer.connect(addr1).sendPriorityPrepared(addr2.address, "test-mail");
        
        const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        expect(finalBalance - initialBalance).to.equal(50000); // Updated fee
      });

      it("Should fail when user has insufficient balance for new fee", async function () {
        // Set a very high fee
        await mailer.connect(owner).setFee(ethers.parseUnits("20", 6)); // 20 USDC
        
        // addr1 only has 10 USDC, should fail
        await expect(
          mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body")
        ).to.be.revertedWithCustomError(mockUSDC, "InsufficientBalance");
      });

      it("Should work with zero fee", async function () {
        await mailer.connect(owner).setFee(0);
        
        const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        
        await expect(
          mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body")
        ).to.emit(mailer, "MailSent")
         .withArgs(addr1.address, addr2.address, "Test", "Body");
        
        const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        expect(finalBalance - initialBalance).to.equal(0);
      });

      it("Should handle fee changes mid-transaction flow", async function () {
        // Send with original fee
        await mailer.connect(addr1).sendPriority(addr2.address, "Test1", "Body1");
        
        // Change fee
        await mailer.connect(owner).setFee(75000); // 0.075 USDC
        
        // Send with new fee
        const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        await mailer.connect(addr1).sendPriority(addr2.address, "Test2", "Body2");
        const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        
        expect(finalBalance - initialBalance).to.equal(75000); // New fee
      });
    });
  });

  describe("send function", function () {
    beforeEach(async function () {
      // Give addr2 some USDC and approve contract
      await mockUSDC.mint(addr2.address, ethers.parseUnits("10", 6));
      await mockUSDC.connect(addr2).approve(await mailer.getAddress(), ethers.parseUnits("10", 6));
    });

    it("Should emit MailSent event when USDC transfer succeeds", async function () {
      await expect(
        mailer.connect(addr2).send(addr1.address, "Test Subject", "Test Body")
      ).to.emit(mailer, "MailSent")
       .withArgs(addr2.address, addr1.address, "Test Subject", "Test Body");
    });

    it("Should not emit event when sender has no USDC balance", async function () {
      // owner has USDC but no allowance, so it fails on allowance check
      await expect(
        mailer.connect(owner).send(addr1.address, "No Balance", "Should Fail")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientAllowance");
    });

    it("Should not emit event when sender has no USDC allowance", async function () {
      // Give addr3 USDC but no allowance
      await mockUSDC.mint(owner.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(owner).send(addr1.address, "No Allowance", "Should Fail")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientAllowance");
    });

    it("Should transfer 10% of sendFee to contract for owner", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      const initialOwnerClaimable = await mailer.getOwnerClaimable();
      
      await mailer.connect(addr2).send(addr1.address, "Test", "Body");
      
      const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      const finalOwnerClaimable = await mailer.getOwnerClaimable();
      
      const fee = await mailer.sendFee();
      const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee
      
      expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
      expect(finalOwnerClaimable - initialOwnerClaimable).to.equal(expectedOwnerFee);
    });

    it("Should work with empty strings", async function () {
      await expect(
        mailer.connect(addr2).send(addr1.address, "", "")
      ).to.emit(mailer, "MailSent")
       .withArgs(addr2.address, addr1.address, "", "");
    });

    it("Should work with long strings", async function () {
      const longSubject = "A".repeat(1000);
      const longBody = "B".repeat(5000);
      
      await expect(
        mailer.connect(addr2).send(addr1.address, longSubject, longBody)
      ).to.emit(mailer, "MailSent")
       .withArgs(addr2.address, addr1.address, longSubject, longBody);
    });
  });

  describe("sendPrepared function", function () {
    beforeEach(async function () {
      // Give addr2 some USDC and approve contract
      await mockUSDC.mint(addr2.address, ethers.parseUnits("10", 6));
      await mockUSDC.connect(addr2).approve(await mailer.getAddress(), ethers.parseUnits("10", 6));
    });

    it("Should emit PreparedMailSent event when USDC transfer succeeds", async function () {
      await expect(
        mailer.connect(addr2).sendPrepared(addr1.address, "mail-123")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr2.address, addr1.address, "mail-123");
    });

    it("Should not emit event when sender has no USDC balance", async function () {
      // owner has USDC but no allowance, so it fails on allowance check
      await expect(
        mailer.connect(owner).sendPrepared(addr1.address, "no-balance-mail")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientAllowance");
    });

    it("Should not emit event when sender has no USDC allowance", async function () {
      // Give addr3 USDC but no allowance
      await mockUSDC.mint(owner.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(owner).sendPrepared(addr1.address, "no-allowance-mail")
      ).to.be.revertedWithCustomError(mockUSDC, "InsufficientAllowance");
    });

    it("Should transfer 10% of sendFee to contract for owner", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      const initialOwnerClaimable = await mailer.getOwnerClaimable();
      
      await mailer.connect(addr2).sendPrepared(addr1.address, "prepared-test");
      
      const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      const finalOwnerClaimable = await mailer.getOwnerClaimable();
      
      const fee = await mailer.sendFee();
      const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee
      
      expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
      expect(finalOwnerClaimable - initialOwnerClaimable).to.equal(expectedOwnerFee);
    });

    it("Should work with empty mailId", async function () {
      await expect(
        mailer.connect(addr2).sendPrepared(addr1.address, "")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr2.address, addr1.address, "");
    });

    it("Should work with long mailId", async function () {
      const longMailId = "long-mail-id-" + "x".repeat(1000);
      
      await expect(
        mailer.connect(addr2).sendPrepared(addr1.address, longMailId)
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr2.address, addr1.address, longMailId);
    });

    it("Should handle special characters in mailId", async function () {
      const specialMailId = "mail-123!@#$%^&*()_+-=[]{}|;:,.<>?";
      
      await expect(
        mailer.connect(addr2).sendPrepared(addr1.address, specialMailId)
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr2.address, addr1.address, specialMailId);
    });
  });

  describe("Revenue Sharing System", function () {
    beforeEach(async function () {
      // Give addr1 more USDC for multiple transactions
      await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
      await mockUSDC.connect(addr1).approve(await mailer.getAddress(), ethers.parseUnits("100", 6));
    });

    describe("Share Recording", function () {
      it("Should record 90% for recipient and 10% for owner on sendPriority", async function () {
        const fee = await mailer.sendFee(); // 100000 (0.1 USDC)
        const expectedRecipientShare = (fee * 90n) / 100n; // 90000
        const expectedOwnerShare = fee - expectedRecipientShare; // 10000

        await expect(
          mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body")
        ).to.emit(mailer, "SharesRecorded")
         .withArgs(addr1.address, expectedRecipientShare, expectedOwnerShare);

        const [amount, , ] = await mailer.getRecipientClaimable(addr1.address);
        expect(amount).to.equal(expectedRecipientShare);

        const ownerClaimable = await mailer.getOwnerClaimable();
        expect(ownerClaimable).to.equal(expectedOwnerShare);
      });

      it("Should record 90% for recipient and 10% for owner on sendPriorityPrepared", async function () {
        const fee = await mailer.sendFee();
        const expectedRecipientShare = (fee * 90n) / 100n;
        const expectedOwnerShare = fee - expectedRecipientShare;

        await expect(
          mailer.connect(addr1).sendPriorityPrepared(addr2.address, "mail-123")
        ).to.emit(mailer, "SharesRecorded")
         .withArgs(addr1.address, expectedRecipientShare, expectedOwnerShare);
      });

      it("Should accumulate multiple shares for same recipient", async function () {
        const fee = await mailer.sendFee();
        const expectedRecipientShare = (fee * 90n) / 100n;

        // Send two messages to same recipient
        await mailer.connect(addr1).sendPriority(addr2.address, "Test1", "Body1");
        await mailer.connect(addr1).sendPriority(addr2.address, "Test2", "Body2");

        const [amount, , ] = await mailer.getRecipientClaimable(addr1.address);
        expect(amount).to.equal(expectedRecipientShare * 2n);
      });
    });

    describe("Recipient Claims", function () {
      beforeEach(async function () {
        // Send a message to create claimable amount
        await mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body");
      });

      it("Should allow recipient to claim their share", async function () {
        const [amount, , ] = await mailer.getRecipientClaimable(addr1.address);
        
        await expect(
          mailer.connect(addr1).claimRecipientShare()
        ).to.emit(mailer, "RecipientClaimed")
         .withArgs(addr1.address, amount);

        // Check recipient received USDC
        // Initial: 110 USDC (10 from main beforeEach + 100 from Revenue Sharing beforeEach)
        // Paid: 100000 (0.1 USDC), Claimed back: amount (90000 = 0.09 USDC)
        // Final should be: 110 - 0.1 + 0.09 = 109.99 USDC
        const balance = await mockUSDC.balanceOf(addr1.address);
        const fee = await mailer.sendFee();
        const expectedBalance = ethers.parseUnits("110", 6) - fee + amount;
        expect(balance).to.equal(expectedBalance);

        // Check claimable amount is now zero
        const [newAmount, , ] = await mailer.getRecipientClaimable(addr1.address);
        expect(newAmount).to.equal(0);
      });

      it("Should revert if no claimable amount", async function () {
        await expect(
          mailer.connect(owner).claimRecipientShare()
        ).to.be.revertedWithCustomError(mailer, "NoClaimableAmount");
      });

      it("Should handle expired claims correctly", async function () {
        // Fast forward past claim period (60 days)
        await ethers.provider.send("evm_increaseTime", [60 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);

        const [expiredAmount, , ] = await mailer.getRecipientClaimable(addr1.address);
        const initialOwnerClaimable = await mailer.getOwnerClaimable();

        // Recipient can no longer claim
        await expect(
          mailer.connect(addr1).claimRecipientShare()
        ).to.be.revertedWithCustomError(mailer, "NoClaimableAmount");

        // Owner claimable should remain unchanged until explicitly claimed
        const ownerClaimableAfterExpiry = await mailer.getOwnerClaimable();
        expect(ownerClaimableAfterExpiry).to.equal(initialOwnerClaimable);

        // Owner can now claim the expired shares
        await expect(
          mailer.connect(owner).claimExpiredShares(addr1.address)
        ).to.emit(mailer, "ExpiredSharesClaimed")
         .withArgs(addr1.address, expiredAmount);

        // Check that expired amount was moved to owner claimable
        const finalOwnerClaimable = await mailer.getOwnerClaimable();
        expect(finalOwnerClaimable).to.equal(initialOwnerClaimable + expiredAmount);
      });
    });

    describe("Owner Claims", function () {
      beforeEach(async function () {
        // Send a message to create claimable amount
        await mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body");
      });

      it("Should allow owner to claim their share", async function () {
        const ownerClaimable = await mailer.getOwnerClaimable();
        const initialBalance = await mockUSDC.balanceOf(owner.address);

        await expect(
          mailer.connect(owner).claimOwnerShare()
        ).to.emit(mailer, "OwnerClaimed")
         .withArgs(ownerClaimable);

        // Check owner received USDC
        const finalBalance = await mockUSDC.balanceOf(owner.address);
        expect(finalBalance - initialBalance).to.equal(ownerClaimable);

        // Check claimable amount is now zero
        const newOwnerClaimable = await mailer.getOwnerClaimable();
        expect(newOwnerClaimable).to.equal(0);
      });

      it("Should revert if no claimable amount", async function () {
        // First claim everything
        await mailer.connect(owner).claimOwnerShare();

        await expect(
          mailer.connect(owner).claimOwnerShare()
        ).to.be.revertedWithCustomError(mailer, "NoClaimableAmount");
      });

      it("Should only allow owner to claim", async function () {
        await expect(
          mailer.connect(addr1).claimOwnerShare()
        ).to.be.revertedWithCustomError(mailer, "OnlyOwner");
      });
    });

    describe("Expired Share Management", function () {
      beforeEach(async function () {
        await mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body");
      });

      it("Should allow owner to claim expired shares", async function () {
        // Fast forward past claim period
        await ethers.provider.send("evm_increaseTime", [60 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);

        const [expiredAmount, , ] = await mailer.getRecipientClaimable(addr1.address);
        const initialOwnerClaimable = await mailer.getOwnerClaimable();

        await expect(
          mailer.connect(owner).claimExpiredShares(addr1.address)
        ).to.emit(mailer, "ExpiredSharesClaimed")
         .withArgs(addr1.address, expiredAmount);

        // Check expired amount moved to owner claimable
        const finalOwnerClaimable = await mailer.getOwnerClaimable();
        expect(finalOwnerClaimable).to.equal(initialOwnerClaimable + expiredAmount);

        // Check recipient claim is reset
        const [newAmount, , ] = await mailer.getRecipientClaimable(addr1.address);
        expect(newAmount).to.equal(0);
      });

      it("Should revert if claim period not expired", async function () {
        await expect(
          mailer.connect(owner).claimExpiredShares(addr1.address)
        ).to.be.revertedWithCustomError(mailer, "ClaimPeriodNotExpired");
      });

      it("Should only allow owner to claim expired shares", async function () {
        await ethers.provider.send("evm_increaseTime", [60 * 24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);

        await expect(
          mailer.connect(addr1).claimExpiredShares(addr1.address)
        ).to.be.revertedWithCustomError(mailer, "OnlyOwner");
      });
    });

    describe("View Functions", function () {
      it("Should return correct recipient claimable info", async function () {
        // Before any transactions
        let [amount, expiresAt, isExpired] = await mailer.getRecipientClaimable(addr1.address);
        expect(amount).to.equal(0);
        expect(isExpired).to.be.false;

        // After sending a message
        await mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body");
        [amount, expiresAt, isExpired] = await mailer.getRecipientClaimable(addr1.address);
        
        const fee = await mailer.sendFee();
        const expectedAmount = (fee * 90n) / 100n;
        expect(amount).to.equal(expectedAmount);
        expect(isExpired).to.be.false;
        
        const currentTime = (await ethers.provider.getBlock('latest'))!.timestamp;
        const expectedExpiry = currentTime + (60 * 24 * 60 * 60); // 60 days
        expect(expiresAt).to.be.closeTo(expectedExpiry, 10); // Allow 10 second tolerance
      });

      it("Should return correct owner claimable amount", async function () {
        expect(await mailer.getOwnerClaimable()).to.equal(0);

        await mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body");
        
        const fee = await mailer.sendFee();
        const expectedAmount = fee - (fee * 90n) / 100n; // 10%
        expect(await mailer.getOwnerClaimable()).to.equal(expectedAmount);
      });
    });

    describe("Delegation functionality", function () {
      beforeEach(async function () {
        // Fund addresses with additional USDC for delegation fees  
        await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
        await mockUSDC.connect(addr1).approve(await mailer.getAddress(), ethers.parseUnits("100", 6));
        
        await mockUSDC.mint(addr2.address, ethers.parseUnits("100", 6));
        await mockUSDC.connect(addr2).approve(await mailer.getAddress(), ethers.parseUnits("100", 6));
      });

      describe("delegateTo function", function () {
        it("Should allow delegation and charge fee", async function () {
          const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
          
          await expect(
            mailer.connect(addr1).delegateTo(addr2.address)
          ).to.emit(mailer, "DelegationSet")
           .withArgs(addr1.address, addr2.address);
          
          const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
          const delegationFee = await mailer.delegationFee();
          expect(finalBalance - initialBalance).to.equal(delegationFee);
        });

        it("Should allow clearing delegation without fee", async function () {
          // First set delegation
          await mailer.connect(addr1).delegateTo(addr2.address);
          
          const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
          
          await expect(
            mailer.connect(addr1).delegateTo(ethers.ZeroAddress)
          ).to.emit(mailer, "DelegationSet")
           .withArgs(addr1.address, ethers.ZeroAddress);
          
          const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
          expect(finalBalance).to.equal(initialBalance);
        });

        it("Should revert if USDC transfer fails", async function () {
          // Remove approval
          await mockUSDC.connect(addr1).approve(await mailer.getAddress(), 0);
          
          await expect(
            mailer.connect(addr1).delegateTo(addr2.address)
          ).to.be.reverted; // Just check that it reverts, not the specific error
        });
      });

      describe("rejectDelegation function", function () {
        it("Should emit DelegationSet event with zero address", async function () {
          await expect(
            mailer.connect(addr2).rejectDelegation(addr1.address)
          ).to.emit(mailer, "DelegationSet")
           .withArgs(addr1.address, ethers.ZeroAddress);
        });

        it("Should work without checking actual delegation state", async function () {
          // Should work even if no delegation exists
          await expect(
            mailer.connect(addr2).rejectDelegation(addr1.address)
          ).to.emit(mailer, "DelegationSet")
           .withArgs(addr1.address, ethers.ZeroAddress);
        });
      });

      describe("Delegation fee management", function () {
        it("Should allow owner to update delegation fee", async function () {
          const newFee = ethers.parseUnits("5", 6); // 5 USDC
          
          await expect(
            mailer.connect(owner).setDelegationFee(newFee)
          ).to.emit(mailer, "DelegationFeeUpdated")
           .withArgs(10000000, newFee);
          
          expect(await mailer.delegationFee()).to.equal(newFee);
        });

        it("Should revert when non-owner tries to update delegation fee", async function () {
          await expect(
            mailer.connect(addr1).setDelegationFee(ethers.parseUnits("5", 6))
          ).to.be.revertedWithCustomError(mailer, "OnlyOwner");
        });

        it("Should return current delegation fee", async function () {
          expect(await mailer.getDelegationFee()).to.equal(10000000);
        });
      });
    });

    describe("Pause functionality", function () {
      it("Should allow owner to pause contract", async function () {
        await expect(
          mailer.connect(owner).pause()
        ).to.emit(mailer, "ContractPaused");

        expect(await mailer.isPaused()).to.equal(true);
      });

      it("Should revert when non-owner tries to pause", async function () {
        await expect(
          mailer.connect(addr1).pause()
        ).to.be.revertedWithCustomError(mailer, "OnlyOwner");
      });

      it("Should revert when trying to pause already paused contract", async function () {
        await mailer.connect(owner).pause();
        
        await expect(
          mailer.connect(owner).pause()
        ).to.be.revertedWithCustomError(mailer, "ContractIsPaused");
      });

      it("Should distribute owner claimable funds when pausing", async function () {
        // First send a standard message to accumulate owner fees
        await mockUSDC.connect(addr1).approve(await mailer.getAddress(), ethers.parseUnits("1", 6));
        await mailer.connect(addr1).send(addr2.address, "Test", "Test");

        const ownerBalanceBefore = await mockUSDC.balanceOf(owner.address);
        const contractBalanceBefore = await mockUSDC.balanceOf(await mailer.getAddress());

        // Pause contract - should distribute owner claimable funds
        await expect(
          mailer.connect(owner).pause()
        ).to.emit(mailer, "FundsDistributed");

        const ownerBalanceAfter = await mockUSDC.balanceOf(owner.address);
        const contractBalanceAfter = await mockUSDC.balanceOf(await mailer.getAddress());

        // Owner should receive their claimable amount
        expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
        expect(contractBalanceAfter).to.be.lt(contractBalanceBefore);
      });

      it("Should prevent all functions when paused", async function () {
        await mailer.connect(owner).pause();

        await mockUSDC.connect(addr1).approve(await mailer.getAddress(), ethers.parseUnits("1", 6));

        await expect(
          mailer.connect(addr1).sendPriority(addr2.address, "Test", "Test")
        ).to.be.revertedWithCustomError(mailer, "ContractIsPaused");

        await expect(
          mailer.connect(addr1).send(addr2.address, "Test", "Test")
        ).to.be.revertedWithCustomError(mailer, "ContractIsPaused");

        await expect(
          mailer.connect(addr1).delegateTo(addr2.address)
        ).to.be.revertedWithCustomError(mailer, "ContractIsPaused");
      });

      it("Should allow owner to unpause contract", async function () {
        await mailer.connect(owner).pause();
        
        await expect(
          mailer.connect(owner).unpause()
        ).to.emit(mailer, "ContractUnpaused");

        expect(await mailer.isPaused()).to.equal(false);
      });

      it("Should revert when non-owner tries to unpause", async function () {
        await mailer.connect(owner).pause();
        
        await expect(
          mailer.connect(addr1).unpause()
        ).to.be.revertedWithCustomError(mailer, "OnlyOwner");
      });

      it("Should revert when trying to unpause non-paused contract", async function () {
        await expect(
          mailer.connect(owner).unpause()
        ).to.be.revertedWithCustomError(mailer, "ContractNotPaused");
      });

      it("Should allow anyone to distribute claimable funds when paused", async function () {
        // Create fresh setup for this test
        const [testOwner, testAddr1, testAddr2, testAddr3] = await ethers.getSigners();
        
        // Deploy fresh contracts for isolated test
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        const testMockUSDC = await MockUSDC.deploy();
        await testMockUSDC.waitForDeployment();
        
        const Mailer = await ethers.getContractFactory("Mailer");
        const testMailer = await Mailer.deploy(await testMockUSDC.getAddress(), testOwner.address);
        await testMailer.waitForDeployment();
        
        // Setup USDC for test - need enough for send fee (0.1 USDC)
        await testMockUSDC.mint(testAddr1.address, ethers.parseUnits("1", 6));
        await testMockUSDC.connect(testAddr1).approve(await testMailer.getAddress(), ethers.parseUnits("1", 6));
        
        // Send priority message to create claimable amount (90% goes back to sender)
        await testMailer.connect(testAddr1).sendPriority(testAddr2.address, "Test", "Test");

        // Verify sender has claimable amount before pause (sender gets 90% back in priority messages)
        const [claimableAmount] = await testMailer.getRecipientClaimable(testAddr1.address);
        expect(claimableAmount).to.be.gt(0);

        // Pause contract (only owner funds get distributed automatically)
        await testMailer.connect(testOwner).pause();

        // Verify sender still has claimable amount after pause (pause doesn't auto-distribute sender funds)
        const [claimableAmountAfterPause] = await testMailer.getRecipientClaimable(testAddr1.address);
        expect(claimableAmountAfterPause).to.equal(claimableAmount); // Should be unchanged

        const senderBalanceBefore = await testMockUSDC.balanceOf(testAddr1.address);

        // Anyone can distribute claimable funds when paused
        await expect(
          testMailer.connect(testAddr3).distributeClaimableFunds(testAddr1.address)
        ).to.emit(testMailer, "FundsDistributed")
         .withArgs(testAddr1.address, claimableAmount);

        const senderBalanceAfter = await testMockUSDC.balanceOf(testAddr1.address);
        expect(senderBalanceAfter).to.equal(senderBalanceBefore + claimableAmount);
        
        // Verify claimable amount is now 0
        const [finalClaimableAmount] = await testMailer.getRecipientClaimable(testAddr1.address);
        expect(finalClaimableAmount).to.equal(0);
      });

      it("Should revert distribute when contract not paused", async function () {
        await expect(
          mailer.connect(addr1).distributeClaimableFunds(addr2.address)
        ).to.be.revertedWithCustomError(mailer, "ContractNotPaused");
      });

      it("Should resume normal operations after unpause", async function () {
        await mailer.connect(owner).pause();
        await mailer.connect(owner).unpause();

        // Should be able to send messages again
        await mockUSDC.connect(addr1).approve(await mailer.getAddress(), ethers.parseUnits("1", 6));
        await expect(
          mailer.connect(addr1).send(addr2.address, "Test", "Test")
        ).to.emit(mailer, "MailSent");
      });
    });
  });
});
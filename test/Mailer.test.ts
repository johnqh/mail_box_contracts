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
      ).to.not.emit(mailer, "MailSent");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(addr2).sendPriority(addr1.address, "Test Subject", "Test Body")
      ).to.not.emit(mailer, "MailSent");
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
        mailer.connect(addr1).sendPriorityPrepared("mail-123")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr1.address, "mail-123");
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      // addr2 has no USDC balance
      await expect(
        mailer.connect(addr2).sendPriorityPrepared("mail-456")
      ).to.not.emit(mailer, "PreparedMailSent");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(addr2).sendPriorityPrepared("mail-789")
      ).to.not.emit(mailer, "PreparedMailSent");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      
      await mailer.connect(addr1).sendPriorityPrepared("mail-999");
      
      const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      expect(finalBalance - initialBalance).to.equal(100000); // 0.1 USDC
    });

    it("Should handle different mailId strings", async function () {
      // Test with various mailId formats
      await expect(
        mailer.connect(addr1).sendPriorityPrepared("abc-123-xyz")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr1.address, "abc-123-xyz");
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
        
        await mailer.connect(addr1).sendPriorityPrepared("test-mail");
        
        const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
        expect(finalBalance - initialBalance).to.equal(50000); // Updated fee
      });

      it("Should fail when user has insufficient balance for new fee", async function () {
        // Set a very high fee
        await mailer.connect(owner).setFee(ethers.parseUnits("20", 6)); // 20 USDC
        
        // addr1 only has 10 USDC, should fail
        await expect(
          mailer.connect(addr1).sendPriority(addr2.address, "Test", "Body")
        ).to.not.emit(mailer, "MailSent");
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

  describe("sendFree function", function () {
    it("Should emit MailSent event without requiring USDC", async function () {
      await expect(
        mailer.connect(addr2).sendFree(addr1.address, "Free Subject", "Free Body")
      ).to.emit(mailer, "MailSent")
       .withArgs(addr2.address, addr1.address, "Free Subject", "Free Body");
    });

    it("Should work even when sender has no USDC balance", async function () {
      // addr2 has no USDC balance by default
      await expect(
        mailer.connect(addr2).sendFree(addr1.address, "No Balance", "Still Works")
      ).to.emit(mailer, "MailSent")
       .withArgs(addr2.address, addr1.address, "No Balance", "Still Works");
    });

    it("Should work even when sender has no USDC allowance", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(addr2).sendFree(addr1.address, "No Allowance", "Still Works")
      ).to.emit(mailer, "MailSent")
       .withArgs(addr2.address, addr1.address, "No Allowance", "Still Works");
    });

    it("Should not transfer any USDC to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      
      await mailer.connect(addr1).sendFree(addr2.address, "Free Test", "Free Body");
      
      const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      expect(finalBalance - initialBalance).to.equal(0); // No USDC transferred
    });

    it("Should work with empty strings", async function () {
      await expect(
        mailer.connect(addr1).sendFree(addr2.address, "", "")
      ).to.emit(mailer, "MailSent")
       .withArgs(addr1.address, addr2.address, "", "");
    });

    it("Should work with long strings", async function () {
      const longSubject = "A".repeat(1000);
      const longBody = "B".repeat(5000);
      
      await expect(
        mailer.connect(addr1).sendFree(addr2.address, longSubject, longBody)
      ).to.emit(mailer, "MailSent")
       .withArgs(addr1.address, addr2.address, longSubject, longBody);
    });
  });

  describe("sendFreePrepared function", function () {
    it("Should emit PreparedMailSent event without requiring USDC", async function () {
      await expect(
        mailer.connect(addr2).sendFreePrepared("free-mail-123")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr2.address, "free-mail-123");
    });

    it("Should work even when sender has no USDC balance", async function () {
      // addr2 has no USDC balance by default
      await expect(
        mailer.connect(addr2).sendFreePrepared("no-balance-mail")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr2.address, "no-balance-mail");
    });

    it("Should work even when sender has no USDC allowance", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        mailer.connect(addr2).sendFreePrepared("no-allowance-mail")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr2.address, "no-allowance-mail");
    });

    it("Should not transfer any USDC to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      
      await mailer.connect(addr1).sendFreePrepared("free-prepared-test");
      
      const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
      expect(finalBalance - initialBalance).to.equal(0); // No USDC transferred
    });

    it("Should work with empty mailId", async function () {
      await expect(
        mailer.connect(addr1).sendFreePrepared("")
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr1.address, "");
    });

    it("Should work with long mailId", async function () {
      const longMailId = "long-mail-id-" + "x".repeat(1000);
      
      await expect(
        mailer.connect(addr1).sendFreePrepared(longMailId)
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr1.address, longMailId);
    });

    it("Should handle special characters in mailId", async function () {
      const specialMailId = "mail-123!@#$%^&*()_+-=[]{}|;:,.<>?";
      
      await expect(
        mailer.connect(addr1).sendFreePrepared(specialMailId)
      ).to.emit(mailer, "PreparedMailSent")
       .withArgs(addr1.address, specialMailId);
    });
  });
});
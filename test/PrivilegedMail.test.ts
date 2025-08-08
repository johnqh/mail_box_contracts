import { expect } from "chai";
import { ethers } from "hardhat";
import { PrivilegedMail } from "../typechain-types";

describe("PrivilegedMail", function () {
  let privilegedMail: PrivilegedMail;
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
    
    // Deploy PrivilegedMail with mock USDC address
    const PrivilegedMail = await ethers.getContractFactory("PrivilegedMail");
    privilegedMail = await PrivilegedMail.deploy(await mockUSDC.getAddress());
    await privilegedMail.waitForDeployment();
    
    // Give addr1 some USDC and approve PrivilegedMail to spend
    await mockUSDC.mint(addr1.address, ethers.parseUnits("10", 6)); // 10 USDC
    await mockUSDC.connect(addr1).approve(await privilegedMail.getAddress(), ethers.parseUnits("10", 6));
  });


  describe("Contract setup", function () {
    it("Should set USDC token address correctly", async function () {
      expect(await privilegedMail.usdcToken()).to.equal(await mockUSDC.getAddress());
    });

    it("Should set correct default send fee", async function () {
      expect(await privilegedMail.sendFee()).to.equal(100000); // 0.1 USDC
    });

    it("Should set owner as deployer", async function () {
      expect(await privilegedMail.owner()).to.equal(owner.address);
    });
  });

  describe("send function", function () {
    it("Should emit MailSent event when USDC transfer succeeds", async function () {
      await expect(
        privilegedMail.connect(addr1).send(addr2.address, "Test Subject", "Test Body")
      ).to.emit(privilegedMail, "MailSent")
       .withArgs(addr1.address, addr2.address, "Test Subject", "Test Body");
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      // addr2 has no USDC balance
      await expect(
        privilegedMail.connect(addr2).send(addr1.address, "Test Subject", "Test Body")
      ).to.not.emit(privilegedMail, "MailSent");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        privilegedMail.connect(addr2).send(addr1.address, "Test Subject", "Test Body")
      ).to.not.emit(privilegedMail, "MailSent");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
      
      await privilegedMail.connect(addr1).send(addr2.address, "Test Subject", "Test Body");
      
      const finalBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
      expect(finalBalance - initialBalance).to.equal(100000); // 0.1 USDC
    });
  });

  describe("sendPrepared function", function () {
    it("Should emit PreparedMailSent event when USDC transfer succeeds", async function () {
      await expect(
        privilegedMail.connect(addr1).sendPrepared("mail-123")
      ).to.emit(privilegedMail, "PreparedMailSent")
       .withArgs(addr1.address, "mail-123");
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      // addr2 has no USDC balance
      await expect(
        privilegedMail.connect(addr2).sendPrepared("mail-456")
      ).to.not.emit(privilegedMail, "PreparedMailSent");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        privilegedMail.connect(addr2).sendPrepared("mail-789")
      ).to.not.emit(privilegedMail, "PreparedMailSent");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
      
      await privilegedMail.connect(addr1).sendPrepared("mail-999");
      
      const finalBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
      expect(finalBalance - initialBalance).to.equal(100000); // 0.1 USDC
    });

    it("Should handle different mailId strings", async function () {
      // Test with various mailId formats
      await expect(
        privilegedMail.connect(addr1).sendPrepared("abc-123-xyz")
      ).to.emit(privilegedMail, "PreparedMailSent")
       .withArgs(addr1.address, "abc-123-xyz");
    });
  });

  describe("Fee management", function () {
    describe("getFee function", function () {
      it("Should return current fee", async function () {
        expect(await privilegedMail.getFee()).to.equal(100000);
      });

      it("Should return updated fee after change", async function () {
        await privilegedMail.connect(owner).setFee(200000);
        expect(await privilegedMail.getFee()).to.equal(200000);
      });
    });

    describe("setFee function", function () {
      it("Should allow owner to update fee", async function () {
        const newFee = 200000; // 0.2 USDC
        
        await expect(
          privilegedMail.connect(owner).setFee(newFee)
        ).to.emit(privilegedMail, "FeeUpdated")
         .withArgs(100000, newFee);
        
        expect(await privilegedMail.sendFee()).to.equal(newFee);
      });

      it("Should revert when non-owner tries to set fee", async function () {
        await expect(
          privilegedMail.connect(addr1).setFee(200000)
        ).to.be.revertedWithCustomError(privilegedMail, "OnlyOwner");
      });

      it("Should allow setting fee to zero", async function () {
        await expect(
          privilegedMail.connect(owner).setFee(0)
        ).to.emit(privilegedMail, "FeeUpdated")
         .withArgs(100000, 0);
        
        expect(await privilegedMail.sendFee()).to.equal(0);
      });

      it("Should allow setting very high fee", async function () {
        const highFee = ethers.parseUnits("1000", 6); // 1000 USDC
        
        await expect(
          privilegedMail.connect(owner).setFee(highFee)
        ).to.emit(privilegedMail, "FeeUpdated")
         .withArgs(100000, highFee);
        
        expect(await privilegedMail.sendFee()).to.equal(highFee);
      });

      it("Should emit correct event with old and new fee values", async function () {
        // First change
        await privilegedMail.connect(owner).setFee(150000);
        
        // Second change should emit with correct old fee
        await expect(
          privilegedMail.connect(owner).setFee(250000)
        ).to.emit(privilegedMail, "FeeUpdated")
         .withArgs(150000, 250000);
      });
    });

    describe("Fee functionality integration", function () {
      beforeEach(async function () {
        // Set a custom fee for testing
        await privilegedMail.connect(owner).setFee(50000); // 0.05 USDC
      });

      it("Should use updated fee in send function", async function () {
        const initialBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        
        await privilegedMail.connect(addr1).send(addr2.address, "Test", "Body");
        
        const finalBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        expect(finalBalance - initialBalance).to.equal(50000); // Updated fee
      });

      it("Should use updated fee in sendPrepared function", async function () {
        const initialBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        
        await privilegedMail.connect(addr1).sendPrepared("test-mail");
        
        const finalBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        expect(finalBalance - initialBalance).to.equal(50000); // Updated fee
      });

      it("Should fail when user has insufficient balance for new fee", async function () {
        // Set a very high fee
        await privilegedMail.connect(owner).setFee(ethers.parseUnits("20", 6)); // 20 USDC
        
        // addr1 only has 10 USDC, should fail
        await expect(
          privilegedMail.connect(addr1).send(addr2.address, "Test", "Body")
        ).to.not.emit(privilegedMail, "MailSent");
      });

      it("Should work with zero fee", async function () {
        await privilegedMail.connect(owner).setFee(0);
        
        const initialBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        
        await expect(
          privilegedMail.connect(addr1).send(addr2.address, "Test", "Body")
        ).to.emit(privilegedMail, "MailSent")
         .withArgs(addr1.address, addr2.address, "Test", "Body");
        
        const finalBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        expect(finalBalance - initialBalance).to.equal(0);
      });

      it("Should handle fee changes mid-transaction flow", async function () {
        // Send with original fee
        await privilegedMail.connect(addr1).send(addr2.address, "Test1", "Body1");
        
        // Change fee
        await privilegedMail.connect(owner).setFee(75000); // 0.075 USDC
        
        // Send with new fee
        const initialBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        await privilegedMail.connect(addr1).send(addr2.address, "Test2", "Body2");
        const finalBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
        
        expect(finalBalance - initialBalance).to.equal(75000); // New fee
      });
    });
  });
});
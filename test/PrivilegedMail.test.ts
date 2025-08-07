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

    it("Should set correct send fee", async function () {
      expect(await privilegedMail.SEND_FEE()).to.equal(100000); // 0.1 USDC
    });
  });

  describe("send function", function () {
    it("Should emit MailSent event when USDC transfer succeeds", async function () {
      await expect(
        privilegedMail.send(addr1.address, addr2.address, "Test Subject", "Test Body")
      ).to.emit(privilegedMail, "MailSent")
       .withArgs(addr1.address, addr2.address, "Test Subject", "Test Body");
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      // addr2 has no USDC balance
      await expect(
        privilegedMail.send(addr2.address, addr1.address, "Test Subject", "Test Body")
      ).to.not.emit(privilegedMail, "MailSent");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      // Give addr2 USDC but no allowance
      await mockUSDC.mint(addr2.address, ethers.parseUnits("1", 6));
      
      await expect(
        privilegedMail.send(addr2.address, addr1.address, "Test Subject", "Test Body")
      ).to.not.emit(privilegedMail, "MailSent");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const initialBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
      
      await privilegedMail.send(addr1.address, addr2.address, "Test Subject", "Test Body");
      
      const finalBalance = await mockUSDC.balanceOf(await privilegedMail.getAddress());
      expect(finalBalance - initialBalance).to.equal(100000); // 0.1 USDC
    });
  });
});
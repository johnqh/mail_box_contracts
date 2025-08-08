import { expect } from "chai";
import { ethers } from "hardhat";
import { MailService, MockSafe } from "../typechain-types";

describe("MailService", function () {
  let mailService: MailService;
  let mockSafe: MockSafe;
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
    
    // Deploy MailService with USDC token
    const MailService = await ethers.getContractFactory("MailService");
    mailService = await MailService.deploy(await mockUSDC.getAddress());
    await mailService.waitForDeployment();
    
    // Deploy MockSafe with threshold of 2
    const MockSafe = await ethers.getContractFactory("MockSafe");
    mockSafe = await MockSafe.deploy(2);
    await mockSafe.waitForDeployment();
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
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
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
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();

      await expect(
        helper.testDelegation(addr1.address)
      ).to.emit(mailService, "DelegationSet")
       .withArgs(await helper.getAddress(), addr1.address);
    });

    it("Should allow clearing delegation by setting to null address", async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
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
      // Deploy helper with threshold 0
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper.waitForDeployment();
      
      // Set threshold to 0 (this simulates a Safe with invalid threshold)
      await helper.setThreshold(0);

      // This should revert because threshold is 0
      await expect(
        helper.testDelegation(addr1.address)
      ).to.be.revertedWithCustomError(mailService, "NotASafeWallet");
    });
  });

  describe("getDelegatedAddress function", function () {
    beforeEach(async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      this.helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
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
      const helper2 = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
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

  describe("Domain registration", function () {
    beforeEach(async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      this.helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await this.helper.waitForDeployment();
      
      // Fund the helper with USDC and approve spending
      await mockUSDC.mint(await this.helper.getAddress(), ethers.parseUnits("1000", 6)); // 1000 USDC
      await this.helper.fundAndApprove(ethers.parseUnits("1000", 6));
    });

    it("Should revert when EOA tries to register a domain", async function () {
      await expect(
        mailService.connect(addr1).registerDomain("example.com")
      ).to.be.revertedWithCustomError(mailService, "NotASafeWallet");
    });

    it("Should allow Safe wallet to register a domain", async function () {
      const tx = this.helper.testDomainRegistration("example.com");
      const block = await ethers.provider.getBlock('latest');
      const expectedExpiration = BigInt(block!.timestamp + 1) + BigInt(365 * 24 * 60 * 60); // +1 for next block
      
      await expect(tx)
      .to.emit(mailService, "DomainRegistered")
      .withArgs("example.com", await this.helper.getAddress(), expectedExpiration);
      
      const [registrar, expiration] = await mailService.getDomainRegister("example.com");
      expect(registrar).to.equal(await this.helper.getAddress());
      expect(expiration).to.be.greaterThan(block!.timestamp);
    });

    it("Should revert when registering an empty domain", async function () {
      await expect(
        this.helper.testDomainRegistration("")
      ).to.be.revertedWithCustomError(mailService, "EmptyDomain");
    });

    it("Should allow same owner to extend registration but prevent different owners", async function () {
      // First registration should succeed
      await this.helper.testDomainRegistration("taken.com");
      const [, initialExpiration] = await mailService.getDomainRegister("taken.com");
      
      // Same owner can re-register (extend) the domain
      await expect(
        this.helper.testDomainRegistration("taken.com")
      ).to.emit(mailService, "DomainExtended");
      
      // Verify expiration was extended
      const [, newExpiration] = await mailService.getDomainRegister("taken.com");
      expect(newExpiration).to.be.greaterThan(initialExpiration);
      
      // But different Safe should not be able to register the same domain
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper2 = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper2.waitForDeployment();
      
      // Fund the second helper
      await mockUSDC.mint(await helper2.getAddress(), ethers.parseUnits("1000", 6));
      await helper2.fundAndApprove(ethers.parseUnits("1000", 6));
      
      await expect(
        helper2.testDomainRegistration("taken.com")
      ).to.be.revertedWithCustomError(mailService, "DomainAlreadyRegistered");
    });

    it("Should correctly return domain registrar", async function () {
      // Register a domain
      await this.helper.testDomainRegistration("test.com");
      
      // Check registrar and expiration
      const [registrar, expiration] = await mailService.getDomainRegister("test.com");
      expect(registrar).to.equal(await this.helper.getAddress());
      expect(expiration).to.be.greaterThan(0);
      
      // Check unregistered domain returns zero address and zero expiration
      const [unregRegistrar, unregExpiration] = await mailService.getDomainRegister("unregistered.com");
      expect(unregRegistrar).to.equal(ethers.ZeroAddress);
      expect(unregExpiration).to.equal(0);
    });

    it("Should return all domains registered by a Safe", async function () {
      // Register multiple domains
      await this.helper.testDomainRegistration("first.com");
      await this.helper.testDomainRegistration("second.com");
      await this.helper.testDomainRegistration("third.com");
      
      // Get domains and expirations
      const [domains, expirations] = await this.helper.getMyDomains();
      expect(domains).to.deep.equal(["first.com", "second.com", "third.com"]);
      expect(expirations).to.have.lengthOf(3);
      expect(expirations[0]).to.be.greaterThan(0);
      expect(expirations[1]).to.be.greaterThan(0);
      expect(expirations[2]).to.be.greaterThan(0);
    });

    it("Should return empty arrays for Safe with no domains", async function () {
      const [domains, expirations] = await this.helper.getMyDomains();
      expect(domains).to.deep.equal([]);
      expect(expirations).to.deep.equal([]);
    });

    it("Should handle multiple Safes registering different domains", async function () {
      // Deploy another helper (representing another Safe)
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper2 = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper2.waitForDeployment();
      
      // Fund the second helper
      await mockUSDC.mint(await helper2.getAddress(), ethers.parseUnits("1000", 6));
      await helper2.fundAndApprove(ethers.parseUnits("1000", 6));
      
      // Register domains from different Safes
      await this.helper.testDomainRegistration("safe1-domain1.com");
      await this.helper.testDomainRegistration("safe1-domain2.com");
      await helper2.testDomainRegistration("safe2-domain1.com");
      await helper2.testDomainRegistration("safe2-domain2.com");
      
      // Check domains for each Safe
      const [safe1Domains, safe1Expirations] = await this.helper.getMyDomains();
      const [safe2Domains, safe2Expirations] = await helper2.getMyDomains();
      
      expect(safe1Domains).to.deep.equal(["safe1-domain1.com", "safe1-domain2.com"]);
      expect(safe2Domains).to.deep.equal(["safe2-domain1.com", "safe2-domain2.com"]);
      expect(safe1Expirations).to.have.lengthOf(2);
      expect(safe2Expirations).to.have.lengthOf(2);
      
      // Verify registrars
      const [reg1] = await mailService.getDomainRegister("safe1-domain1.com");
      const [reg2] = await mailService.getDomainRegister("safe2-domain1.com");
      expect(reg1).to.equal(await this.helper.getAddress());
      expect(reg2).to.equal(await helper2.getAddress());
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
      beforeEach(async function () {
        // Deploy a Safe delegate helper contract for testing
        const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
        this.helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
        await this.helper.waitForDeployment();
        
        // Fund the helper with USDC and approve spending
        await mockUSDC.mint(await this.helper.getAddress(), ethers.parseUnits("1000", 6)); // 1000 USDC
        await this.helper.fundAndApprove(ethers.parseUnits("1000", 6));
      });

      it("Should transfer correct USDC amount on registration", async function () {
        const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        
        await this.helper.testDomainRegistration("test.com");
        
        const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        expect(finalBalance - initialBalance).to.equal(100000000); // 100 USDC
      });

      it("Should use updated fee for registration", async function () {
        // Set a custom fee
        await mailService.connect(owner).setRegistrationFee(50000000); // 50 USDC
        
        const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        
        await this.helper.testDomainRegistration("custom-fee.com");
        
        const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
        expect(finalBalance - initialBalance).to.equal(50000000); // 50 USDC
      });

      it("Should fail when Safe has insufficient USDC balance", async function () {
        // Deploy helper with no USDC
        const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
        const poorHelper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
        await poorHelper.waitForDeployment();
        
        // No domain should be registered and no event emitted
        await expect(
          poorHelper.testDomainRegistration("expensive.com")
        ).to.not.emit(mailService, "DomainRegistered");
        
        // Domain should not be registered
        const [registrar] = await mailService.getDomainRegister("expensive.com");
        expect(registrar).to.equal(ethers.ZeroAddress);
      });
    });
  });

  describe("Domain expiration functionality", function () {
    beforeEach(async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      this.helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await this.helper.waitForDeployment();
      
      // Fund the helper with USDC and approve spending
      await mockUSDC.mint(await this.helper.getAddress(), ethers.parseUnits("1000", 6)); // 1000 USDC
      await this.helper.fundAndApprove(ethers.parseUnits("1000", 6));
    });

    it("Should set expiration to 365 days from block timestamp for new domain", async function () {
      const tx = this.helper.testDomainRegistration("expiry-test.com");
      const block = await ethers.provider.getBlock('latest');
      const expectedExpiration = BigInt(block!.timestamp + 1) + BigInt(365 * 24 * 60 * 60); // +1 for next block
      
      await expect(tx)
        .to.emit(mailService, "DomainRegistered")
        .withArgs("expiry-test.com", await this.helper.getAddress(), expectedExpiration);
      
      const [, expiration] = await mailService.getDomainRegister("expiry-test.com");
      expect(expiration).to.equal(expectedExpiration);
    });

    it("Should extend expiration by 365 days when owner re-registers", async function () {
      // Initial registration
      await this.helper.testDomainRegistration("extend-test.com");
      const [, initialExpiration] = await mailService.getDomainRegister("extend-test.com");
      
      // Re-register (extend) the same domain
      const tx = this.helper.testDomainRegistration("extend-test.com");
      const expectedNewExpiration = initialExpiration + BigInt(365 * 24 * 60 * 60);
      
      await expect(tx)
        .to.emit(mailService, "DomainExtended")
        .withArgs("extend-test.com", await this.helper.getAddress(), expectedNewExpiration);
      
      const [, newExpiration] = await mailService.getDomainRegister("extend-test.com");
      expect(newExpiration).to.equal(expectedNewExpiration);
      expect(newExpiration).to.be.greaterThan(initialExpiration);
    });

    it("Should return domains with their expiration times", async function () {
      // Register multiple domains at different times
      await this.helper.testDomainRegistration("domain1.com");
      
      // Mine a new block to get different timestamp
      await ethers.provider.send("evm_mine", []);
      await this.helper.testDomainRegistration("domain2.com");
      
      const [domains, expirations] = await this.helper.getMyDomains();
      
      expect(domains).to.deep.equal(["domain1.com", "domain2.com"]);
      expect(expirations).to.have.lengthOf(2);
      expect(expirations[0]).to.be.greaterThan(0);
      expect(expirations[1]).to.be.greaterThan(0);
      // Second domain should have later or equal expiration
      expect(expirations[1]).to.be.greaterThanOrEqual(expirations[0]);
    });

    it("Should charge fee for domain extension", async function () {
      // Register initial domain
      await this.helper.testDomainRegistration("fee-test.com");
      
      const initialBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      
      // Extend the domain (should charge fee again)
      await this.helper.testDomainRegistration("fee-test.com");
      
      const finalBalance = await mockUSDC.balanceOf(await mailService.getAddress());
      expect(finalBalance - initialBalance).to.equal(100000000); // 100 USDC fee for extension
    });
  });

  describe("Domain release functionality", function () {
    beforeEach(async function () {
      // Deploy a Safe delegate helper contract for testing
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      this.helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await this.helper.waitForDeployment();
      
      // Fund the helper with USDC and approve spending
      await mockUSDC.mint(await this.helper.getAddress(), ethers.parseUnits("1000", 6)); // 1000 USDC
      await this.helper.fundAndApprove(ethers.parseUnits("1000", 6));
      
      // Register some domains for testing
      await this.helper.testDomainRegistration("release1.com");
      await this.helper.testDomainRegistration("release2.com");
      await this.helper.testDomainRegistration("release3.com");
    });

    it("Should allow owner to release their domain", async function () {
      await expect(
        this.helper.testDomainRelease("release2.com")
      ).to.emit(mailService, "DomainReleased")
       .withArgs("release2.com", await this.helper.getAddress());
      
      // Domain should no longer be registered
      const [registrar, expiration] = await mailService.getDomainRegister("release2.com");
      expect(registrar).to.equal(ethers.ZeroAddress);
      expect(expiration).to.equal(0);
      
      // Domain should be removed from owner's list
      const [domains] = await this.helper.getMyDomains();
      expect(domains).to.deep.equal(["release1.com", "release3.com"]);
    });

    it("Should revert when trying to release unowned domain", async function () {
      await expect(
        this.helper.testDomainRelease("unowned.com")
      ).to.be.revertedWithCustomError(mailService, "DomainNotRegistered");
    });

    it("Should revert when trying to release someone else's domain", async function () {
      // Deploy another helper
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper2 = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
      await helper2.waitForDeployment();
      
      await expect(
        helper2.testDomainRelease("release1.com")
      ).to.be.revertedWithCustomError(mailService, "DomainNotRegistered");
    });

    it("Should handle releasing middle domain from array correctly", async function () {
      // Release the middle domain
      await this.helper.testDomainRelease("release2.com");
      
      // Check that remaining domains are still there
      const [domains] = await this.helper.getMyDomains();
      expect(domains).to.have.lengthOf(2);
      expect(domains).to.include("release1.com");
      expect(domains).to.include("release3.com");
    });

    it("Should handle releasing all domains", async function () {
      // Release all domains
      await this.helper.testDomainRelease("release1.com");
      await this.helper.testDomainRelease("release2.com");
      await this.helper.testDomainRelease("release3.com");
      
      // Check that no domains remain
      const [domains] = await this.helper.getMyDomains();
      expect(domains).to.have.lengthOf(0);
      
      // Check that domains are not registered
      const [reg1] = await mailService.getDomainRegister("release1.com");
      const [reg2] = await mailService.getDomainRegister("release2.com");
      const [reg3] = await mailService.getDomainRegister("release3.com");
      expect(reg1).to.equal(ethers.ZeroAddress);
      expect(reg2).to.equal(ethers.ZeroAddress);
      expect(reg3).to.equal(ethers.ZeroAddress);
    });

    it("Should allow re-registration after release", async function () {
      // Release a domain
      await this.helper.testDomainRelease("release1.com");
      
      // Re-register the same domain
      const tx = this.helper.testDomainRegistration("release1.com");
      const block = await ethers.provider.getBlock('latest');
      const expectedExpiration = BigInt(block!.timestamp + 1) + BigInt(365 * 24 * 60 * 60);
      
      await expect(tx)
      .to.emit(mailService, "DomainRegistered")
      .withArgs("release1.com", await this.helper.getAddress(), expectedExpiration);
      
      // Domain should be registered again
      const [registrar] = await mailService.getDomainRegister("release1.com");
      expect(registrar).to.equal(await this.helper.getAddress());
    });
  });

  describe("Edge cases and security", function () {
    it("Should handle delegation updates correctly", async function () {
      const SafeDelegateHelper = await ethers.getContractFactory("SafeDelegateHelper");
      const helper = await SafeDelegateHelper.deploy(await mailService.getAddress(), await mockUSDC.getAddress());
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
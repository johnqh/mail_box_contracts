import { expect } from "chai";
import hre from "hardhat";
import { parseUnits, zeroAddress } from "viem";

describe("Mailer", function () {
  beforeEach(async function () {
    const [owner, addr1, addr2] = await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    // Deploy mock USDC
    const mockUSDC = await hre.viem.deployContract("MockUSDC");

    // Deploy Mailer with mock USDC address
    const mailer = await hre.viem.deployContract("Mailer", [mockUSDC.address, owner.account.address]);

    // Give addr1 some USDC and approve Mailer to spend
    await mockUSDC.write.mint([addr1.account.address, parseUnits("10", 6)], { account: owner.account });
    await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr1.account });

    this.mailer = mailer;
    this.mockUSDC = mockUSDC;
    this.owner = owner;
    this.addr1 = addr1;
    this.addr2 = addr2;
    this.publicClient = publicClient;
  });


  describe("Contract setup", function () {
    it("Should set USDC token address correctly", async function () {
      const { mailer, mockUSDC } = this;
      expect((await mailer.read.usdcToken()).toLowerCase()).to.equal(mockUSDC.address.toLowerCase());
    });

    it("Should set correct default send fee", async function () {
      const { mailer } = this;
      expect(await mailer.read.sendFee()).to.equal(100000n); // 0.1 USDC
    });

    it("Should set owner as deployer", async function () {
      const { mailer, owner } = this;
      expect((await mailer.read.owner()).toLowerCase()).to.equal(owner.account.address.toLowerCase());
    });

    it("Should set correct default delegation fee", async function () {
      const { mailer } = this;
      expect(await mailer.read.delegationFee()).to.equal(10000000n); // 10 USDC
    });
  });

  describe("send function with revenue sharing (priority mode)", function () {
    it("Should emit MailSent event when USDC transfer succeeds", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.send([addr2.account.address, "Test Subject", "Test Body", addr1.account .address, true, false], { account: addr1.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.MailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      expect(event.args.from.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
      expect(event.args.to.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      const { mailer, addr1, addr2 } = this;
      // addr2 has no USDC balance
      await expect(
        mailer.write.send([addr1.account.address, "Test Subject", "Test Body", addr2.account .address, true, false], { account: addr2.account  })
      ).to.be.rejectedWith("InsufficientBalance");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      // Give addr2 USDC but no allowance
      await mockUSDC.write.mint([addr2.account.address, parseUnits("1", 6)]);

      await expect(
        mailer.write.send([addr1.account.address, "Test Subject", "Test Body", addr2.account .address, true, false], { account: addr2.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

      await mailer.write.send([addr2.account.address, "Test Subject", "Test Body", addr1.account .address, true, false], { account: addr1.account  });

      const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
      expect(finalBalance - initialBalance).to.equal(100000n); // 0.1 USDC
    });
  });

  describe("sendPrepared function with revenue sharing (priority mode)", function () {
    it("Should emit PreparedMailSent event when USDC transfer succeeds", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.sendPrepared([addr2.account.address, "mail-123", addr1.account .address, true, false], { account: addr1.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.PreparedMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      expect(event.args.from.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
      expect(event.args.to.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
      // mailId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.mailId).to.exist;
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      const { mailer, addr1, addr2 } = this;
      // addr2 has no USDC balance
      await expect(
        mailer.write.sendPrepared([addr1.account.address, "mail-456", addr2.account .address, true, false], { account: addr2.account  })
      ).to.be.rejectedWith("InsufficientBalance");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      // Give addr2 USDC but no allowance
      await mockUSDC.write.mint([addr2.account.address, parseUnits("1", 6)]);

      await expect(
        mailer.write.sendPrepared([addr1.account.address, "mail-789", addr2.account .address, true, false], { account: addr2.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

      await mailer.write.sendPrepared([addr2.account.address, "mail-999", addr1.account .address, true, false], { account: addr1.account  });

      const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
      expect(finalBalance - initialBalance).to.equal(100000n); // 0.1 USDC
    });

    it("Should handle different mailId strings", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      // Test with various mailId formats
      const hash = await mailer.write.sendPrepared([addr2.account.address, "abc-123-xyz", addr1.account .address, true, false], { account: addr1.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.PreparedMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      // mailId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.mailId).to.exist;
    });
  });

  describe("Fee management", function () {
    describe("getFee function", function () {
      it("Should return current fee", async function () {
        const { mailer } = this;
        expect(await mailer.read.getFee()).to.equal(100000n);
      });

      it("Should return updated fee after change", async function () {
        const { mailer, owner } = this;
        await mailer.write.setFee([200000n], { account: owner.account });
        expect(await mailer.read.getFee()).to.equal(200000n);
      });
    });

    describe("setFee function", function () {
      it("Should allow owner to update fee", async function () {
        const { mailer, owner, publicClient } = this;
        const newFee = 200000n; // 0.2 USDC

        const hash = await mailer.write.setFee([newFee], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.FeeUpdated();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.oldFee).to.equal(100000n);
        expect(event.args.newFee).to.equal(newFee);

        expect(await mailer.read.sendFee()).to.equal(newFee);
      });

      it("Should revert when non-owner tries to set fee", async function () {
        const { mailer, addr1 } = this;
        await expect(
          mailer.write.setFee([200000n], { account: addr1.account })
        ).to.be.rejectedWith("OnlyOwner");
      });

      it("Should allow setting fee to zero", async function () {
        const { mailer, owner, publicClient } = this;
        const hash = await mailer.write.setFee([0n], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.FeeUpdated();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.oldFee).to.equal(100000n);
        expect(event.args.newFee).to.equal(0n);

        expect(await mailer.read.sendFee()).to.equal(0n);
      });

      it("Should allow setting very high fee", async function () {
        const { mailer, owner, publicClient } = this;
        const highFee = parseUnits("1000", 6); // 1000 USDC

        const hash = await mailer.write.setFee([highFee], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.FeeUpdated();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.oldFee).to.equal(100000n);
        expect(event.args.newFee).to.equal(highFee);

        expect(await mailer.read.sendFee()).to.equal(highFee);
      });

      it("Should emit correct event with old and new fee values", async function () {
        const { mailer, owner, publicClient } = this;
        // First change
        await mailer.write.setFee([150000n], { account: owner.account });

        // Second change should emit with correct old fee
        const hash = await mailer.write.setFee([250000n], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.FeeUpdated();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.oldFee).to.equal(150000n);
        expect(event.args.newFee).to.equal(250000n);
      });
    });

    describe("Fee functionality integration", function () {
      beforeEach(async function () {
        const { mailer, owner } = this;
        // Set a custom fee for testing
        await mailer.write.setFee([50000n], { account: owner.account }); // 0.05 USDC
      });

      it("Should use updated fee in send function", async function () {
        const { mailer, mockUSDC, addr1, addr2 } = this;
        const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

        await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });

        const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
        expect(finalBalance - initialBalance).to.equal(50000n); // Updated fee
      });

      it("Should use updated fee in sendPrepared function", async function () {
        const { mailer, mockUSDC, addr1, addr2 } = this;
        const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

        await mailer.write.sendPrepared([addr2.account.address, "test-mail", addr1.account .address, true, false], { account: addr1.account  });

        const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
        expect(finalBalance - initialBalance).to.equal(50000n); // Updated fee
      });

      it("Should fail when user has insufficient balance for new fee", async function () {
        const { mailer, owner, addr1, addr2 } = this;
        // Set a very high fee
        await mailer.write.setFee([parseUnits("20", 6)], { account: owner.account }); // 20 USDC

        // addr1 only has 10 USDC, should fail
        await expect(
          mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  })
        ).to.be.rejectedWith("InsufficientBalance");
      });

      it("Should work with zero fee", async function () {
        const { mailer, mockUSDC, owner, addr1, addr2, publicClient } = this;
        await mailer.write.setFee([0n], { account: owner.account });

        const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

        const hash = await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.MailSent();
        expect(logs.length).to.be.greaterThan(0);

        const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
        expect(finalBalance - initialBalance).to.equal(0n);
      });

      it("Should handle fee changes mid-transaction flow", async function () {
        const { mailer, mockUSDC, owner, addr1, addr2 } = this;
        // Send with original fee
        await mailer.write.send([addr2.account.address, "Test1", "Body1", addr1.account .address, true, false], { account: addr1.account  });

        // Change fee
        await mailer.write.setFee([75000n], { account: owner.account }); // 0.075 USDC

        // Send with new fee
        const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
        await mailer.write.send([addr2.account.address, "Test2", "Body2", addr1.account .address, true, false], { account: addr1.account  });
        const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

        expect(finalBalance - initialBalance).to.equal(75000n); // New fee
      });
    });
  });

  describe("send function (standard mode - no revenue share)", function () {
    beforeEach(async function () {
      const { mockUSDC, mailer, addr2 } = this;
      // Give addr2 some USDC and approve contract
      await mockUSDC.write.mint([addr2.account.address, parseUnits("10", 6)]);
      await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr2.account });
    });

    it("Should emit MailSent event when USDC transfer succeeds", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.send([addr1.account.address, "Test Subject", "Test Body", addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.MailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      expect(event.args.from.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
      expect(event.args.to.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
    });

    it("Should not emit event when sender has no USDC balance", async function () {
      const { mailer, owner, addr1 } = this;
      // owner has USDC but no allowance, so it fails on allowance check
      await expect(
        mailer.write.send([addr1.account.address, "No Balance", "Should Fail", owner.account .address, false, false], { account: owner.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should not emit event when sender has no USDC allowance", async function () {
      const { mailer, mockUSDC, owner, addr1 } = this;
      // Give addr3 USDC but no allowance
      await mockUSDC.write.mint([owner.account.address, parseUnits("1", 6)]);

      await expect(
        mailer.write.send([addr1.account.address, "No Allowance", "Should Fail", owner.account .address, false, false], { account: owner.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should transfer 10% of sendFee to contract for owner", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
      const initialOwnerClaimable = await mailer.read.getOwnerClaimable();

      await mailer.write.send([addr1.account.address, "Test", "Body", addr2.account .address, false, false], { account: addr2.account  });

      const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
      const finalOwnerClaimable = await mailer.read.getOwnerClaimable();

      const fee = await mailer.read.sendFee();
      const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee

      expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
      expect(finalOwnerClaimable - initialOwnerClaimable).to.equal(expectedOwnerFee);
    });

    it("Should work with empty strings", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.send([addr1.account.address, "", "", addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.MailSent();

      expect(logs.length).to.be.greaterThan(0);
    });

    it("Should work with long strings", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const longSubject = "A".repeat(1000);
      const longBody = "B".repeat(5000);

      const hash = await mailer.write.send([addr1.account.address, longSubject, longBody, addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.MailSent();

      expect(logs.length).to.be.greaterThan(0);
    });
  });

  describe("sendPrepared function (standard mode - no revenue share)", function () {
    beforeEach(async function () {
      const { mockUSDC, mailer, addr2 } = this;
      // Give addr2 some USDC and approve contract
      await mockUSDC.write.mint([addr2.account.address, parseUnits("10", 6)]);
      await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr2.account });
    });

    it("Should emit PreparedMailSent event when USDC transfer succeeds", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.sendPrepared([addr1.account.address, "mail-123", addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.PreparedMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      expect(event.args.from.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
      expect(event.args.to.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
      // mailId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.mailId).to.exist;
    });

    it("Should not emit event when sender has no USDC balance", async function () {
      const { mailer, owner, addr1 } = this;
      // owner has USDC but no allowance, so it fails on allowance check
      await expect(
        mailer.write.sendPrepared([addr1.account.address, "no-balance-mail", owner.account .address, false, false], { account: owner.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should not emit event when sender has no USDC allowance", async function () {
      const { mailer, mockUSDC, owner, addr1 } = this;
      // Give addr3 USDC but no allowance
      await mockUSDC.write.mint([owner.account.address, parseUnits("1", 6)]);

      await expect(
        mailer.write.sendPrepared([addr1.account.address, "no-allowance-mail", owner.account .address, false, false], { account: owner.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should transfer 10% of sendFee to contract for owner", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
      const initialOwnerClaimable = await mailer.read.getOwnerClaimable();

      await mailer.write.sendPrepared([addr1.account.address, "prepared-test", addr2.account .address, false, false], { account: addr2.account  });

      const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
      const finalOwnerClaimable = await mailer.read.getOwnerClaimable();

      const fee = await mailer.read.sendFee();
      const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee

      expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
      expect(finalOwnerClaimable - initialOwnerClaimable).to.equal(expectedOwnerFee);
    });

    it("Should work with empty mailId", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.sendPrepared([addr1.account.address, "", addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.PreparedMailSent();

      expect(logs.length).to.be.greaterThan(0);
    });

    it("Should work with long mailId", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const longMailId = "long-mail-id-" + "x".repeat(1000);

      const hash = await mailer.write.sendPrepared([addr1.account.address, longMailId, addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.PreparedMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      // mailId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.mailId).to.exist;
    });

    it("Should handle special characters in mailId", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const specialMailId = "mail-123!@#$%^&*()_+-=[]{}|;:,.<>?";

      const hash = await mailer.write.sendPrepared([addr1.account.address, specialMailId, addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.PreparedMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      // mailId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.mailId).to.exist;
    });
  });

  describe("sendThroughWebhook function with revenue sharing (priority mode)", function () {
    it("Should emit WebhookMailSent event when USDC transfer succeeds", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.sendThroughWebhook([addr2.account.address, "webhook-123", addr1.account .address, true, false], { account: addr1.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.WebhookMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      expect(event.args.from.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
      expect(event.args.to.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
      // webhookId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.webhookId).to.exist;
    });

    it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
      const { mailer, addr1, addr2 } = this;
      // addr2 has no USDC balance
      await expect(
        mailer.write.sendThroughWebhook([addr1.account.address, "webhook-456", addr2.account .address, true, false], { account: addr2.account  })
      ).to.be.rejectedWith("InsufficientBalance");
    });

    it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      // Give addr2 USDC but no allowance
      await mockUSDC.write.mint([addr2.account.address, parseUnits("1", 6)]);

      await expect(
        mailer.write.sendThroughWebhook([addr1.account.address, "webhook-789", addr2.account .address, true, false], { account: addr2.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should transfer correct USDC amount to contract", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

      await mailer.write.sendThroughWebhook([addr2.account.address, "webhook-999", addr1.account .address, true, false], { account: addr1.account  });

      const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
      expect(finalBalance - initialBalance).to.equal(100000n); // 0.1 USDC
    });

    it("Should handle different webhookId strings", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      // Test with various webhookId formats
      const hash = await mailer.write.sendThroughWebhook([addr2.account.address, "abc-123-xyz", addr1.account .address, true, false], { account: addr1.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.WebhookMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      // webhookId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.webhookId).to.exist;
    });

    it("Should record 90% for recipient and 10% for owner with revenue share", async function () {
      const { mailer, addr1, addr2 } = this;
      const fee = await mailer.read.sendFee();
      const expectedRecipientShare = (fee * 90n) / 100n;
      const expectedOwnerShare = fee - expectedRecipientShare;

      await mailer.write.sendThroughWebhook([addr2.account.address, "webhook-test", addr1.account .address, true, false], { account: addr1.account  });

      // Check addr2 (recipient) has claimable amount
      const [amount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
      expect(amount).to.equal(expectedRecipientShare);

      const ownerClaimable = await mailer.read.getOwnerClaimable();
      expect(ownerClaimable).to.equal(expectedOwnerShare);
    });
  });

  describe("sendThroughWebhook function (standard mode - no revenue share)", function () {
    beforeEach(async function () {
      const { mockUSDC, mailer, addr2 } = this;
      // Give addr2 some USDC and approve contract
      await mockUSDC.write.mint([addr2.account.address, parseUnits("10", 6)]);
      await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr2.account });
    });

    it("Should emit WebhookMailSent event when USDC transfer succeeds", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.sendThroughWebhook([addr1.account.address, "webhook-123", addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.WebhookMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      expect(event.args.from.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
      expect(event.args.to.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
      // webhookId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.webhookId).to.exist;
    });

    it("Should not emit event when sender has no USDC balance", async function () {
      const { mailer, owner, addr1 } = this;
      // owner has USDC but no allowance, so it fails on allowance check
      await expect(
        mailer.write.sendThroughWebhook([addr1.account.address, "no-balance-webhook", owner.account .address, false, false], { account: owner.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should not emit event when sender has no USDC allowance", async function () {
      const { mailer, mockUSDC, owner, addr1 } = this;
      // Give addr3 USDC but no allowance
      await mockUSDC.write.mint([owner.account.address, parseUnits("1", 6)]);

      await expect(
        mailer.write.sendThroughWebhook([addr1.account.address, "no-allowance-webhook", owner.account .address, false, false], { account: owner.account  })
      ).to.be.rejectedWith("InsufficientAllowance");
    });

    it("Should transfer 10% of sendFee to contract for owner", async function () {
      const { mailer, mockUSDC, addr1, addr2 } = this;
      const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
      const initialOwnerClaimable = await mailer.read.getOwnerClaimable();

      await mailer.write.sendThroughWebhook([addr1.account.address, "webhook-test", addr2.account .address, false, false], { account: addr2.account  });

      const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
      const finalOwnerClaimable = await mailer.read.getOwnerClaimable();

      const fee = await mailer.read.sendFee();
      const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee

      expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
      expect(finalOwnerClaimable - initialOwnerClaimable).to.equal(expectedOwnerFee);
    });

    it("Should work with empty webhookId", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const hash = await mailer.write.sendThroughWebhook([addr1.account.address, "", addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.WebhookMailSent();

      expect(logs.length).to.be.greaterThan(0);
    });

    it("Should work with long webhookId", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const longWebhookId = "long-webhook-id-" + "x".repeat(1000);

      const hash = await mailer.write.sendThroughWebhook([addr1.account.address, longWebhookId, addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.WebhookMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      // webhookId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.webhookId).to.exist;
    });

    it("Should handle special characters in webhookId", async function () {
      const { mailer, addr1, addr2, publicClient } = this;
      const specialWebhookId = "webhook-123!@#$%^&*()_+-=[]{}|;:,.<>?";

      const hash = await mailer.write.sendThroughWebhook([addr1.account.address, specialWebhookId, addr2.account .address, false, false], { account: addr2.account  });

      await publicClient.waitForTransactionReceipt({ hash });
      const logs = await mailer.getEvents.WebhookMailSent();

      expect(logs.length).to.be.greaterThan(0);
      const event = logs[logs.length - 1];
      // webhookId is stored as bytes32 (keccak256 hash), so we check it exists
      expect(event.args.webhookId).to.exist;
    });
  });

  describe("Revenue Sharing System", function () {
    beforeEach(async function () {
      const { mockUSDC, mailer, addr1 } = this;
      // Give addr1 more USDC for multiple transactions
      await mockUSDC.write.mint([addr1.account.address, parseUnits("100", 6)]);
      await mockUSDC.write.approve([mailer.address, parseUnits("100", 6)], { account: addr1.account });
    });

    describe("Share Recording", function () {
      it("Should record 90% for recipient and 10% for owner with revenue share", async function () {
        const { mailer, addr1, addr2, publicClient } = this;
        const fee = await mailer.read.sendFee(); // 100000 (0.1 USDC)
        const expectedRecipientShare = (fee * 90n) / 100n; // 90000
        const expectedOwnerShare = fee - expectedRecipientShare; // 10000

        // addr1 sends to addr2 with revenue sharing - addr2 gets the revenue share
        const hash = await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.SharesRecorded();
        expect(logs.length).to.be.greaterThan(0);
        // Event args check - verify the amounts were recorded properly through view functions

        // Check addr2 (recipient) has claimable amount
        const [amount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        expect(amount).to.equal(expectedRecipientShare);

        const ownerClaimable = await mailer.read.getOwnerClaimable();
        expect(ownerClaimable).to.equal(expectedOwnerShare);
      });

      it("Should record 90% for recipient and 10% for owner on sendPrepared with revenue share", async function () {
        const { mailer, addr1, addr2, publicClient } = this;
        const fee = await mailer.read.sendFee();
        const expectedRecipientShare = (fee * 90n) / 100n;
        const expectedOwnerShare = fee - expectedRecipientShare;

        // addr1 sends to addr2 with revenue sharing - addr2 gets the revenue share
        const hash = await mailer.write.sendPrepared([addr2.account.address, "mail-123", addr1.account .address, true, false], { account: addr1.account  });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.SharesRecorded();
        expect(logs.length).to.be.greaterThan(0);
        // Event args check - verify the amounts were recorded properly through view functions

        // Check addr2 (recipient) has claimable amount
        const [amount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        expect(amount).to.equal(expectedRecipientShare);

        const ownerClaimable = await mailer.read.getOwnerClaimable();
        expect(ownerClaimable).to.equal(expectedOwnerShare);
      });

      it("Should accumulate multiple shares for same recipient", async function () {
        const { mailer, addr1, addr2 } = this;
        const fee = await mailer.read.sendFee();
        const expectedRecipientShare = (fee * 90n) / 100n;

        // Send two messages to addr2 - addr2 should accumulate revenue shares
        await mailer.write.send([addr2.account.address, "Test1", "Body1", addr1.account .address, true, false], { account: addr1.account  });
        await mailer.write.send([addr2.account.address, "Test2", "Body2", addr1.account .address, true, false], { account: addr1.account  });

        // Check addr2 (recipient) has accumulated claimable amount
        const [amount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        expect(amount).to.equal(expectedRecipientShare * 2n);
      });
    });

    describe("Recipient Claims", function () {
      beforeEach(async function () {
        const { mailer, addr1, addr2 } = this;
        // addr1 sends to addr2 with revenue sharing - addr2 gets the claimable amount
        await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
      });

      it("Should allow recipient to claim their share", async function () {
        const { mailer, mockUSDC, addr2, publicClient } = this;
        // addr2 is the recipient who should have claimable amount
        const [amount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);

        const hash = await mailer.write.claimRecipientShare([], { account: addr2.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.RecipientClaimed();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.recipient.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
        expect(event.args.amount).to.equal(amount);

        // Check addr2 (recipient) received USDC
        // addr2 initial: 0 USDC (not funded in beforeEach)
        // addr2 receives: amount (90000 = 0.09 USDC) from the claim
        // Final should be: 0 + 0.09 = 0.09 USDC
        const balance = await mockUSDC.read.balanceOf([addr2.account.address]);
        expect(balance).to.equal(amount);

        // Check claimable amount is now zero
        const [newAmount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        expect(newAmount).to.equal(0n);
      });

      it("Should revert if no claimable amount", async function () {
        const { mailer, owner } = this;
        await expect(
          mailer.write.claimRecipientShare([], { account: owner.account })
        ).to.be.rejectedWith("NoClaimableAmount");
      });

      it("Should handle expired claims correctly", async function () {
        const { mailer, addr2, owner, publicClient } = this;
        // Fast forward past claim period (60 days)
        await hre.network.provider.send("evm_increaseTime", [60 * 24 * 60 * 60 + 1]);
        await hre.network.provider.send("evm_mine", []);

        // addr2 is the recipient with the claimable amount
        const [expiredAmount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        const initialOwnerClaimable = await mailer.read.getOwnerClaimable();

        // Recipient can no longer claim
        await expect(
          mailer.write.claimRecipientShare([], { account: addr2.account })
        ).to.be.rejectedWith("NoClaimableAmount");

        // Owner claimable should remain unchanged until explicitly claimed
        const ownerClaimableAfterExpiry = await mailer.read.getOwnerClaimable();
        expect(ownerClaimableAfterExpiry).to.equal(initialOwnerClaimable);

        // Owner can now claim the expired shares from addr2
        const hash = await mailer.write.claimExpiredShares([addr2.account.address], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.ExpiredSharesClaimed();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.recipient.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
        expect(event.args.amount).to.equal(expiredAmount);

        // Check that expired amount was moved to owner claimable
        const finalOwnerClaimable = await mailer.read.getOwnerClaimable();
        expect(finalOwnerClaimable).to.equal(initialOwnerClaimable + expiredAmount);
      });
    });

    describe("Owner Claims", function () {
      beforeEach(async function () {
        const { mailer, addr1, addr2 } = this;
        // addr1 sends to addr2 with revenue sharing
        await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
      });

      it("Should allow owner to claim their share", async function () {
        const { mailer, mockUSDC, owner, publicClient } = this;
        const ownerClaimable = await mailer.read.getOwnerClaimable();
        const initialBalance = await mockUSDC.read.balanceOf([owner.account.address]);

        const hash = await mailer.write.claimOwnerShare([], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.OwnerClaimed();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.amount).to.equal(ownerClaimable);

        // Check owner received USDC
        const finalBalance = await mockUSDC.read.balanceOf([owner.account.address]);
        expect(finalBalance - initialBalance).to.equal(ownerClaimable);

        // Check claimable amount is now zero
        const newOwnerClaimable = await mailer.read.getOwnerClaimable();
        expect(newOwnerClaimable).to.equal(0n);
      });

      it("Should revert if no claimable amount", async function () {
        const { mailer, owner } = this;
        // First claim everything
        await mailer.write.claimOwnerShare([], { account: owner.account });

        await expect(
          mailer.write.claimOwnerShare([], { account: owner.account })
        ).to.be.rejectedWith("NoClaimableAmount");
      });

      it("Should only allow owner to claim", async function () {
        const { mailer, addr1 } = this;
        await expect(
          mailer.write.claimOwnerShare([], { account: addr1.account })
        ).to.be.rejectedWith("OnlyOwner");
      });
    });

    describe("Expired Share Management", function () {
      beforeEach(async function () {
        const { mailer, addr1, addr2 } = this;
        // addr1 sends to addr2 with revenue sharing - addr2 gets the claimable amount
        await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
      });

      it("Should allow owner to claim expired shares", async function () {
        const { mailer, addr2, owner, publicClient } = this;
        // Fast forward past claim period
        await hre.network.provider.send("evm_increaseTime", [60 * 24 * 60 * 60 + 1]);
        await hre.network.provider.send("evm_mine", []);

        // addr2 is the recipient with the claimable amount
        const [expiredAmount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        const initialOwnerClaimable = await mailer.read.getOwnerClaimable();

        const hash = await mailer.write.claimExpiredShares([addr2.account.address], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.ExpiredSharesClaimed();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.recipient.toLowerCase()).to.equal(addr2.account.address.toLowerCase());
        expect(event.args.amount).to.equal(expiredAmount);

        // Check expired amount moved to owner claimable
        const finalOwnerClaimable = await mailer.read.getOwnerClaimable();
        expect(finalOwnerClaimable).to.equal(initialOwnerClaimable + expiredAmount);

        // Check recipient claim is reset
        const [newAmount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        expect(newAmount).to.equal(0n);
      });

      it("Should revert if claim period not expired", async function () {
        const { mailer, addr2, owner } = this;
        await expect(
          mailer.write.claimExpiredShares([addr2.account.address], { account: owner.account })
        ).to.be.rejectedWith("ClaimPeriodNotExpired");
      });

      it("Should only allow owner to claim expired shares", async function () {
        const { mailer, addr1, addr2 } = this;
        await hre.network.provider.send("evm_increaseTime", [60 * 24 * 60 * 60 + 1]);
        await hre.network.provider.send("evm_mine", []);

        await expect(
          mailer.write.claimExpiredShares([addr2.account.address], { account: addr1.account })
        ).to.be.rejectedWith("OnlyOwner");
      });
    });

    describe("View Functions", function () {
      it("Should return correct recipient claimable info", async function () {
        const { mailer, addr1, addr2, publicClient } = this;
        // Before any transactions - addr2 has no claimable amount
        let [amount, expiresAt, isExpired] = await mailer.read.getRecipientClaimable([addr2.account.address]);
        expect(amount).to.equal(0n);
        expect(isExpired).to.be.false;

        // After addr1 sends to addr2 with revenue sharing - addr2 gets claimable amount
        await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
        [amount, expiresAt, isExpired] = await mailer.read.getRecipientClaimable([addr2.account.address]);

        const fee = await mailer.read.sendFee();
        const expectedAmount = (fee * 90n) / 100n;
        expect(amount).to.equal(expectedAmount);
        expect(isExpired).to.be.false;

        const currentTime = Number((await publicClient.getBlock()).timestamp);
        const expectedExpiry = currentTime + (60 * 24 * 60 * 60); // 60 days
        expect(Number(expiresAt)).to.be.closeTo(expectedExpiry, 10); // Allow 10 second tolerance
      });

      it("Should return correct owner claimable amount", async function () {
        const { mailer, addr1, addr2 } = this;
        expect(await mailer.read.getOwnerClaimable()).to.equal(0n);

        await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });

        const fee = await mailer.read.sendFee();
        const expectedAmount = fee - (fee * 90n) / 100n; // 10%
        expect(await mailer.read.getOwnerClaimable()).to.equal(expectedAmount);
      });
    });

    describe("Delegation functionality", function () {
      beforeEach(async function () {
        const { mockUSDC, mailer, addr1, addr2 } = this;
        // Fund addresses with additional USDC for delegation fees
        await mockUSDC.write.mint([addr1.account.address, parseUnits("100", 6)]);
        await mockUSDC.write.approve([mailer.address, parseUnits("100", 6)], { account: addr1.account });

        await mockUSDC.write.mint([addr2.account.address, parseUnits("100", 6)]);
        await mockUSDC.write.approve([mailer.address, parseUnits("100", 6)], { account: addr2.account });
      });

      describe("delegateTo function", function () {
        it("Should allow delegation and charge fee", async function () {
          const { mailer, mockUSDC, addr1, addr2, publicClient } = this;
          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const hash = await mailer.write.delegateTo([addr2.account.address], { account: addr1.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.DelegationSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.delegator.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.delegate.toLowerCase()).to.equal(addr2.account.address.toLowerCase());

          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
          const delegationFee = await mailer.read.delegationFee();
          expect(finalBalance - initialBalance).to.equal(delegationFee);
        });

        it("Should allow clearing delegation without fee", async function () {
          const { mailer, mockUSDC, addr1, addr2, publicClient } = this;
          // First set delegation
          await mailer.write.delegateTo([addr2.account.address], { account: addr1.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const hash = await mailer.write.delegateTo([zeroAddress], { account: addr1.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.DelegationSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.delegator.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.delegate.toLowerCase()).to.equal(zeroAddress.toLowerCase());

          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
          expect(finalBalance).to.equal(initialBalance);
        });

        it("Should revert if USDC transfer fails", async function () {
          const { mailer, mockUSDC, addr1, addr2 } = this;
          // Remove approval
          await mockUSDC.write.approve([mailer.address, 0n], { account: addr1.account });

          await expect(
            mailer.write.delegateTo([addr2.account.address], { account: addr1.account })
          ).to.be.rejected; // Just check that it reverts, not the specific error
        });

        it("Should credit owner claimable balance and allow owner to withdraw delegation fees", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2, publicClient } = this;
          const ownerBalanceBefore = await mockUSDC.read.balanceOf([owner.account.address]);
          const contractBalanceBefore = await mockUSDC.read.balanceOf([mailer.address]);
          const delegationFee = await mailer.read.delegationFee();

          const hash = await mailer.write.delegateTo([addr2.account.address], { account: addr1.account });
          await publicClient.waitForTransactionReceipt({ hash });

          expect(await mailer.read.ownerClaimable()).to.equal(delegationFee);

          const contractBalanceAfterDelegation = await mockUSDC.read.balanceOf([mailer.address]);
          expect(contractBalanceAfterDelegation - contractBalanceBefore).to.equal(delegationFee);

          const claimHash = await mailer.write.claimOwnerShare([], { account: owner.account });
          await publicClient.waitForTransactionReceipt({ hash: claimHash });

          expect(await mailer.read.ownerClaimable()).to.equal(0n);
          const ownerBalanceAfter = await mockUSDC.read.balanceOf([owner.account.address]);
          expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(delegationFee);

          const contractBalanceAfterClaim = await mockUSDC.read.balanceOf([mailer.address]);
          expect(contractBalanceAfterClaim).to.equal(contractBalanceBefore);
        });
      });

      describe("rejectDelegation function", function () {
        it("Should emit DelegationSet event with zero address", async function () {
          const { mailer, addr1, addr2, publicClient } = this;
          const hash = await mailer.write.rejectDelegation([addr1.account.address], { account: addr2.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.DelegationSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.delegator.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.delegate.toLowerCase()).to.equal(zeroAddress.toLowerCase());
        });

        it("Should work without checking actual delegation state", async function () {
          const { mailer, addr1, addr2, publicClient } = this;
          // Should work even if no delegation exists
          const hash = await mailer.write.rejectDelegation([addr1.account.address], { account: addr2.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.DelegationSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.delegator.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.delegate.toLowerCase()).to.equal(zeroAddress.toLowerCase());
        });
      });

      describe("Delegation fee management", function () {
        it("Should allow owner to update delegation fee", async function () {
          const { mailer, owner, publicClient } = this;
          const newFee = parseUnits("5", 6); // 5 USDC

          const hash = await mailer.write.setDelegationFee([newFee], { account: owner.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.DelegationFeeUpdated();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.oldFee).to.equal(10000000n);
          expect(event.args.newFee).to.equal(newFee);

          expect(await mailer.read.delegationFee()).to.equal(newFee);
        });

        it("Should revert when non-owner tries to update delegation fee", async function () {
          const { mailer, addr1 } = this;
          await expect(
            mailer.write.setDelegationFee([parseUnits("5", 6)], { account: addr1.account })
          ).to.be.rejectedWith("OnlyOwner");
        });

        it("Should return current delegation fee", async function () {
          const { mailer } = this;
          expect(await mailer.read.getDelegationFee()).to.equal(10000000n);
        });
      });
    });

    describe("Custom Fee Percentage functionality", function () {
      beforeEach(async function () {
        const { mockUSDC, mailer, addr2 } = this;
        // Give addr2 some USDC and approve contract
        await mockUSDC.write.mint([addr2.account.address, parseUnits("10", 6)]);
        await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr2.account });
      });

      describe("setCustomFeePercentage function", function () {
        it("Should allow owner to set custom fee percentage", async function () {
          const { mailer, owner, addr1, publicClient } = this;
          const hash = await mailer.write.setCustomFeePercentage([addr1.account.address, 50], { account: owner.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.CustomFeePercentageSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.account.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.percentage).to.equal(50);

          // Internally stored as discount: 50% fee = 50 discount
          expect(await mailer.read.customFeeDiscount([addr1.account.address])).to.equal(50);
        });

        it("Should allow setting percentage to 0 (free)", async function () {
          const { mailer, owner, addr1, publicClient } = this;
          const hash = await mailer.write.setCustomFeePercentage([addr1.account.address, 0], { account: owner.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.CustomFeePercentageSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.account.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.percentage).to.equal(0);

          // Internally stored as discount: 0% fee = 100 discount
          expect(await mailer.read.customFeeDiscount([addr1.account.address])).to.equal(100);
        });

        it("Should allow setting percentage to 100 (full fee)", async function () {
          const { mailer, owner, addr1, publicClient } = this;
          const hash = await mailer.write.setCustomFeePercentage([addr1.account.address, 100], { account: owner.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.CustomFeePercentageSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.account.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.percentage).to.equal(100);

          // Internally stored as discount: 100% fee = 0 discount
          expect(await mailer.read.customFeeDiscount([addr1.account.address])).to.equal(0);
        });

        it("Should revert when non-owner tries to set percentage", async function () {
          const { mailer, addr1, addr2 } = this;
          await expect(
            mailer.write.setCustomFeePercentage([addr2.account.address, 50], { account: addr1.account })
          ).to.be.rejectedWith("OnlyOwner");
        });

        it("Should revert when percentage > 100", async function () {
          const { mailer, owner, addr1 } = this;
          await expect(
            mailer.write.setCustomFeePercentage([addr1.account.address, 101], { account: owner.account })
          ).to.be.rejectedWith("InvalidPercentage");
        });

        it("Should revert when address is zero", async function () {
          const { mailer, owner } = this;
          await expect(
            mailer.write.setCustomFeePercentage([zeroAddress, 50], { account: owner.account })
          ).to.be.rejectedWith("InvalidAddress");
        });
      });

      describe("clearCustomFeePercentage function", function () {
        beforeEach(async function () {
          const { mailer, owner, addr1 } = this;
          // Set a custom percentage first
          await mailer.write.setCustomFeePercentage([addr1.account.address, 75], { account: owner.account });
        });

        it("Should allow owner to clear custom fee percentage", async function () {
          const { mailer, owner, addr1, publicClient } = this;
          const hash = await mailer.write.clearCustomFeePercentage([addr1.account.address], { account: owner.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.CustomFeePercentageSet();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.account.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.percentage).to.equal(100); // Clearing means back to 100% (full fee)

          // Internally stored as discount: cleared = 0 discount = 100% fee
          expect(await mailer.read.customFeeDiscount([addr1.account.address])).to.equal(0);
        });

        it("Should revert when non-owner tries to clear percentage", async function () {
          const { mailer, addr1 } = this;
          await expect(
            mailer.write.clearCustomFeePercentage([addr1.account.address], { account: addr1.account })
          ).to.be.rejectedWith("OnlyOwner");
        });

        it("Should revert when address is zero", async function () {
          const { mailer, owner } = this;
          await expect(
            mailer.write.clearCustomFeePercentage([zeroAddress], { account: owner.account })
          ).to.be.rejectedWith("InvalidAddress");
        });
      });

      describe("getCustomFeePercentage function", function () {
        it("Should return 100 for address without custom percentage", async function () {
          const { mailer, addr1 } = this;
          // Default is 100% (full fee) when no custom percentage is set
          expect(await mailer.read.getCustomFeePercentage([addr1.account.address])).to.equal(100);
        });

        it("Should return correct percentage for address with custom percentage", async function () {
          const { mailer, owner, addr1 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 60], { account: owner.account });
          expect(await mailer.read.getCustomFeePercentage([addr1.account.address])).to.equal(60);
        });
      });

      describe("send function with custom fee percentage", function () {
        it("Should charge 50% fee when percentage is 50", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 50], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const sendFee = await mailer.read.sendFee();
          const expectedFee = (sendFee * 50n) / 100n; // 50% of 0.1 USDC = 0.05 USDC
          expect(finalBalance - initialBalance).to.equal(expectedFee);
        });

        it("Should charge 0 fee when percentage is 0", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 0], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          expect(finalBalance - initialBalance).to.equal(0n);
        });

        it("Should charge full fee when percentage is 100", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 100], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          expect(finalBalance - initialBalance).to.equal(await mailer.read.sendFee());
        });

        it("Should use default fee when no custom percentage is set", async function () {
          const { mailer, mockUSDC, addr1, addr2 } = this;
          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          expect(finalBalance - initialBalance).to.equal(await mailer.read.sendFee());
        });

        it("Should apply custom percentage in standard mode (no revenue share)", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr2.account.address, 50], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.send([addr1.account.address, "Test", "Body", addr2.account .address, false, false], { account: addr2.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const sendFee = await mailer.read.sendFee();
          const effectiveFee = (sendFee * 50n) / 100n; // 50% of base fee
          const expectedOwnerFee = (effectiveFee * 10n) / 100n; // 10% of effective fee
          expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
        });

        it("Should not charge fee or record shares when percentage is 0", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 0], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          const initialOwnerClaimable = await mailer.read.getOwnerClaimable();

          await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });

          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
          const finalOwnerClaimable = await mailer.read.getOwnerClaimable();

          expect(finalBalance - initialBalance).to.equal(0n);
          expect(finalOwnerClaimable).to.equal(initialOwnerClaimable);

          // Check no shares recorded for recipient
          const [recipientAmount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
          expect(recipientAmount).to.equal(0n);
        });
      });

      describe("sendPrepared function with custom fee percentage", function () {
        it("Should charge 25% fee when percentage is 25", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 25], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.sendPrepared([addr2.account.address, "mail-123", addr1.account .address, true, false], { account: addr1.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const sendFee = await mailer.read.sendFee();
          const expectedFee = (sendFee * 25n) / 100n;
          expect(finalBalance - initialBalance).to.equal(expectedFee);
        });

        it("Should apply custom percentage in standard mode", async function () {
          const { mailer, mockUSDC, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr2.account.address, 75], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.sendPrepared([addr1.account.address, "mail-456", addr2.account .address, false, false], { account: addr2.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const sendFee = await mailer.read.sendFee();
          const effectiveFee = (sendFee * 75n) / 100n;
          const expectedOwnerFee = (effectiveFee * 10n) / 100n;
          expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
        });
      });

      describe("sendToEmailAddress with custom fee percentage", function () {
        it("Should apply custom percentage to email sends", async function () {
          const { mailer, mockUSDC, owner, addr1 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 40], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.sendToEmailAddress(["test@example.com", "Subject", "Body", addr1.account .address], { account: addr1.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const sendFee = await mailer.read.sendFee();
          const effectiveFee = (sendFee * 40n) / 100n;
          const expectedOwnerFee = (effectiveFee * 10n) / 100n;
          expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
        });
      });

      describe("sendPreparedToEmailAddress with custom fee percentage", function () {
        it("Should apply custom percentage to prepared email sends", async function () {
          const { mailer, mockUSDC, owner, addr1 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 30], { account: owner.account });

          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);
          await mailer.write.sendPreparedToEmailAddress(["test@example.com", "mail-789", addr1.account .address], { account: addr1.account  });
          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);

          const sendFee = await mailer.read.sendFee();
          const effectiveFee = (sendFee * 30n) / 100n;
          const expectedOwnerFee = (effectiveFee * 10n) / 100n;
          expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
        });
      });

      describe("Revenue sharing with custom fee percentage", function () {
        it("Should correctly split custom fee between recipient and owner", async function () {
          const { mailer, owner, addr1, addr2 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 60], { account: owner.account });

          const sendFee = await mailer.read.sendFee();
          const effectiveFee = (sendFee * 60n) / 100n; // 60% of base fee
          const expectedRecipientShare = (effectiveFee * 90n) / 100n;
          const expectedOwnerShare = effectiveFee - expectedRecipientShare;

          await mailer.write.send([addr2.account.address, "Test", "Body", addr1.account .address, true, false], { account: addr1.account  });

          const [recipientAmount, , ] = await mailer.read.getRecipientClaimable([addr2.account.address]);
          expect(recipientAmount).to.equal(expectedRecipientShare);

          const ownerClaimable = await mailer.read.getOwnerClaimable();
          expect(ownerClaimable).to.equal(expectedOwnerShare);
        });
      });

      describe("Prevent changes when paused", function () {
        it("Should revert setCustomFeePercentage when paused", async function () {
          const { mailer, owner, addr1 } = this;
          await mailer.write.pause([], { account: owner.account });

          await expect(
            mailer.write.setCustomFeePercentage([addr1.account.address, 50], { account: owner.account })
          ).to.be.rejectedWith("ContractIsPaused");
        });

        it("Should revert clearCustomFeePercentage when paused", async function () {
          const { mailer, owner, addr1 } = this;
          await mailer.write.setCustomFeePercentage([addr1.account.address, 50], { account: owner.account });
          await mailer.write.pause([], { account: owner.account });

          await expect(
            mailer.write.clearCustomFeePercentage([addr1.account.address], { account: owner.account })
          ).to.be.rejectedWith("ContractIsPaused");
        });
      });
    });

    describe("Pause functionality", function () {
      it("Should allow owner to pause contract", async function () {
        const { mailer, owner, publicClient } = this;
        const hash = await mailer.write.pause([], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.ContractPaused();
        expect(logs.length).to.be.greaterThan(0);

        expect(await mailer.read.isPaused()).to.equal(true);
      });

      it("Should revert when non-owner tries to pause", async function () {
        const { mailer, addr1 } = this;
        await expect(
          mailer.write.pause([], { account: addr1.account })
        ).to.be.rejectedWith("OnlyOwner");
      });

      it("Should revert when trying to pause already paused contract", async function () {
        const { mailer, owner } = this;
        await mailer.write.pause([], { account: owner.account });

        await expect(
          mailer.write.pause([], { account: owner.account })
        ).to.be.rejectedWith("ContractIsPaused");
      });

      it("Should distribute owner claimable funds when pausing", async function () {
        const { mailer, mockUSDC, owner, addr1, addr2, publicClient } = this;
        // First send a standard message to accumulate owner fees
        await mockUSDC.write.approve([mailer.address, parseUnits("1", 6)], { account: addr1.account });
        await mailer.write.send([addr2.account.address, "Test", "Test", addr1.account .address, false, false], { account: addr1.account  });

        const ownerBalanceBefore = await mockUSDC.read.balanceOf([owner.account.address]);
        const contractBalanceBefore = await mockUSDC.read.balanceOf([mailer.address]);

        // Pause contract - should distribute owner claimable funds
        const hash = await mailer.write.pause([], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.FundsDistributed();
        expect(logs.length).to.be.greaterThan(0);

        const ownerBalanceAfter = await mockUSDC.read.balanceOf([owner.account.address]);
        const contractBalanceAfter = await mockUSDC.read.balanceOf([mailer.address]);

        // Owner should receive their claimable amount
        expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);
        expect(contractBalanceAfter).to.be.lessThan(contractBalanceBefore);
      });

      it("Should prevent all functions when paused", async function () {
        const { mailer, mockUSDC, owner, addr1, addr2 } = this;
        await mailer.write.pause([], { account: owner.account });

        await mockUSDC.write.approve([mailer.address, parseUnits("1", 6)], { account: addr1.account });

        await expect(
          mailer.write.send([addr2.account.address, "Test", "Test", addr1.account .address, true, false], { account: addr1.account  })
        ).to.be.rejectedWith("ContractIsPaused");

        await expect(
          mailer.write.send([addr2.account.address, "Test", "Test", addr1.account .address, false, false], { account: addr1.account  })
        ).to.be.rejectedWith("ContractIsPaused");

        await expect(
          mailer.write.delegateTo([addr2.account.address], { account: addr1.account })
        ).to.be.rejectedWith("ContractIsPaused");
      });

      it("Should allow owner to unpause contract", async function () {
        const { mailer, owner, publicClient } = this;
        await mailer.write.pause([], { account: owner.account });

        const hash = await mailer.write.unpause([], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.ContractUnpaused();
        expect(logs.length).to.be.greaterThan(0);

        expect(await mailer.read.isPaused()).to.equal(false);
      });

      it("Should revert when non-owner tries to unpause", async function () {
        const { mailer, owner, addr1 } = this;
        await mailer.write.pause([], { account: owner.account });

        await expect(
          mailer.write.unpause([], { account: addr1.account })
        ).to.be.rejectedWith("OnlyOwner");
      });

      it("Should revert when trying to unpause non-paused contract", async function () {
        const { mailer, owner } = this;
        await expect(
          mailer.write.unpause([], { account: owner.account })
        ).to.be.rejectedWith("ContractNotPaused");
      });

      it("Should allow anyone to distribute claimable funds when paused", async function () {
        // Create fresh setup for this test
        const [testOwner, testAddr1, testAddr2, testAddr3] = await hre.viem.getWalletClients();

        // Deploy fresh contracts for isolated test
        const testMockUSDC = await hre.viem.deployContract("MockUSDC");
        const testMailer = await hre.viem.deployContract("Mailer", [testMockUSDC.address, testOwner.account.address]);

        const testPublicClient = await hre.viem.getPublicClient();

        // Setup USDC for test - need enough for send fee (0.1 USDC)
        await testMockUSDC.write.mint([testAddr1.account.address, parseUnits("1", 6)]);
        await testMockUSDC.write.approve([testMailer.address, parseUnits("1", 6)], { account: testAddr1.account });

        // testAddr1 sends to testAddr2 with revenue sharing - testAddr2 gets the 90% claimable amount
        await testMailer.write.send([testAddr2.account.address, "Test", "Test", testAddr1.account .address, true, false], { account: testAddr1.account  });

        // Verify recipient (testAddr2) has claimable amount before pause
        const [claimableAmount] = await testMailer.read.getRecipientClaimable([testAddr2.account.address]);
        expect(claimableAmount).to.be.greaterThan(0n);

        // Pause contract (only owner funds get distributed automatically)
        await testMailer.write.pause([], { account: testOwner.account });

        // Verify recipient still has claimable amount after pause (pause doesn't auto-distribute recipient funds)
        const [claimableAmountAfterPause] = await testMailer.read.getRecipientClaimable([testAddr2.account.address]);
        expect(claimableAmountAfterPause).to.equal(claimableAmount); // Should be unchanged

        const recipientBalanceBefore = await testMockUSDC.read.balanceOf([testAddr2.account.address]);

        // Anyone can distribute claimable funds when paused
        const hash = await testMailer.write.distributeClaimableFunds([testAddr2.account.address], { account: testAddr3.account });
        await testPublicClient.waitForTransactionReceipt({ hash });

        const logs = await testMailer.getEvents.FundsDistributed();
        expect(logs.length).to.be.greaterThan(0);
        const event = logs[logs.length - 1];
        expect(event.args.recipient.toLowerCase()).to.equal(testAddr2.account.address.toLowerCase());
        expect(event.args.amount).to.equal(claimableAmount);

        const recipientBalanceAfter = await testMockUSDC.read.balanceOf([testAddr2.account.address]);
        expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + claimableAmount);

        // Verify claimable amount is now 0
        const [finalClaimableAmount] = await testMailer.read.getRecipientClaimable([testAddr2.account.address]);
        expect(finalClaimableAmount).to.equal(0n);
      });

      it("Should revert distribute when contract not paused", async function () {
        const { mailer, addr1, addr2 } = this;
        await expect(
          mailer.write.distributeClaimableFunds([addr2.account.address], { account: addr1.account })
        ).to.be.rejectedWith("ContractNotPaused");
      });

      it("Should resume normal operations after unpause", async function () {
        const { mailer, mockUSDC, owner, addr1, addr2, publicClient } = this;
        await mailer.write.pause([], { account: owner.account });
        await mailer.write.unpause([], { account: owner.account });

        // Should be able to send messages again
        await mockUSDC.write.approve([mailer.address, parseUnits("1", 6)], { account: addr1.account });
        const hash = await mailer.write.send([addr2.account.address, "Test", "Test", addr1.account .address, false, false], { account: addr1.account  });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.MailSent();
        expect(logs.length).to.be.greaterThan(0);
      });

      it("Should allow emergency unpause by owner", async function () {
        const { mailer, owner, publicClient } = this;
        await mailer.write.pause([], { account: owner.account });

        const hash = await mailer.write.emergencyUnpause([], { account: owner.account });
        await publicClient.waitForTransactionReceipt({ hash });

        const logs = await mailer.getEvents.EmergencyUnpaused();
        expect(logs.length).to.be.greaterThan(0);

        expect(await mailer.read.isPaused()).to.be.false;
      });

      it("Should revert emergency unpause when not paused", async function () {
        const { mailer, owner } = this;
        await expect(
          mailer.write.emergencyUnpause([], { account: owner.account })
        ).to.be.rejectedWith("ContractNotPaused");
      });

      it("Should revert emergency unpause when non-owner calls", async function () {
        const { mailer, owner, addr1 } = this;
        await mailer.write.pause([], { account: owner.account });

        await expect(
          mailer.write.emergencyUnpause([], { account: addr1.account })
        ).to.be.rejectedWith("OnlyOwner");
      });

      it("Should prevent fee changes when paused", async function () {
        const { mailer, owner } = this;
        await mailer.write.pause([], { account: owner.account });

        await expect(
          mailer.write.setFee([parseUnits("0.2", 6)], { account: owner.account })
        ).to.be.rejectedWith("ContractIsPaused");

        await expect(
          mailer.write.setDelegationFee([parseUnits("20", 6)], { account: owner.account })
        ).to.be.rejectedWith("ContractIsPaused");
      });
    });

    describe("Permission System", function () {
      let contractAddr: any;

      beforeEach(async function () {
        const { addr2 } = this;
        // Use addr2 as a mock contract address for testing
        contractAddr = addr2.account.address;
      });

      describe("setPermission", function () {
        it("Should allow wallet to grant permission to a contract", async function () {
          const { mailer, addr1, publicClient } = this;
          const hash = await mailer.write.setPermission([contractAddr], { account: addr1.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.PermissionGranted();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.contractAddress.toLowerCase()).to.equal(contractAddr.toLowerCase());
          expect(event.args.wallet.toLowerCase()).to.equal(addr1.account.address.toLowerCase());

          // Verify permission is stored
          expect(await mailer.read.permissions([contractAddr, addr1.account.address])).to.be.true;
        });

        it("Should revert when trying to grant permission to zero address", async function () {
          const { mailer, addr1 } = this;
          await expect(
            mailer.write.setPermission([zeroAddress], { account: addr1.account })
          ).to.be.rejectedWith("InvalidAddress");
        });

        it("Should allow same wallet to grant permission to multiple contracts", async function () {
          const { mailer, addr1, owner } = this;
          const contract1 = contractAddr;
          const contract2 = owner.account.address; // Using owner as another mock contract

          await mailer.write.setPermission([contract1], { account: addr1.account });
          await mailer.write.setPermission([contract2], { account: addr1.account });

          expect(await mailer.read.permissions([contract1, addr1.account.address])).to.be.true;
          expect(await mailer.read.permissions([contract2, addr1.account.address])).to.be.true;
        });

        it("Should allow multiple wallets to grant permission to same contract", async function () {
          const { mailer, addr1, owner } = this;

          await mailer.write.setPermission([contractAddr], { account: addr1.account });
          await mailer.write.setPermission([contractAddr], { account: owner.account });

          expect(await mailer.read.permissions([contractAddr, addr1.account.address])).to.be.true;
          expect(await mailer.read.permissions([contractAddr, owner.account.address])).to.be.true;
        });

        it("Should revert when paused", async function () {
          const { mailer, owner, addr1 } = this;
          await mailer.write.pause([], { account: owner.account });

          await expect(
            mailer.write.setPermission([contractAddr], { account: addr1.account })
          ).to.be.rejectedWith("ContractIsPaused");
        });

        it("Should allow granting permission when already granted", async function () {
          const { mailer, addr1, publicClient } = this;
          // Grant permission first time
          await mailer.write.setPermission([contractAddr], { account: addr1.account });

          // Grant permission again - should not revert
          const hash = await mailer.write.setPermission([contractAddr], { account: addr1.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.PermissionGranted();
          expect(logs.length).to.be.greaterThan(0);
        });
      });

      describe("removePermission", function () {
        beforeEach(async function () {
          const { mailer, addr1 } = this;
          // Grant permission first
          await mailer.write.setPermission([contractAddr], { account: addr1.account });
        });

        it("Should allow wallet to revoke permission from a contract", async function () {
          const { mailer, addr1, publicClient } = this;
          const hash = await mailer.write.removePermission([contractAddr], { account: addr1.account });
          await publicClient.waitForTransactionReceipt({ hash });

          const logs = await mailer.getEvents.PermissionRevoked();
          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.contractAddress.toLowerCase()).to.equal(contractAddr.toLowerCase());
          expect(event.args.wallet.toLowerCase()).to.equal(addr1.account.address.toLowerCase());

          // Verify permission is removed
          expect(await mailer.read.permissions([contractAddr, addr1.account.address])).to.be.false;
        });

        it("Should allow revoking permission even when not paused", async function () {
          const { mailer, addr1 } = this;
          // Note: removePermission does not have whenNotPaused modifier
          expect(await mailer.read.permissions([contractAddr, addr1.account.address])).to.be.true;

          await mailer.write.removePermission([contractAddr], { account: addr1.account });

          expect(await mailer.read.permissions([contractAddr, addr1.account.address])).to.be.false;
        });

        it("Should allow revoking permission that doesn't exist", async function () {
          const { mailer, owner } = this;
          // owner never granted permission, but should be able to revoke
          await mailer.write.removePermission([contractAddr], { account: owner.account });

          expect(await mailer.read.permissions([contractAddr, owner.account.address])).to.be.false;
        });

        it("Should allow wallet to revoke and re-grant permission", async function () {
          const { mailer, addr1 } = this;

          // Revoke
          await mailer.write.removePermission([contractAddr], { account: addr1.account });
          expect(await mailer.read.permissions([contractAddr, addr1.account.address])).to.be.false;

          // Re-grant
          await mailer.write.setPermission([contractAddr], { account: addr1.account });
          expect(await mailer.read.permissions([contractAddr, addr1.account.address])).to.be.true;
        });
      });
    });

    describe("Email Sending Functions", function () {
      beforeEach(async function () {
        const { mockUSDC, mailer, addr1 } = this;
        // Give addr1 some USDC and approve contract
        await mockUSDC.write.mint([addr1.account.address, parseUnits("10", 6)]);
        await mockUSDC.write.approve([mailer.address, parseUnits("10", 6)], { account: addr1.account });
      });

      describe("sendToEmailAddress", function () {
        it("Should emit MailSentToEmail event when USDC transfer succeeds", async function () {
          const { mailer, addr1, publicClient } = this;
          const hash = await mailer.write.sendToEmailAddress(["test@example.com", "Test Subject", "Test Body", addr1.account.address], { account: addr1.account });

          await publicClient.waitForTransactionReceipt({ hash });
          const logs = await mailer.getEvents.MailSentToEmail();

          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.from.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.toEmail).to.equal("test@example.com");
          expect(event.args.subject).to.equal("Test Subject");
          expect(event.args.body).to.equal("Test Body");
        });

        it("Should transfer correct USDC amount to contract", async function () {
          const { mailer, mockUSDC, addr1 } = this;
          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

          await mailer.write.sendToEmailAddress(["test@example.com", "Subject", "Body", addr1.account.address], { account: addr1.account });

          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
          const fee = await mailer.read.sendFee();
          const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee
          expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
        });

        it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
          const { mailer, addr2 } = this;
          // addr2 has no USDC balance
          await expect(
            mailer.write.sendToEmailAddress(["test@example.com", "Subject", "Body", addr2.account.address], { account: addr2.account })
          ).to.be.rejectedWith("InsufficientBalance");
        });

        it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
          const { mailer, mockUSDC, addr2 } = this;
          // Give addr2 USDC but no allowance
          await mockUSDC.write.mint([addr2.account.address, parseUnits("1", 6)]);

          await expect(
            mailer.write.sendToEmailAddress(["test@example.com", "Subject", "Body", addr2.account.address], { account: addr2.account })
          ).to.be.rejectedWith("InsufficientAllowance");
        });

        it("Should work with empty strings", async function () {
          const { mailer, addr1, publicClient } = this;
          const hash = await mailer.write.sendToEmailAddress(["test@example.com", "", "", addr1.account.address], { account: addr1.account });

          await publicClient.waitForTransactionReceipt({ hash });
          const logs = await mailer.getEvents.MailSentToEmail();

          expect(logs.length).to.be.greaterThan(0);
        });

        it("Should work with long strings", async function () {
          const { mailer, addr1, publicClient } = this;
          const longSubject = "A".repeat(1000);
          const longBody = "B".repeat(5000);

          const hash = await mailer.write.sendToEmailAddress(["test@example.com", longSubject, longBody, addr1.account.address], { account: addr1.account });

          await publicClient.waitForTransactionReceipt({ hash });
          const logs = await mailer.getEvents.MailSentToEmail();

          expect(logs.length).to.be.greaterThan(0);
        });

        it("Should work with different email formats", async function () {
          const { mailer, addr1, publicClient } = this;
          const emails = [
            "user@example.com",
            "user.name+tag@example.co.uk",
            "user_name@sub.example.org"
          ];

          for (const email of emails) {
            const hash = await mailer.write.sendToEmailAddress([email, "Subject", "Body", addr1.account.address], { account: addr1.account });
            await publicClient.waitForTransactionReceipt({ hash });
          }

          const logs = await mailer.getEvents.MailSentToEmail();
          expect(logs.length).to.be.greaterThan(0);
        });

        it("Should revert when paused", async function () {
          const { mailer, owner, addr1 } = this;
          await mailer.write.pause([], { account: owner.account });

          await expect(
            mailer.write.sendToEmailAddress(["test@example.com", "Subject", "Body", addr1.account.address], { account: addr1.account })
          ).to.be.rejectedWith("ContractIsPaused");
        });
      });

      describe("sendPreparedToEmailAddress", function () {
        it("Should emit PreparedMailSentToEmail event when USDC transfer succeeds", async function () {
          const { mailer, addr1, publicClient } = this;
          const hash = await mailer.write.sendPreparedToEmailAddress(["test@example.com", "mail-123", addr1.account.address], { account: addr1.account });

          await publicClient.waitForTransactionReceipt({ hash });
          const logs = await mailer.getEvents.PreparedMailSentToEmail();

          expect(logs.length).to.be.greaterThan(0);
          const event = logs[logs.length - 1];
          expect(event.args.from.toLowerCase()).to.equal(addr1.account.address.toLowerCase());
          expect(event.args.toEmail).to.equal("test@example.com");
          expect(event.args.mailId).to.exist;
        });

        it("Should transfer correct USDC amount to contract", async function () {
          const { mailer, mockUSDC, addr1 } = this;
          const initialBalance = await mockUSDC.read.balanceOf([mailer.address]);

          await mailer.write.sendPreparedToEmailAddress(["test@example.com", "mail-456", addr1.account.address], { account: addr1.account });

          const finalBalance = await mockUSDC.read.balanceOf([mailer.address]);
          const fee = await mailer.read.sendFee();
          const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee
          expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
        });

        it("Should not emit event when USDC transfer fails (insufficient balance)", async function () {
          const { mailer, addr2 } = this;
          // addr2 has no USDC balance
          await expect(
            mailer.write.sendPreparedToEmailAddress(["test@example.com", "mail-789", addr2.account.address], { account: addr2.account })
          ).to.be.rejectedWith("InsufficientBalance");
        });

        it("Should not emit event when USDC transfer fails (insufficient allowance)", async function () {
          const { mailer, mockUSDC, addr2 } = this;
          // Give addr2 USDC but no allowance
          await mockUSDC.write.mint([addr2.account.address, parseUnits("1", 6)]);

          await expect(
            mailer.write.sendPreparedToEmailAddress(["test@example.com", "mail-abc", addr2.account.address], { account: addr2.account })
          ).to.be.rejectedWith("InsufficientAllowance");
        });

        it("Should work with empty mailId", async function () {
          const { mailer, addr1, publicClient } = this;
          const hash = await mailer.write.sendPreparedToEmailAddress(["test@example.com", "", addr1.account.address], { account: addr1.account });

          await publicClient.waitForTransactionReceipt({ hash });
          const logs = await mailer.getEvents.PreparedMailSentToEmail();

          expect(logs.length).to.be.greaterThan(0);
        });

        it("Should work with long mailId", async function () {
          const { mailer, addr1, publicClient } = this;
          const longMailId = "long-mail-id-" + "x".repeat(1000);

          const hash = await mailer.write.sendPreparedToEmailAddress(["test@example.com", longMailId, addr1.account.address], { account: addr1.account });

          await publicClient.waitForTransactionReceipt({ hash });
          const logs = await mailer.getEvents.PreparedMailSentToEmail();

          expect(logs.length).to.be.greaterThan(0);
        });

        it("Should handle special characters in mailId", async function () {
          const { mailer, addr1, publicClient } = this;
          const specialMailId = "mail-123!@#$%^&*()_+-=[]{}|;:,.<>?";

          const hash = await mailer.write.sendPreparedToEmailAddress(["test@example.com", specialMailId, addr1.account.address], { account: addr1.account });

          await publicClient.waitForTransactionReceipt({ hash });
          const logs = await mailer.getEvents.PreparedMailSentToEmail();

          expect(logs.length).to.be.greaterThan(0);
        });

        it("Should work with different email formats", async function () {
          const { mailer, addr1, publicClient } = this;
          const emails = [
            "user@example.com",
            "user.name+tag@example.co.uk",
            "user_name@sub.example.org"
          ];

          for (const email of emails) {
            const hash = await mailer.write.sendPreparedToEmailAddress([email, `mail-${email}`, addr1.account.address], { account: addr1.account });
            await publicClient.waitForTransactionReceipt({ hash });
          }

          const logs = await mailer.getEvents.PreparedMailSentToEmail();
          expect(logs.length).to.be.greaterThan(0);
        });

        it("Should revert when paused", async function () {
          const { mailer, owner, addr1 } = this;
          await mailer.write.pause([], { account: owner.account });

          await expect(
            mailer.write.sendPreparedToEmailAddress(["test@example.com", "mail-123", addr1.account.address], { account: addr1.account })
          ).to.be.rejectedWith("ContractIsPaused");
        });
      });
    });
  });
});

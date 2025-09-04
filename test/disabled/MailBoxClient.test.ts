import { expect } from "chai";
import { ethers } from "hardhat";
import { MailerClient, MailServiceClient, MailBoxClient } from "../../src/evm/mailer-client";
import { MockUSDC } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Define custom hardhat chain with correct chain ID (1337)
const hardhatLocal = defineChain({
  id: 1337,
  name: 'Hardhat Local',
  network: 'hardhat',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
});

describe("MailBox Client", function () {
  let mockUSDC: MockUSDC;
  let mailerClient: MailerClient;
  let mailServiceClient: MailServiceClient;
  let mailBoxClient: MailBoxClient;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy MockUSDC using ethers (since it's simpler for test setup)
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDCFactory.deploy();
    await mockUSDC.waitForDeployment();

    // Create viem clients for deployment
    const publicClient = createPublicClient({
      chain: hardhatLocal,
      transport: http("http://127.0.0.1:8545")
    });

    // Use hardhat's first account private key
    const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    
    const walletClient = createWalletClient({
      chain: hardhatLocal,
      transport: http("http://127.0.0.1:8545"),
      account
    });

    // Deploy using viem clients
    mailerClient = await MailerClient.deploy(
      walletClient, 
      publicClient, 
      account.address, 
      await mockUSDC.getAddress(), 
      owner.address
    );
    
    mailServiceClient = await MailServiceClient.deploy(
      walletClient, 
      publicClient, 
      account.address, 
      await mockUSDC.getAddress(), 
      owner.address
    );

    // Create unified client
    mailBoxClient = new MailBoxClient(
      await mailerClient.getAddress(),
      await mailServiceClient.getAddress(),
      publicClient
    );

    // Fund test accounts
    await mockUSDC.mint(addr1.address, ethers.parseUnits("1000", 6));
    await mockUSDC.mint(addr2.address, ethers.parseUnits("1000", 6));

    // Approve spending
    await mockUSDC.connect(addr1).approve(await mailServiceClient.getAddress(), ethers.parseUnits("1000", 6));
    await mockUSDC.connect(addr2).approve(await mailServiceClient.getAddress(), ethers.parseUnits("1000", 6));
    await mockUSDC.connect(addr1).approve(await mailerClient.getAddress(), ethers.parseUnits("1000", 6));
    await mockUSDC.connect(addr2).approve(await mailerClient.getAddress(), ethers.parseUnits("1000", 6));
  });

  describe("MailServiceClient", function () {
    it("Should handle delegation functionality", async function () {
      // Create viem clients for addr1 and addr2
      const addr1Account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'); // addr1
      const addr2Account = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'); // addr2
      
      const publicClient = createPublicClient({
        chain: hardhatLocal,
        transport: http("http://127.0.0.1:8545")
      });

      const addr1WalletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http("http://127.0.0.1:8545"),
        account: addr1Account
      });

      const addr2WalletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http("http://127.0.0.1:8545"),
        account: addr2Account
      });

      // Create client instances
      const addr1MailServiceClient = new MailServiceClient(
        await mailServiceClient.getAddress(),
        publicClient
      );

      // Delegate from addr1 to addr2
      const delegateHash = await addr1MailServiceClient.delegateTo(
        addr2.address,
        addr1WalletClient,
        addr1Account.address
      );
      
      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash: delegateHash });

      // addr2 rejects the delegation  
      const rejectHash = await addr1MailServiceClient.rejectDelegation(
        addr1.address,
        addr2WalletClient,
        addr2Account.address
      );
      
      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash: rejectHash });
    });

    it("Should get fees correctly", async function () {
      expect(await mailServiceClient.getDelegationFee()).to.equal(ethers.parseUnits("10", 6));
    });
  });

  describe("MailerClient", function () {
    it("Should send messages correctly", async function () {
      const addr1Account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'); // addr1
      
      const publicClient = createPublicClient({
        chain: hardhatLocal,
        transport: http("http://127.0.0.1:8545")
      });

      const addr1WalletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http("http://127.0.0.1:8545"),
        account: addr1Account
      });

      const addr1MailerClient = new MailerClient(
        await mailerClient.getAddress(),
        publicClient
      );

      // Send priority message
      const sendHash = await addr1MailerClient.sendPriority(
        addr1.address, 
        "Test Subject", 
        "Test Body", 
        addr1WalletClient,
        addr1Account.address
      );
      
      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash: sendHash });
    });

    it("Should get fees correctly", async function () {
      expect(await mailerClient.getSendFee()).to.equal(ethers.parseUnits("0.1", 6));
    });
  });

  describe("MailBoxClient unified", function () {
    it("Should provide access to both services", async function () {
      expect(mailBoxClient.mailer).to.be.instanceOf(MailerClient);
      expect(mailBoxClient.mailService).to.be.instanceOf(MailServiceClient);

      // Test that both clients work through unified interface
      expect(await mailBoxClient.mailer.getSendFee()).to.equal(ethers.parseUnits("0.1", 6));
      expect(await mailBoxClient.mailService.getDelegationFee()).to.equal(ethers.parseUnits("10", 6));
    });

    it("Should deploy both contracts using deployBoth", async function () {
      // Create viem clients for deployment
      const publicClient = createPublicClient({
        chain: hardhatLocal,
        transport: http("http://127.0.0.1:8545")
      });

      const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
      
      const walletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http("http://127.0.0.1:8545"),
        account
      });

      const unifiedClient = await MailBoxClient.deployBoth(
        walletClient,
        publicClient,
        account.address,
        await mockUSDC.getAddress(),
        owner.address
      );

      expect(unifiedClient.mailer).to.be.instanceOf(MailerClient);
      expect(unifiedClient.mailService).to.be.instanceOf(MailServiceClient);

      // Verify they work
      expect(await unifiedClient.mailer.getSendFee()).to.equal(ethers.parseUnits("0.1", 6));
      expect(await unifiedClient.mailService.getDelegationFee()).to.equal(ethers.parseUnits("10", 6));
    });
  });
});
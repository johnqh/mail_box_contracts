import { expect } from 'chai';
import { ethers } from 'hardhat';
import { MailBoxFactoryClient } from '../../src/evm/mailer-client';
import { MockUSDC } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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

describe('MailBoxFactoryClient', function () {
  let mockUSDC: MockUSDC;
  let factoryClient: MailBoxFactoryClient;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory('MockUSDC');
    mockUSDC = await MockUSDCFactory.deploy();
    await mockUSDC.waitForDeployment();

    // Create viem clients for deployment
    const publicClient = createPublicClient({
      chain: hardhatLocal,
      transport: http('http://127.0.0.1:8545'),
    });

    const account = privateKeyToAccount(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    );

    const walletClient = createWalletClient({
      chain: hardhatLocal,
      transport: http('http://127.0.0.1:8545'),
      account,
    });

    // Deploy MailBoxFactory using client
    factoryClient = await MailBoxFactoryClient.deploy(
      walletClient,
      publicClient,
      account.address
    );
  });

  describe('Deployment', function () {
    it('Should deploy factory successfully', async function () {
      expect(factoryClient).to.be.instanceOf(MailBoxFactoryClient);
      expect(await factoryClient.getAddress()).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe('Salt generation', function () {
    it('Should generate consistent salts', async function () {
      const salt1 = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'Mailer'
      );
      const salt2 = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'Mailer'
      );
      expect(salt1).to.equal(salt2);
    });

    it('Should generate different salts for different parameters', async function () {
      const mailerSalt = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'Mailer'
      );
      const serviceSalt = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'MailService'
      );
      expect(mailerSalt).to.not.equal(serviceSalt);
    });
  });

  describe('Address prediction', function () {
    let salt: string;
    let usdcAddress: string;

    beforeEach(async function () {
      salt = await factoryClient.generateSalt('MailBox', '1.0.0', 'Mailer');
      usdcAddress = await mockUSDC.getAddress();
    });

    it('Should predict Mailer address', async function () {
      const predictedAddress = await factoryClient.predictMailerAddress(
        usdcAddress,
        owner.address,
        salt
      );
      expect(ethers.isAddress(predictedAddress)).to.be.true;
      expect(predictedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it('Should predict MailService address', async function () {
      const predictedAddress = await factoryClient.predictMailServiceAddress(
        usdcAddress,
        owner.address,
        salt
      );
      expect(ethers.isAddress(predictedAddress)).to.be.true;
      expect(predictedAddress).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe('Contract deployment', function () {
    let mailerSalt: string;
    let mailServiceSalt: string;
    let usdcAddress: string;

    beforeEach(async function () {
      mailerSalt = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'Mailer'
      );
      mailServiceSalt = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'MailService'
      );
      usdcAddress = await mockUSDC.getAddress();
    });

    it('Should deploy Mailer contract', async function () {
      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      );
      const walletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http('http://127.0.0.1:8545'),
        account,
      });

      const predictedAddress = await factoryClient.predictMailerAddress(
        usdcAddress,
        owner.address,
        mailerSalt
      );
      const deployedAddress = await factoryClient.deployMailer(
        usdcAddress,
        owner.address,
        mailerSalt,
        walletClient,
        account
      );

      expect(deployedAddress).to.equal(predictedAddress);
      expect(await factoryClient.isContractDeployed(deployedAddress)).to.be
        .true;
    });

    it('Should deploy MailService contract', async function () {
      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      );
      const walletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http('http://127.0.0.1:8545'),
        account,
      });

      const predictedAddress = await factoryClient.predictMailServiceAddress(
        usdcAddress,
        owner.address,
        mailServiceSalt
      );
      const deployedAddress = await factoryClient.deployMailService(
        usdcAddress,
        owner.address,
        mailServiceSalt,
        walletClient,
        account
      );

      expect(deployedAddress).to.equal(predictedAddress);
      expect(await factoryClient.isContractDeployed(deployedAddress)).to.be
        .true;
    });

    it('Should deploy both contracts in single transaction', async function () {
      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      );
      const walletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http('http://127.0.0.1:8545'),
        account,
      });

      const predictedMailer = await factoryClient.predictMailerAddress(
        usdcAddress,
        owner.address,
        mailerSalt
      );
      const predictedMailService =
        await factoryClient.predictMailServiceAddress(
          usdcAddress,
          owner.address,
          mailServiceSalt
        );

      const result = await factoryClient.deployBoth(
        usdcAddress,
        owner.address,
        mailerSalt,
        mailServiceSalt,
        walletClient,
        account
      );

      expect(result.mailer).to.equal(predictedMailer);
      expect(result.mailService).to.equal(predictedMailService);
      expect(await factoryClient.isContractDeployed(result.mailer)).to.be.true;
      expect(await factoryClient.isContractDeployed(result.mailService)).to.be
        .true;
    });
  });

  describe('Contract existence checking', function () {
    it('Should return false for non-existent contracts', async function () {
      const randomAddress = '0x1234567890123456789012345678901234567890';
      expect(await factoryClient.isContractDeployed(randomAddress)).to.be.false;
    });

    it('Should return false for EOA addresses', async function () {
      expect(await factoryClient.isContractDeployed(addr1.address)).to.be.false;
    });

    it('Should return true for deployed contracts', async function () {
      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      );
      const walletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http('http://127.0.0.1:8545'),
        account,
      });

      const salt = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'Mailer'
      );
      const usdcAddress = await mockUSDC.getAddress();

      const deployedAddress = await factoryClient.deployMailer(
        usdcAddress,
        owner.address,
        salt,
        walletClient,
        account
      );
      expect(await factoryClient.isContractDeployed(deployedAddress)).to.be
        .true;
    });
  });

  describe('Integration with existing clients', function () {
    it('Should work with MailerClient', async function () {
      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      );
      const walletClient = createWalletClient({
        chain: hardhatLocal,
        transport: http('http://127.0.0.1:8545'),
        account,
      });

      const salt = await factoryClient.generateSalt(
        'MailBox',
        '1.0.0',
        'Mailer'
      );
      const usdcAddress = await mockUSDC.getAddress();

      // Deploy using factory client
      const mailerAddress = await factoryClient.deployMailer(
        usdcAddress,
        owner.address,
        salt,
        walletClient,
        account
      );

      // Connect using MailerClient from existing codebase
      const { MailerClient } = await import('../../src/evm/mailer-client');
      const publicClient = createPublicClient({
        chain: hardhatLocal,
        transport: http('http://127.0.0.1:8545'),
      });
      const mailerClient = new MailerClient(mailerAddress, publicClient);

      // Verify it works
      expect(await mailerClient.getSendFee()).to.equal(
        ethers.parseUnits('0.1', 6)
      );
      expect(await mailerClient.getUsdcToken()).to.equal(usdcAddress);
    });
  });
});

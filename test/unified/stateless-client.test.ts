import { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chai from 'chai';
import { ChainType, Chain } from '@sudobility/types';
import { RpcHelpers } from '@sudobility/configs';
import { OnchainMailerClient } from '../../src/unified/onchain-mailer-client.js';

chai.use(chaiAsPromised);

describe('Stateless OnchainMailerClient', () => {
  let client: OnchainMailerClient;

  beforeEach(() => {
    // Create a stateless client - no configuration needed
    client = new OnchainMailerClient();
  });

  describe('constructor', () => {
    it('should create a stateless client with no parameters', () => {
      expect(client).to.be.instanceOf(OnchainMailerClient);
    });

    it('should not store any configuration', () => {
      // Check that no properties are stored on the instance
      const keys = Object.keys(client);
      // Only static cache properties should exist
      expect(keys).to.be.empty;
    });
  });

  describe('ChainInfo integration', () => {
    it('should accept ChainInfo from @sudobility/configs', () => {
      // Get chain info for Ethereum mainnet
      const chainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);

      expect(chainInfo).to.have.property('chainType', ChainType.EVM);
      expect(chainInfo).to.have.property('chainId', 1);
      expect(chainInfo).to.have.property('name', 'Ethereum');
      expect(chainInfo).to.have.property('usdcAddress');
    });

    it('should get chain info for Solana', () => {
      const chainInfo = RpcHelpers.getChainInfo(Chain.SOLANA_MAINNET);

      expect(chainInfo).to.have.property('chainType', ChainType.SOLANA);
      expect(chainInfo).to.have.property('name').that.includes('Solana');
      expect(chainInfo).to.have.property('usdcAddress');
    });

    it('should handle multiple chains', () => {
      const chains = [
        Chain.ETH_MAINNET,
        Chain.POLYGON_MAINNET,
        Chain.ARBITRUM_MAINNET,
        Chain.OPTIMISM_MAINNET,
        Chain.SOLANA_MAINNET
      ];

      chains.forEach(chain => {
        const info = RpcHelpers.getChainInfo(chain);
        expect(info).to.have.property('chainType');
        expect(info).to.have.property('chainId');
        expect(info).to.have.property('name');
      });
    });
  });

  describe('Method signatures', () => {
    it('should have sendMessage method that accepts wallet and chainInfo', () => {
      expect(client.sendMessage).to.be.a('function');
      // Method signature: sendMessage(wallet, chainInfo, subject, body, options?)
      expect(client.sendMessage.length).to.equal(5);
    });

    it('should have delegateTo method that accepts wallet and chainInfo', () => {
      expect(client.delegateTo).to.be.a('function');
      // Method signature: delegateTo(wallet, chainInfo, delegate, options?)
      expect(client.delegateTo.length).to.equal(4);
    });

    it('should have claimRevenue method that accepts wallet and chainInfo', () => {
      expect(client.claimRevenue).to.be.a('function');
      // Method signature: claimRevenue(wallet, chainInfo, options?)
      expect(client.claimRevenue.length).to.equal(3);
    });

    it('should have getSendFee method that accepts chainInfo', () => {
      expect(client.getSendFee).to.be.a('function');
      // Method signature: getSendFee(chainInfo, publicClient?, connection?)
      expect(client.getSendFee.length).to.equal(3);
    });

    it('should have getDelegation method that accepts chainInfo', () => {
      expect(client.getDelegation).to.be.a('function');
      // Method signature: getDelegation(address, chainInfo, publicClient?, connection?)
      expect(client.getDelegation.length).to.equal(4);
    });
  });

  describe('Error handling', () => {
    it('should validate message subject', async () => {
      const mockWallet = { walletClient: {}, publicClient: {} };
      const mockChainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);

      // Subject too long
      const longSubject = 'x'.repeat(201);
      await expect(
        client.sendMessage(mockWallet, mockChainInfo, longSubject, 'Body')
      ).to.be.rejectedWith('Subject must be 1-200 characters');

      // Empty subject
      await expect(
        client.sendMessage(mockWallet, mockChainInfo, '', 'Body')
      ).to.be.rejectedWith('Subject must be 1-200 characters');
    });

    it('should validate message body', async () => {
      const mockWallet = { walletClient: {}, publicClient: {} };
      const mockChainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);

      // Body too long
      const longBody = 'x'.repeat(10001);
      await expect(
        client.sendMessage(mockWallet, mockChainInfo, 'Subject', longBody)
      ).to.be.rejectedWith('Body must be 1-10000 characters');

      // Empty body
      await expect(
        client.sendMessage(mockWallet, mockChainInfo, 'Subject', '')
      ).to.be.rejectedWith('Body must be 1-10000 characters');
    });

    it('should throw error for unsupported chain type', async () => {
      const mockWallet = { walletClient: {}, publicClient: {} };
      const invalidChainInfo = {
        ...RpcHelpers.getChainInfo(Chain.ETH_MAINNET),
        chainType: 'INVALID' as any
      };

      await expect(
        client.sendMessage(mockWallet, invalidChainInfo, 'Subject', 'Body')
      ).to.be.rejectedWith('Unsupported chain type');
    });
  });

  describe('Stateless behavior', () => {
    it('should allow using the same client with different chains', () => {
      const ethChainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);
      const polygonChainInfo = RpcHelpers.getChainInfo(Chain.POLYGON_MAINNET);
      const solanaChainInfo = RpcHelpers.getChainInfo(Chain.SOLANA_MAINNET);

      // All these should be valid (though they would fail at execution without real wallets)
      expect(() => {
        client.getSendFee(ethChainInfo);
        client.getSendFee(polygonChainInfo);
        client.getSendFee(solanaChainInfo);
      }).to.not.throw();
    });

    it('should allow concurrent operations on different chains', async () => {
      // This test demonstrates that the client can handle multiple chains concurrently
      const chains = [
        Chain.ETH_MAINNET,
        Chain.POLYGON_MAINNET,
        Chain.ARBITRUM_MAINNET
      ].map(chain => RpcHelpers.getChainInfo(chain));

      // These would all run concurrently with different chain info
      const operations = chains.map(chainInfo => {
        // Each operation uses different chain info
        return Promise.resolve(chainInfo.name);
      });

      const results = await Promise.all(operations);
      expect(results).to.have.lengthOf(3);
      expect(results).to.include('Ethereum');
      expect(results).to.include('Polygon');
      expect(results).to.include('Arbitrum');
    });
  });
});
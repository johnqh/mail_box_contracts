import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import chai from "chai";
import { Keypair } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { OnchainMailerClient } from "../../src/unified/onchain-mailer-client";
import { ChainConfig } from "../../src/unified/types";

chai.use(chaiAsPromised);

describe("OnchainMailerClient", function () {
  let testConfig: ChainConfig;

  beforeEach(function () {
    testConfig = {
      evm: {
        rpc: "http://localhost:8545",
        chainId: 31337,
        contracts: {
          mailService: "0x1234567890123456789012345678901234567890",
          mailer: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          usdc: "0x9876543210987654321098765432109876543210"
        }
      },
      solana: {
        rpc: "http://localhost:8899", 
        programs: {
          mailService: "8EKjCLZjz6LKRxZcQ6LwwF5V8P3TCEgM2CdQg4pZxXHE",
          mailer: "9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF",
          mailBoxFactory: "FactoryABC123def456GHI789jkl012MNO345pqr678STU"
        },
        usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
      }
    };
  });

  describe("constructor", function () {
    it("should initialize with Solana wallet", function () {
      const keypair = Keypair.generate();
      const solanaWallet = new Wallet(keypair);

      const client = new OnchainMailerClient(solanaWallet, testConfig);

      expect(client.getChainType()).to.equal("solana");
      expect(client.getWalletAddress()).to.equal(keypair.publicKey.toString());
    });

    it("should initialize with EVM wallet", function () {
      const evmWallet = {
        address: "0x1234567890123456789012345678901234567890",
        request: async () => {},
        signTransaction: async (tx: any) => tx
      };

      const client = new OnchainMailerClient(evmWallet, testConfig);

      expect(client.getChainType()).to.equal("evm");
      expect(client.getWalletAddress()).to.equal("0x1234567890123456789012345678901234567890");
    });

    it("should throw error for missing EVM configuration", function () {
      const evmWallet = {
        address: "0x1234567890123456789012345678901234567890",
        request: async () => {},
        signTransaction: async (tx: any) => tx
      };

      const configWithoutEVM: ChainConfig = {
        solana: testConfig.solana
      };

      expect(() => new OnchainMailerClient(evmWallet, configWithoutEVM))
        .to.throw("EVM configuration required for EVM wallet");
    });

    it("should throw error for missing Solana configuration", function () {
      const keypair = Keypair.generate();
      const solanaWallet = new Wallet(keypair);

      const configWithoutSolana: ChainConfig = {
        evm: testConfig.evm
      };

      expect(() => new OnchainMailerClient(solanaWallet, configWithoutSolana))
        .to.throw("Solana configuration required for Solana wallet");
    });
  });

  describe("delegateTo", function () {
    it("should validate delegate address format for EVM", async function () {
      const evmWallet = {
        address: "0x1234567890123456789012345678901234567890",
        request: async () => {},
        signTransaction: async (tx: any) => tx
      };

      const client = new OnchainMailerClient(evmWallet, testConfig);

      // Solana address format should fail for EVM wallet
      const solanaAddress = Keypair.generate().publicKey.toString();

      await expect(client.delegateTo(solanaAddress))
        .to.be.rejected;
    });

    it("should validate delegate address format for Solana", async function () {
      const keypair = Keypair.generate();
      const solanaWallet = new Wallet(keypair);

      const client = new OnchainMailerClient(solanaWallet, testConfig);

      // EVM address format should fail for Solana wallet  
      const evmAddress = "0x1234567890123456789012345678901234567890";

      await expect(client.delegateTo(evmAddress))
        .to.be.rejected;
    });
  });

  describe("registerDomain", function () {
    it("should throw error for domain registration (not implemented)", async function () {
      const keypair = Keypair.generate();
      const solanaWallet = new Wallet(keypair);
      const client = new OnchainMailerClient(solanaWallet, testConfig);

      await expect(client.registerDomain("test.domain"))
        .to.be.rejected;
    });
  });

  describe("sendMessage", function () {
    it("should route to appropriate chain implementation", async function () {
      this.timeout(5000); // Increase timeout for network operations

      // This test would require mocking the actual chain implementations
      // For now, we test the routing logic by checking error messages

      const keypair = Keypair.generate();
      const solanaWallet = new Wallet(keypair);
      const client = new OnchainMailerClient(solanaWallet, testConfig);

      // Should attempt to use Solana implementation and fail due to missing connection
      try {
        await client.sendMessage("Test", "Body");
        expect.fail("Should have thrown an error");
      } catch (error) {
        // Expect either a connection error or configuration error
        expect(error).to.be.instanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).to.satisfy((msg: string) =>
          msg.includes('Connection timeout') ||
          msg.includes('Solana') ||
          msg.includes('RPC') ||
          msg.includes('connection')
        );
      }
    });
  });

  describe("utility methods", function () {
    it("should return correct chain type", function () {
      const keypair = Keypair.generate();
      const solanaWallet = new Wallet(keypair);
      const client = new OnchainMailerClient(solanaWallet, testConfig);

      expect(client.getChainType()).to.equal("solana");
    });

    it("should return correct wallet address", function () {
      const evmWallet = {
        address: "0x1234567890123456789012345678901234567890",
        request: async () => {},
        signTransaction: async (tx: any) => tx
      };

      const client = new OnchainMailerClient(evmWallet, testConfig);
      expect(client.getWalletAddress()).to.equal("0x1234567890123456789012345678901234567890");
    });
  });
});
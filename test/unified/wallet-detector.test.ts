import { expect } from "chai";
import { Keypair, Transaction } from "@solana/web3.js";
import { Wallet } from "../../src/solana/index.js";
import { WalletDetector } from "../../src/unified/wallet-detector.js";

// Simple wallet wrapper for testing
function createWallet(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction>(txs: T[]): Promise<T[]> => {
      txs.forEach(tx => tx.partialSign(keypair));
      return txs;
    },
  };
}

describe("WalletDetector", function () {
  describe("detectWalletType", function () {
    it("should detect EVM wallet correctly", function () {
      const evmWallet = {
        address: "0x1234567890123456789012345678901234567890",
        request: async () => {},
        signTransaction: async (tx: any) => tx
      };

      const result = WalletDetector.detectWalletType(evmWallet);
      expect(result).to.equal("evm");
    });

    it("should detect Solana wallet correctly", function () {
      const keypair = Keypair.generate();
      const solanaWallet = createWallet(keypair);

      const result = WalletDetector.detectWalletType(solanaWallet);
      expect(result).to.equal("solana");
    });

    it("should detect Web3 provider as EVM", function () {
      const web3Wallet = {
        address: "0x1234567890123456789012345678901234567890",
        provider: {},
        signTransaction: async (tx: any) => tx
      };

      const result = WalletDetector.detectWalletType(web3Wallet);
      expect(result).to.equal("evm");
    });

    it("should throw error for unsupported wallet", function () {
      const invalidWallet = {
        someProperty: "value"
      };

      expect(() => WalletDetector.detectWalletType(invalidWallet))
        .to.throw("Unsupported wallet type");
    });
  });

  describe("isEVMAddress", function () {
    it("should validate correct EVM addresses", function () {
      const validAddresses = [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefABCDEF1234567890123456789012345678",
        "0x0000000000000000000000000000000000000000"
      ];

      validAddresses.forEach(address => {
        expect(WalletDetector.isEVMAddress(address)).to.be.true;
      });
    });

    it("should reject invalid EVM addresses", function () {
      const invalidAddresses = [
        "1234567890123456789012345678901234567890", // Missing 0x
        "0x12345", // Too short
        "0x12345678901234567890123456789012345678901", // Too long
        "0xGHIJ567890123456789012345678901234567890", // Invalid chars
        "not-an-address"
      ];

      invalidAddresses.forEach(address => {
        expect(WalletDetector.isEVMAddress(address)).to.be.false;
      });
    });
  });

  describe("isSolanaAddress", function () {
    it("should validate correct Solana addresses", function () {
      const keypair = Keypair.generate();
      const address = keypair.publicKey.toString();
      
      expect(WalletDetector.isSolanaAddress(address)).to.be.true;
    });

    it("should validate known Solana addresses", function () {
      const validAddresses = [
        "DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "So11111111111111111111111111111111111111112"
      ];

      validAddresses.forEach(address => {
        expect(WalletDetector.isSolanaAddress(address)).to.be.true;
      });
    });

    it("should reject invalid Solana addresses", function () {
      const invalidAddresses = [
        "0x1234567890123456789012345678901234567890", // EVM address
        "too-short",
        "this-address-is-way-too-long-to-be-valid-solana-address-format",
        "invalid-chars-!@#$%",
        ""
      ];

      invalidAddresses.forEach(address => {
        expect(WalletDetector.isSolanaAddress(address)).to.be.false;
      });
    });
  });

  describe("detectChainFromAddress", function () {
    it("should detect EVM chain from address", function () {
      const evmAddress = "0x1234567890123456789012345678901234567890";
      const result = WalletDetector.detectChainFromAddress(evmAddress);
      expect(result).to.equal("evm");
    });

    it("should detect Solana chain from address", function () {
      const keypair = Keypair.generate();
      const solanaAddress = keypair.publicKey.toString();
      const result = WalletDetector.detectChainFromAddress(solanaAddress);
      expect(result).to.equal("solana");
    });

    it("should return null for invalid addresses", function () {
      const invalidAddresses = [
        "invalid-address",
        "",
        "123",
        "not-an-address-format"
      ];

      invalidAddresses.forEach(address => {
        const result = WalletDetector.detectChainFromAddress(address);
        expect(result).to.be.null;
      });
    });
  });
});
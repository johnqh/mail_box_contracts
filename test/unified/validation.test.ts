import { expect } from "chai";
import { validateDomain, validateMessage, validateAddress, validateAmount } from "../../src/utils/validation";

describe("Validation Utilities", function () {
  describe("validateDomain", function () {
    it("should validate correct domain formats", function () {
      const validDomains = [
        "example.com",
        "test.mailbox",
        "my-domain.co",
        "sub.domain.example",
        "a.b",
        "single-word"
      ];

      validDomains.forEach(domain => {
        expect(() => validateDomain(domain)).to.not.throw();
        expect(validateDomain(domain)).to.be.true;
      });
    });

    it("should reject empty domains", function () {
      expect(() => validateDomain("")).to.throw("Domain cannot be empty");
    });

    it("should reject domains that are too long", function () {
      const longDomain = "a".repeat(101);
      expect(() => validateDomain(longDomain)).to.throw("Domain cannot exceed 100 characters");
    });

    it("should reject invalid domain formats", function () {
      const invalidDomains = [
        "-invalid.com", // Starts with hyphen
        "invalid-.com", // Ends with hyphen
        ".invalid.com", // Starts with dot
        "invalid.com.", // Ends with dot
        "inv@lid.com", // Contains invalid character
        "invalid..com", // Double dots
        ""
      ];

      invalidDomains.slice(0, -1).forEach(domain => { // Exclude empty string (tested separately)
        expect(() => validateDomain(domain)).to.throw("Invalid domain format");
      });
    });
  });

  describe("validateMessage", function () {
    it("should validate correct messages", function () {
      const validMessages = [
        { subject: "Test Subject", body: "Test body content" },
        { subject: "A", body: "B" },
        { subject: "Long subject " + "a".repeat(150), body: "Long body " + "b".repeat(9000) }
      ];

      validMessages.forEach(({ subject, body }) => {
        expect(() => validateMessage(subject, body)).to.not.throw();
        expect(validateMessage(subject, body)).to.be.true;
      });
    });

    it("should reject empty subjects", function () {
      expect(() => validateMessage("", "Valid body")).to.throw("Message subject cannot be empty");
    });

    it("should reject subjects that are too long", function () {
      const longSubject = "a".repeat(201);
      expect(() => validateMessage(longSubject, "Valid body")).to.throw("Message subject cannot exceed 200 characters");
    });

    it("should reject empty bodies", function () {
      expect(() => validateMessage("Valid subject", "")).to.throw("Message body cannot be empty");
    });

    it("should reject bodies that are too long", function () {
      const longBody = "a".repeat(10001);
      expect(() => validateMessage("Valid subject", longBody)).to.throw("Message body cannot exceed 10000 characters");
    });
  });

  describe("validateAddress", function () {
    it("should validate correct EVM addresses", function () {
      const validEVMAddresses = [
        "0x1234567890123456789012345678901234567890",
        "0xabcdefABCDEF1234567890123456789012345678",
        "0x0000000000000000000000000000000000000000"
      ];

      validEVMAddresses.forEach(address => {
        expect(() => validateAddress(address, "evm")).to.not.throw();
        expect(validateAddress(address, "evm")).to.be.true;
      });
    });

    it("should validate correct Solana addresses", function () {
      const validSolanaAddresses = [
        "DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1",
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "11111111111111111111111111111112"
      ];

      validSolanaAddresses.forEach(address => {
        expect(() => validateAddress(address, "solana")).to.not.throw();
        expect(validateAddress(address, "solana")).to.be.true;
      });
    });

    it("should reject empty addresses", function () {
      expect(() => validateAddress("", "evm")).to.throw("Address cannot be empty");
      expect(() => validateAddress("", "solana")).to.throw("Address cannot be empty");
    });

    it("should reject invalid EVM addresses", function () {
      const invalidEVMAddresses = [
        "1234567890123456789012345678901234567890", // Missing 0x
        "0x12345", // Too short
        "0xGHIJ567890123456789012345678901234567890" // Invalid chars
      ];

      invalidEVMAddresses.forEach(address => {
        expect(() => validateAddress(address, "evm")).to.throw("Invalid EVM address format");
      });
    });

    it("should reject invalid Solana addresses", function () {
      const invalidSolanaAddresses = [
        "0x1234567890123456789012345678901234567890", // EVM format
        "too-short",
        "invalid-chars-!@#$%"
      ];

      invalidSolanaAddresses.forEach(address => {
        expect(() => validateAddress(address, "solana")).to.throw("Invalid Solana address format");
      });
    });

    it("should reject unsupported chain types", function () {
      expect(() => validateAddress("valid-address", "bitcoin" as any))
        .to.throw("Unsupported chain type: bitcoin");
    });
  });

  describe("validateAmount", function () {
    it("should validate and convert correct amounts", function () {
      const testCases = [
        { input: "100", expected: 100n },
        { input: 50, expected: 50n },
        { input: 0n, expected: 0n },
        { input: "1000000", expected: 1000000n },
        { input: 0, expected: 0n }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(() => validateAmount(input)).to.not.throw();
        expect(validateAmount(input)).to.equal(expected);
      });
    });

    it("should handle decimal numbers by flooring", function () {
      expect(validateAmount(10.7)).to.equal(10n);
      expect(validateAmount(99.9)).to.equal(99n);
    });

    it("should reject negative amounts", function () {
      const negativeAmounts = [-1, "-10", -100n];

      negativeAmounts.forEach(amount => {
        expect(() => validateAmount(amount)).to.throw("Amount cannot be negative");
      });
    });

    it("should reject invalid amount formats", function () {
      const invalidAmounts = ["not-a-number", "abc", "", null, undefined];

      invalidAmounts.forEach(amount => {
        expect(() => validateAmount(amount as any)).to.throw("Invalid amount format");
      });
    });
  });
});
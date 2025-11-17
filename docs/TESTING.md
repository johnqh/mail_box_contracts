# Testing Guide - Mailer Contracts

This document provides comprehensive guidance for testing the Mailer smart contract system, including patterns, best practices, and examples.

## Test Overview

The project includes **81 comprehensive tests** across two main test suites:

- **MailService Tests**: 27 tests covering delegation and domain management
- **Mailer Tests**: 54 tests covering messaging and revenue sharing

## Test Architecture

### Test Setup Pattern

All tests follow a consistent setup pattern using Hardhat's testing framework:

```typescript
describe("ContractName", function () {
  let contract: ContractType;
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
    
    // Deploy main contract
    const Contract = await ethers.getContractFactory("ContractName");
    contract = await Contract.deploy(
      await mockUSDC.getAddress(), 
      owner.address
    );
    await contract.waitForDeployment();
  });
});
```

### USDC Test Pattern

Since both contracts rely heavily on USDC transfers, tests follow this pattern:

```typescript
// 1. Fund test accounts
await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));

// 2. Approve contract to spend USDC
await mockUSDC.connect(addr1).approve(
  await contract.getAddress(), 
  ethers.parseUnits("100", 6)
);

// 3. Execute function and test
await expect(contract.connect(addr1).someFunction(...args))
  .to.emit(contract, "EventName")
  .withArgs(...expectedArgs);
```

## MailService Test Categories

### 1. Contract Setup Tests (4 tests)

**Purpose**: Verify proper contract initialization

```typescript
it("Should set owner as deployer", async function () {
  expect(await mailerClient.owner()).to.equal(owner.address);
});

it("Should set USDC token address correctly", async function () {
  expect(await mailerClient.usdcToken()).to.equal(await mockUSDC.getAddress());
});

it("Should set correct default registration fee", async function () {
  expect(await mailerClient.registrationFee()).to.equal(100000000); // 100 USDC
});
```

### 2. Delegation Tests (6 tests)

**Covers**: Delegation creation, clearing, fees, and edge cases

```typescript
it("Should allow EOA to delegate and charge fee", async function () {
  const initialBalance = await mockUSDC.balanceOf(await mailerClient.getAddress());
  
  await expect(
    mailerClient.connect(addr1).delegateTo(addr2.address)
  ).to.emit(mailerClient, "DelegationSet")
   .withArgs(addr1.address, addr2.address);
  
  // Verify fee was charged
  const finalBalance = await mockUSDC.balanceOf(await mailerClient.getAddress());
  expect(finalBalance - initialBalance).to.equal(10000000); // 10 USDC
});
```

### 3. Rejection Tests (5 tests)

**Covers**: Delegation rejection mechanics and error conditions

```typescript
it("Should allow delegate to reject delegation", async function () {
  // First, addr1 delegates to addr2
  await mailerClient.connect(addr1).delegateTo(addr2.address);
  
  // Verify delegation is set
  expect(await mailerClient.delegations(addr1.address)).to.equal(addr2.address);
  
  // Now addr2 rejects the delegation
  await expect(
    mailerClient.connect(addr2).rejectDelegation(addr1.address)
  ).to.emit(mailerClient, "DelegationSet")
   .withArgs(addr1.address, ethers.ZeroAddress);
  
  // Verify delegation is cleared
  expect(await mailerClient.delegations(addr1.address)).to.equal(ethers.ZeroAddress);
});
```

### 4. Domain Registration Tests (4 tests)

**Covers**: Domain registration, extension, and validation

```typescript
it("Should allow EOA to register a domain when funded", async function () {
  await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
  await mockUSDC.connect(addr1).approve(await mailerClient.getAddress(), ethers.parseUnits("100", 6));
  
  const tx = mailerClient.connect(addr1).registerDomain("example.com", false);
  const block = await ethers.provider.getBlock('latest');
  const expectedExpiration = BigInt(block!.timestamp + 1) + BigInt(365 * 24 * 60 * 60);
  
  await expect(tx)
    .to.emit(mailerClient, "DomainRegistered")
    .withArgs("example.com", addr1.address, expectedExpiration);
});
```

### 5. Fee Management Tests (8 tests)

**Covers**: Fee updates, owner permissions, and integration

```typescript
it("Should allow owner to update registration fee", async function () {
  const newFee = 200000000; // 200 USDC
  
  await expect(
    mailerClient.connect(owner).setRegistrationFee(newFee)
  ).to.emit(mailerClient, "RegistrationFeeUpdated")
   .withArgs(100000000, newFee);
  
  expect(await mailerClient.registrationFee()).to.equal(newFee);
});
```

## Mailer Test Categories

### 1. Contract Setup Tests (3 tests)

**Purpose**: Verify proper contract initialization and constants

### 2. Message Sending Tests (32 tests)

**Covers**: All four message types with various scenarios

#### Priority Message Tests

```typescript
it("Should emit MailSent event when USDC transfer succeeds", async function () {
  await expect(
    mailer.connect(addr1).sendPriority("Test Subject", "Test Body")
  ).to.emit(mailer, "MailSent")
   .withArgs(addr1.address, addr1.address, "Test Subject", "Test Body");
});

it("Should transfer correct USDC amount to contract", async function () {
  const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
  
  await mailer.connect(addr1).sendPriority("Test Subject", "Test Body");
  
  const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
  expect(finalBalance - initialBalance).to.equal(100000); // 0.1 USDC
});
```

#### Standard Message Tests

```typescript
it("Should transfer 10% of sendFee to contract for owner", async function () {
  const initialBalance = await mockUSDC.balanceOf(await mailer.getAddress());
  const initialOwnerClaimable = await mailer.getOwnerClaimable();
  
  await mailer.connect(addr2).send("Test", "Body");
  
  const finalBalance = await mockUSDC.balanceOf(await mailer.getAddress());
  const finalOwnerClaimable = await mailer.getOwnerClaimable();
  
  const fee = await mailer.sendFee();
  const expectedOwnerFee = (fee * 10n) / 100n; // 10% of sendFee
  
  expect(finalBalance - initialBalance).to.equal(expectedOwnerFee);
  expect(finalOwnerClaimable - initialOwnerClaimable).to.equal(expectedOwnerFee);
});
```

### 3. Revenue Sharing Tests (19 tests)

**Covers**: Share recording, claims, expiration, and view functions

#### Share Recording

```typescript
it("Should record 90% for recipient and 10% for owner on sendPriority", async function () {
  const fee = await mailer.sendFee(); // 100000 (0.1 USDC)
  const expectedRecipientShare = (fee * 90n) / 100n; // 90000
  const expectedOwnerShare = fee - expectedRecipientShare; // 10000

  await expect(
    mailer.connect(addr1).sendPriority("Test", "Body")
  ).to.emit(mailer, "SharesRecorded")
   .withArgs(addr1.address, expectedRecipientShare, expectedOwnerShare);

  const [amount, , ] = await mailer.getRecipientClaimable(addr1.address);
  expect(amount).to.equal(expectedRecipientShare);

  const ownerClaimable = await mailer.getOwnerClaimable();
  expect(ownerClaimable).to.equal(expectedOwnerShare);
});
```

#### Claim Management

```typescript
it("Should allow recipient to claim their share", async function () {
  // Send a message to create claimable amount
  await mailer.connect(addr1).sendPriority("Test", "Body");
  
  const [amount, , ] = await mailer.getRecipientClaimable(addr1.address);
  
  await expect(
    mailer.connect(addr1).claimRecipientShare()
  ).to.emit(mailer, "RecipientClaimed")
   .withArgs(addr1.address, amount);

  // Check recipient received USDC
  const balance = await mockUSDC.balanceOf(addr1.address);
  const fee = await mailer.sendFee();
  const expectedBalance = ethers.parseUnits("110", 6) - fee + amount;
  expect(balance).to.equal(expectedBalance);
});
```

#### Time-based Testing

```typescript
it("Should handle expired claims correctly", async function () {
  await mailer.connect(addr1).sendPriority("Test", "Body");
  
  // Fast forward past claim period (60 days)
  await ethers.provider.send("evm_increaseTime", [60 * 24 * 60 * 60 + 1]);
  await ethers.provider.send("evm_mine", []);

  // Recipient can no longer claim
  await expect(
    mailer.connect(addr1).claimRecipientShare()
  ).to.be.revertedWithCustomError(mailer, "NoClaimableAmount");
  
  // Owner can now claim the expired shares
  await expect(
    mailer.connect(owner).claimExpiredShares(addr1.address)
  ).to.emit(mailer, "ExpiredSharesClaimed")
   .withArgs(addr1.address, expiredAmount);
});
```

## Advanced Testing Patterns

### 1. Balance Tracking Pattern

```typescript
// Track balance changes across operations
const initialBalance = await mockUSDC.balanceOf(await contract.getAddress());
const initialUserBalance = await mockUSDC.balanceOf(user.address);

await contract.connect(user).someFunction();

const finalBalance = await mockUSDC.balanceOf(await contract.getAddress());
const finalUserBalance = await mockUSDC.balanceOf(user.address);

expect(finalBalance - initialBalance).to.equal(expectedFee);
expect(initialUserBalance - finalUserBalance).to.equal(expectedFee);
```

### 2. Event Testing Pattern

```typescript
// Test multiple events in sequence
const tx = await contract.someFunction();
const receipt = await tx.wait();

expect(receipt.logs).to.have.lengthOf(2);
await expect(tx)
  .to.emit(contract, "FirstEvent")
  .withArgs(...firstArgs)
  .to.emit(contract, "SecondEvent")
  .withArgs(...secondArgs);
```

### 3. Error Testing Pattern

```typescript
// Test custom errors with specific conditions
await expect(
  contract.connect(nonOwner).ownerOnlyFunction()
).to.be.revertedWithCustomError(contract, "OnlyOwner");

await expect(
  contract.connect(user).functionWithValidation("")
).to.be.revertedWithCustomError(contract, "EmptyInput");
```

### 4. Time Manipulation Pattern

```typescript
// Test time-dependent functionality
const claimPeriod = 60 * 24 * 60 * 60; // 60 days

// Fast forward time
await ethers.provider.send("evm_increaseTime", [claimPeriod + 1]);
await ethers.provider.send("evm_mine", []);

// Test behavior after time passage
const [amount, , isExpired] = await contract.getClaimInfo(user.address);
expect(isExpired).to.be.true;
```

## Testing Best Practices

### 1. Test Organization

```typescript
describe("ContractName", function () {
  describe("Feature Group", function () {
    beforeEach(async function () {
      // Feature-specific setup
    });

    it("Should handle normal case", async function () {
      // Test implementation
    });

    it("Should handle edge case", async function () {
      // Edge case testing
    });

    it("Should revert on invalid input", async function () {
      // Error testing
    });
  });
});
```

### 2. Data Setup Helpers

```typescript
// Helper functions for common test data setup
async function setupUSDCForUser(user: any, amount: string) {
  await mockUSDC.mint(user.address, ethers.parseUnits(amount, 6));
  await mockUSDC.connect(user).approve(
    await contract.getAddress(), 
    ethers.parseUnits(amount, 6)
  );
}

async function sendPriorityMessage(sender: any, subject: string, body: string) {
  await setupUSDCForUser(sender, "1");
  return await mailer.connect(sender).sendPriority(subject, body);
}
```

### 3. Assertion Patterns

```typescript
// Comprehensive assertions
it("Should complete full operation", async function () {
  // Setup
  const initialState = await getInitialState();
  
  // Execute
  const tx = await contract.someFunction();
  
  // Verify multiple aspects
  await expect(tx).to.emit(contract, "EventName");
  expect(await contract.getState()).to.equal(expectedState);
  expect(await getBalanceChange()).to.equal(expectedChange);
  
  // Verify side effects
  const finalState = await getFinalState();
  expect(finalState.property).to.equal(expectedValue);
});
```

## Running Tests

### Full Test Suite

```bash
npm test                    # Run all 81 tests
npm test -- --grep "MailService"  # Run only MailService tests
npm test -- --grep "Mailer"       # Run only Mailer tests
```

### Test with Coverage

```bash
npx hardhat coverage        # Generate coverage report
```

### Continuous Testing

```bash
npx hardhat test --watch    # Run tests on file changes
```

## Test Performance

- **Average Test Time**: ~1 second for full suite
- **Setup Optimization**: Parallel contract deployments
- **Gas Usage**: Tests include gas consumption verification
- **Memory Efficiency**: Proper cleanup in `afterEach` hooks

This comprehensive testing approach ensures reliability, security, and maintainability of the Mailer contract system.

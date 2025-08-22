# CLAUDE.md - AI Assistant Guide

This file provides comprehensive guidance for AI assistants working with this decentralized mail service project.

## Project Overview

**MailBox Contracts** is a Solidity-based decentralized email/messaging system with USDC fee integration and delegation features.

### Core Contracts

1. **MailService.sol** - Domain registration and delegation management
2. **Mailer.sol** - Message sending with revenue sharing
3. **MockUSDC.sol** - Test token for development

## Common Development Commands

```bash
# Essential Commands (run these frequently)
npm run compile    # Compile contracts + generate TypeScript types
npm test          # Run all tests (81 tests total)
npm run build     # Build TypeScript files

# Deployment Commands
npm run deploy:local    # Deploy to local Hardhat network
npx hardhat node      # Start local blockchain

# Utility Commands
npm run clean          # Clean compiled artifacts
npm run typecheck     # Type checking (if available)
npm run lint          # Linting (if available)
```

## Smart Contract Architecture

### MailService Contract (`contracts/MailService.sol`)

**Purpose**: Domain registration and delegation management
**Key Features**:
- Domain registration with USDC fees (100 USDC default)
- Delegation system with rejection capability
- Fee management (owner-controlled)

**Core Functions**:
- `delegateTo(address delegate)` - Set delegation, costs 10 USDC
- `rejectDelegation(address delegatingAddress)` - Reject delegation made to you
- `registerDomain(string domain, bool isExtension)` - Register/extend domains
- `setRegistrationFee(uint256)` / `setDelegationFee(uint256)` - Owner fee management

**Events**:
- `DelegationSet(address indexed delegator, address indexed delegate)` - Unified delegation event
- `DomainRegistered/Extended/Released` - Domain lifecycle events

**Storage**:
- `mapping(address => address) public delegations` - Tracks current delegations
- `uint256 public registrationFee` - 100 USDC (6 decimals)
- `uint256 public delegationFee` - 10 USDC (6 decimals)

### Mailer Contract (`contracts/Mailer.sol`)

**Purpose**: Message sending with revenue sharing system
**Key Features**:
- Two fee tiers: Priority (100% fee) and Standard (10% fee)
- Revenue sharing: 90% to sender, 10% to owner
- 60-day claim period for recipients
- No "to" parameter - messages sent to msg.sender

**Core Functions**:
- `sendPriority(string subject, string body)` - Full fee, 90% revenue share
- `sendPriorityPrepared(string mailId)` - Full fee, pre-prepared message
- `send(string subject, string body)` - 10% fee only
- `sendPrepared(string mailId)` - 10% fee, pre-prepared message
- `claimRecipientShare()` - Claim your 90% share within 60 days
- `claimOwnerShare()` - Owner claims accumulated fees
- `rejectDelegation(address)` - Owner reclaims expired shares

**Revenue Model**:
- **Priority functions**: Sender pays full fee, gets 90% back as claimable
- **Standard functions**: Sender pays 10% fee only
- All messages are sent to sender (msg.sender) - self-messaging system

**Storage**:
- `mapping(address => ClaimableAmount) recipientClaims` - 90% revenue shares
- `uint256 ownerClaimable` - Accumulated owner fees
- `uint256 sendFee` - 0.1 USDC default

## Testing Architecture

**Test Files**: `test/MailService.test.ts`, `test/Mailer.test.ts`
**Total Tests**: 81 passing tests
**Test Categories**:

### MailService Tests (27 tests)
- Contract setup and configuration
- Delegation lifecycle (creation, rejection, edge cases)
- Domain registration and fees
- Owner permissions and fee management

### Mailer Tests (54 tests)
- Message sending (all 4 variants)
- Fee management and updates
- Revenue sharing system
- Claims management (recipient, owner, expired)
- Edge cases and security

**Key Test Patterns**:
- MockUSDC for testing USDC interactions
- Comprehensive fee calculation verification
- Event emission testing
- Time manipulation for claim expiration testing
- Error condition testing with custom errors

## Development Workflow & Best Practices

### Making Contract Changes

1. **Modify Contract** → `npm run compile` → `npm test`
2. **Always run compile after contract changes** - regenerates TypeScript types
3. **Run full test suite** - ensures no regressions
4. **Check for breaking changes** in generated types

### Common Development Patterns

**Testing New Features**:
```typescript
// Fund test accounts with USDC
await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
await mockUSDC.connect(addr1).approve(contractAddress, ethers.parseUnits("100", 6));

// Test function calls with event verification
await expect(contract.connect(addr1).functionName(...args))
  .to.emit(contract, "EventName")
  .withArgs(...expectedArgs);
```

**Fee Calculations**:
```typescript
// Standard pattern for fee testing
const initialBalance = await mockUSDC.balanceOf(contractAddress);
await contract.someFunction();
const finalBalance = await mockUSDC.balanceOf(contractAddress);
expect(finalBalance - initialBalance).to.equal(expectedFee);
```

### Important Notes for AI Assistants

**Security Considerations**:
- All functions use `msg.sender` for authentication
- USDC transfers must succeed for operations to proceed
- Revenue shares have time-based expiration (60 days)
- Owner functions protected by `onlyOwner` modifier

**Common Pitfalls**:
- Don't forget to fund test accounts with USDC + approvals
- Remember address(0) represents cleared delegation
- Mailer sends messages to sender (not external recipient)
- Fee amounts are in 6-decimal USDC format

**File Structure**:
- `contracts/` - Solidity source code
- `test/` - Comprehensive test suites
- `typechain-types/` - Auto-generated, don't edit manually
- `src/` - TypeScript client wrapper
- `scripts/` - Deployment and verification scripts

## TypeScript Integration

**Generated Types**: All contracts have full TypeScript support via TypeChain
**Client Wrapper**: `src/mailer-client.ts` provides high-level interface
**Type Safety**: All contract interactions are fully typed

### Network Configuration

- **Local Development**: Hardhat network (chainId 1337)
- **Test Environment**: Built-in Hardhat test network
- **Deployment**: Uses standard Hardhat deployment patterns

## AI Assistant Instructions

When working with this project:
1. **Always run `npm run compile` after contract changes**
2. **Run `npm test` to verify changes don't break existing functionality**
3. **Follow existing test patterns** for new feature testing
4. **Use MockUSDC for all USDC-related testing**
5. **Check both positive and negative test cases**
6. **Verify event emissions match expected parameters**
7. **Consider fee calculations and revenue sharing implications**
8. **Test edge cases like insufficient balances and permissions**

This project emphasizes security, comprehensive testing, and clear separation of concerns between domain management and messaging functionality.
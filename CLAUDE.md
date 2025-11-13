# CLAUDE.md - AI Assistant Guide

This file provides comprehensive guidance for AI assistants working with this multi-chain decentralized messaging system.

## 🚀 Project Overview

This is a production-ready multi-chain decentralized messaging system with USDC fee integration, automatic wallet detection, and comprehensive AI-friendly documentation supporting both EVM chains and Solana.

### Core Components

#### EVM Implementation
1. **Mailer.sol** - Complete messaging system with delegation management and revenue sharing
2. **MockUSDC.sol** - Test token for development

#### Solana Implementation
1. **mailer** - Complete messaging program with delegation management and revenue sharing

#### Unified Client
1. **OnchainMailerClient** - Single interface for all chains
2. **WalletDetector** - Automatic chain detection
3. **Dynamic imports** - Chain-specific module loading

### 📁 Enhanced Multi-Chain Project Structure

```
mail_box_contracts/
├── contracts/              # EVM smart contracts (Solidity)
│   ├── Mailer.sol         # Complete messaging system with delegation
│   └── MockUSDC.sol       # Test USDC token
├── programs/               # Solana programs (Rust)
│   └── mailer/           # Complete messaging program with delegation
├── src/                   # Multi-chain TypeScript clients
│   ├── evm/              # EVM-specific clients
│   ├── solana/           # Solana-specific clients  
│   ├── unified/          # Cross-chain unified client
│   └── utils/            # Shared utilities & validation
├── test/                  # Comprehensive test suites (116 tests)
│   ├── evm/              # EVM contract tests (75 tests)
│   ├── solana/           # Solana program tests
│   └── unified/          # Cross-chain client tests (41 tests)
├── scripts/               # Multi-chain deployment scripts
│   ├── evm/              # EVM deployment scripts
│   ├── solana/           # Solana deployment scripts
│   └── unified/          # Multi-chain deployment
├── examples/              # Complete usage examples
│   ├── evm-usage.ts      # EVM-specific examples
│   ├── solana-usage.ts   # Solana-specific examples
│   └── unified-usage.ts  # Cross-chain examples
│   └── README.md          # Example documentation
├── typechain-types/       # Auto-generated TypeScript types
├── scripts/               # Deployment scripts
├── AI_DEVELOPMENT_GUIDE.md # Comprehensive AI assistant guide
├── CLAUDE.md             # This file - AI assistant documentation
├── docs/                   # AI optimization documentation
│   └── ai-development-patterns.md  # Comprehensive AI patterns guide
├── .ai-config.json         # AI assistant configuration
├── .vscode/               # VS Code AI-friendly settings
│   ├── settings.json      # Language and editor configuration
│   └── tasks.json         # Build and test automation
└── README.md             # Main project documentation (AI-optimized)
```

## 🛠️ AI-Optimized Development Commands

```bash
# AI Workflow Automation (ENHANCED!)
npm run ai:status                   # Check project health & environment
npm run ai:build                    # AI-optimized complete build workflow  
npm run ai:test                     # Comprehensive multi-chain testing (116 tests)
npm run ai:check                    # Fast validation and quick checks
npm run ai:workflow <command>       # Advanced workflow automation

# Advanced AI Workflows
npm run ai:workflow status          # Detailed project status
npm run ai:workflow run full-build  # Complete build with validation
npm run ai:workflow run test-all    # Multi-chain test execution
npm run ai:workflow run quick-check # Fast development validation
```

## 🛠️ Common Development Commands

```bash
# Essential Commands (run these frequently)
npm run compile    # Compile contracts + generate TypeScript types
npm test          # Run all tests (116 tests total)
npm run build     # Build TypeScript files

# Deployment Commands
npm run deploy:local           # Deploy to local Hardhat network (standard)
npx hardhat node              # Start local blockchain
npx hardhat run scripts/evm/deploy-upgradeable.ts --network sepolia  # Deploy upgradeable proxy
PROXY_ADDRESS=0x... npx hardhat run scripts/evm/upgrade.ts --network sepolia  # Upgrade contract

# Development Commands
npm run clean          # Clean compiled artifacts
npm install           # Install dependencies
npx ts-node examples/unified-usage.ts  # Run comprehensive examples

# Testing Commands
npm test -- --grep "MailService"  # Run only MailService tests
npm test -- --grep "Mailer"       # Run only Mailer tests
npm test -- --verbose            # Run tests with detailed output
```

## Smart Contract Architecture

### Mailer Contract (`contracts/Mailer.sol`)

**Purpose**: Complete messaging system with delegation management and revenue sharing

**Architecture**: Upgradeable UUPS proxy pattern
- Proxy contract: User-facing address that never changes
- Implementation: Logic contract, can be upgraded by owner
- Storage: Lives in proxy, preserved across upgrades

**Key Features**:
- Two fee tiers: Priority (100% fee) and Standard (10% fee)
- Revenue sharing: 90% to sender, 10% to owner
- Delegation system with rejection capability
- 60-day claim period for recipients
- Messages can be sent to any address via "to" parameter
- Upgradeable by owner only (UUPS pattern)

**Core Functions**:
- `sendPriority(address to, string subject, string body)` - Full fee, 90% revenue share
- `sendPriorityPrepared(address to, string mailId)` - Full fee, pre-prepared message
- `send(address to, string subject, string body)` - 10% fee only
- `sendPrepared(address to, string mailId)` - 10% fee, pre-prepared message
- `delegateTo(address delegate)` - Set delegation, costs 10 USDC
- `rejectDelegation(address delegatingAddress)` - Reject delegation made to you
- `claimRecipientShare()` - Claim your 90% share within 60 days
- `claimOwnerShare()` - Owner claims accumulated fees
- `claimExpiredShares(address)` - Owner reclaims expired shares

**Revenue Model**:
- **Priority functions**: Sender pays full fee, gets 90% back as claimable
- **Standard functions**: Sender pays 10% fee only
- Messages are sent to specified recipient address via "to" parameter

**Storage**:
- `mapping(address => ClaimableAmount) recipientClaims` - 90% revenue shares
- `uint256 ownerClaimable` - Accumulated owner fees
- `uint256 sendFee` - 0.1 USDC default

## Testing Architecture

**Test Files**: `test/evm/Mailer.test.ts`, `test/unified/*.test.ts`
**Total Tests**: 116 passing tests
**Test Categories**:

### EVM Tests (75 tests)
- Contract setup and configuration
- Message sending (all 4 variants: send, sendPrepared, sendPriority, sendPriorityPrepared)
- Fee management and updates
- Revenue sharing system
- Claims management (recipient, owner, expired)
- Delegation lifecycle (creation, rejection, edge cases)
- Pause functionality and emergency controls
- Edge cases and security

### Unified Client Tests (41 tests)
- Multi-chain client initialization
- Wallet detection and validation
- Cross-chain message routing
- Validation utilities (domain, message, address, amount)
- Error handling and edge cases

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
- Mailer now sends messages to specified recipient (not just sender)
- Fee amounts are in 6-decimal USDC format

**File Structure**:
- `contracts/` - Solidity source code
- `test/` - Comprehensive test suites
- `typechain-types/` - Auto-generated, don't edit manually
- `src/` - TypeScript client wrapper
- `scripts/` - Deployment and verification scripts

## TypeScript Integration

**Generated Types**: All contracts have full TypeScript support via TypeChain
**Unified Client**: `src/unified/onchain-mailer-client.ts` provides cross-chain interface
**Type Safety**: All contract interactions are fully typed

### Network Configuration

- **Local Development**: Hardhat network (chainId 1337)
- **Test Environment**: Built-in Hardhat test network
- **Deployment**: Uses standard Hardhat deployment patterns

## 📚 AI-Friendly Documentation Structure

### Comprehensive Documentation Files:

1. **README.md** - Main project documentation with:
   - Quick start guide
   - NPM package usage
   - Architecture overview
   - Development commands
   - TypeScript integration examples

2. **AI_DEVELOPMENT_GUIDE.md** - Specialized guide for AI assistants with:
   - Development patterns and workflows
   - Common scenarios and solutions
   - Testing strategies
   - Code style guidelines
   - Security best practices
   - Performance optimization tips

3. **examples/unified-usage.ts** - Comprehensive working examples with:
   - Complete deployment workflow
   - All major functionality demonstrated
   - Error handling patterns
   - Event listening examples
   - Expected output documentation

4. **Contract Documentation** - All contracts have extensive inline documentation:
   - NatSpec comments for all functions
   - Parameter descriptions
   - Usage examples in comments
   - Error condition explanations

5. **Client Library Documentation** - TypeScript client with full JSDoc:
   - Class-level documentation with usage examples
   - Method-level documentation with parameters
   - Return type descriptions
   - Example code snippets

### Key AI Integration Points:

**Smart Contract Comments**: Every function, event, and error is documented with NatSpec
**TypeScript Client**: Full JSDoc with usage examples and parameter descriptions
**Test Patterns**: Comprehensive test suites demonstrating all functionality
**Example Code**: Working examples with expected output and error handling
**Development Guides**: Step-by-step workflows for common AI development tasks

## 🤖 Enhanced AI Assistant Instructions

### Critical Development Workflow:
1. **Always run `npm run compile` after contract changes** - Regenerates TypeScript types
2. **Run `npm test` to verify changes don't break existing functionality** - 116 comprehensive tests
3. **Follow existing test patterns** documented in AI_DEVELOPMENT_GUIDE.md
4. **Use MockUSDC for all USDC-related testing** - Never use real tokens
5. **Check both positive and negative test cases** - Error conditions are critical
6. **Verify event emissions match expected parameters** - Events drive UI updates
7. **Consider fee calculations and revenue sharing implications** - Core business logic
8. **Test edge cases like insufficient balances and permissions** - Security critical

### AI-Specific Guidance:

**Code Generation Patterns**:
- Reference `examples/unified-usage.ts` for working patterns
- Use existing client methods as templates for new functionality
- Follow the established error handling patterns
- Maintain consistency with existing naming conventions

**Testing Patterns**:
- Fund test accounts with MockUSDC before testing
- Approve contract spending before operations
- Test both success and failure scenarios
- Verify event emissions with expected parameters
- Use time manipulation for claim expiration testing

**Documentation Standards**:
- Add NatSpec comments to all new Solidity functions
- Include JSDoc comments for all TypeScript methods
- Provide usage examples in complex functions
- Document error conditions and their causes

**Security Considerations**:
- Always use reentrancy protection on external functions
- Validate all external inputs
- Use custom errors instead of require statements
- Test authorization and access control thoroughly

### Quick Reference Files for AI:
- `docs/AI_QUICK_START.md` - **START HERE** - Essential commands and workflows
- `docs/ai-development-patterns.md` - **PRIMARY REFERENCE** - Comprehensive AI patterns guide  
- `.ai-config.json` - Project configuration and metadata for AI assistants (UPDATED)
- `scripts/ai-helpers/dev-workflow.ts` - Automated workflow scripts (ENHANCED)
- `.vscode/` - VS Code configuration optimized for AI development (NEW)
- `src/types/common.ts` - Comprehensive type definitions and utilities
- `AI_DEVELOPMENT_GUIDE.md` - Extended development patterns
- `examples/unified-usage.ts` - Working code examples
- `examples/README.md` - Usage patterns documentation
- `src/mailer-client.ts` - Full API reference with examples
- `test/` directory - Comprehensive test patterns

### Project Philosophy:
This project emphasizes **security, comprehensive testing, AI-friendly documentation, and clear separation of concerns** between domain management and messaging functionality. All code should be self-documenting with extensive examples and clear usage patterns.

### Common AI Development Scenarios:
1. **Adding new contract functions** - Follow MailService/Mailer patterns
2. **Extending client library** - Use existing client methods as templates
3. **Writing tests** - Reference existing comprehensive test suites
4. **Debugging issues** - Check AI_DEVELOPMENT_GUIDE.md for common solutions
5. **Understanding architecture** - Start with examples/unified-usage.ts walkthrough
# AI Development Guide for MailBox Contracts

This guide provides comprehensive instructions for AI assistants working with the MailBox decentralized messaging system.

## 🎯 Quick Start for AI Assistants

### Essential Commands
```bash
# Always run after contract changes
npm run compile    # Regenerates TypeScript types
npm test          # Runs 88 comprehensive tests
npm run build     # Builds TypeScript client library

# Development workflow
npx hardhat node              # Start local blockchain
npm run deploy:local          # Deploy contracts locally
npm run clean                # Clean artifacts when needed
```

### Project Architecture Overview
```
mail_box_contracts/
├── contracts/              # Smart contracts (Solidity ^0.8.24)
│   ├── MailService.sol    # Domain registration & delegation
│   ├── Mailer.sol         # Messaging with revenue sharing
│   └── MockUSDC.sol       # Test USDC token
├── src/                   # TypeScript client library
│   └── mailer-client.ts   # High-level client wrappers
├── test/                  # Comprehensive test suites
├── typechain-types/       # Auto-generated TypeScript types
└── CLAUDE.md             # Detailed AI assistant documentation
```

## 🧠 AI-Specific Development Patterns

### 1. Contract Modification Workflow

**CRITICAL**: Always follow this sequence:
```bash
# 1. Modify Solidity contract
# 2. Compile to regenerate types
npm run compile
# 3. Run tests to ensure no regressions
npm test
# 4. Update client if needed
npm run build
```

**Why this matters**: TypeChain generates TypeScript types from contracts. Skipping compilation after contract changes causes type mismatches and compilation errors.

### 2. Testing Patterns for AI

**Fund Test Accounts Pattern**:
```typescript
// Always use this pattern for USDC operations
await mockUSDC.mint(testAddress, ethers.parseUnits("1000", 6));
await mockUSDC.connect(testAccount).approve(contractAddress, ethers.parseUnits("100", 6));
```

**Event Testing Pattern**:
```typescript
// Test both transaction success AND event emission
await expect(contract.connect(signer).someFunction(args))
  .to.emit(contract, "EventName")
  .withArgs(expectedArg1, expectedArg2);
```

**Fee Calculation Pattern**:
```typescript
// Verify USDC transfers
const initialBalance = await mockUSDC.balanceOf(contractAddress);
await contract.someFunction();
const finalBalance = await mockUSDC.balanceOf(contractAddress);
expect(finalBalance - initialBalance).to.equal(expectedFeeInWei);
```

### 3. Revenue Sharing System (Critical for AI Understanding)

**Key Concept**: Messages are sent TO the sender (self-messaging system)

```typescript
// Priority: Sender pays 0.1 USDC, gets 0.09 USDC back (claimable within 60 days)
await mailer.connect(sender).sendPriority("Subject", "Body");
// Event: MailSent(sender, sender, "Subject", "Body")

// Standard: Sender pays 0.01 USDC, no revenue share
await mailer.connect(sender).send("Subject", "Body");
// Event: MailSent(sender, sender, "Subject", "Body")
```

**Revenue Flow**:
1. Priority message: 100% fee paid → 90% claimable by sender, 10% to owner
2. Standard message: 10% fee paid → 0% claimable, 10% to owner
3. Claims expire after 60 days → go to owner

### 4. Delegation System Understanding

**Key Concept**: Address A can delegate email handling to Address B

```typescript
// A delegates to B (costs 10 USDC)
await mailService.connect(A).delegateTo(B.address);

// B can reject the delegation (free)
await mailService.connect(B).rejectDelegation(A.address);

// A can clear delegation (free)
await mailService.connect(A).delegateTo(ethers.ZeroAddress);
```

## 🔍 Common AI Development Scenarios

### Adding New Functionality

**1. Contract Changes**:
```solidity
// Add to contract
function newFunction(uint256 param) external {
    // Implementation
    emit NewEvent(msg.sender, param);
}
```

**2. Update Client**:
```typescript
// Add to client class
async newFunction(param: bigint): Promise<ethers.ContractTransactionResponse> {
  return await this.contract.newFunction(param);
}
```

**3. Add Tests**:
```typescript
it("should handle new functionality", async function () {
  await expect(contract.connect(addr1).newFunction(100))
    .to.emit(contract, "NewEvent")
    .withArgs(addr1.address, 100);
});
```

### Debugging Common Issues

**TypeScript Errors After Contract Changes**:
```bash
# Solution: Always recompile
npm run compile
```

**Test Failures with "insufficient balance"**:
```typescript
// Solution: Fund and approve USDC
await mockUSDC.mint(addr1.address, ethers.parseUnits("1000", 6));
await mockUSDC.connect(addr1).approve(contractAddress, ethers.parseUnits("100", 6));
```

**"No claimable amount" Errors**:
```typescript
// For recipient claims - need prior priority messages
await mailer.connect(addr1).sendPriority("Subject", "Body");
await mailer.connect(addr1).claimRecipientShare();
```

## 📊 Testing Strategy for AI

### Test Categories (88 total tests):
- **MailService** (27 tests): Domain registration, delegation, fees
- **Mailer** (54 tests): Messaging, revenue sharing, claims
- **MailBoxClient** (7 tests): Client wrapper functionality

### Key Test Scenarios to Always Include:
1. **Happy Path**: Normal successful operations
2. **Error Cases**: Invalid inputs, insufficient funds
3. **Edge Cases**: Zero amounts, address(0), boundary conditions
4. **Security Cases**: Unauthorized access, reentrancy protection
5. **Time-based Cases**: Claim expiration testing

### Test Helper Patterns:
```typescript
// Time manipulation for claim testing
await network.provider.send("evm_increaseTime", [60 * 24 * 60 * 60]); // 60 days
await network.provider.send("evm_mine");

// Multiple signer setup
const [owner, addr1, addr2, addr3] = await ethers.getSigners();

// Contract deployment with MockUSDC
const MockUSDC = await ethers.getContractFactory("MockUSDC");
const mockUSDC = await MockUSDC.deploy();
const Mailer = await ethers.getContractFactory("Mailer");
const mailer = await Mailer.deploy(await mockUSDC.getAddress(), owner.address);
```

## 🎨 Code Style Guidelines

### Solidity Contracts:
- Use NatSpec comments (`@notice`, `@param`, `@return`)
- Custom errors over require statements
- Reentrancy protection on external functions
- Event emission for all state changes

### TypeScript Client:
- Comprehensive JSDoc comments
- Usage examples in documentation
- Type-safe parameter handling
- Promise-based async API

### Testing:
- Descriptive test names explaining the scenario
- Arrange-Act-Assert pattern
- Comprehensive error testing
- Event emission verification

## ⚡ Performance Optimization Tips

### For AI Code Generation:
1. **Batch Operations**: When multiple independent calls are needed, suggest batching
2. **Gas Optimization**: Prefer custom errors over require strings
3. **Type Safety**: Always use proper TypeScript types from typechain-types
4. **Event Filtering**: Use indexed parameters for efficient event filtering

### Development Efficiency:
1. **Hot Reload**: Use `npx hardhat node` for persistent local blockchain
2. **Test Isolation**: Each test should be independent and resettable
3. **Mock Usage**: Always use MockUSDC for testing, never real tokens
4. **Incremental Testing**: Test small changes frequently

## 🔐 Security Best Practices for AI

### Critical Security Patterns:
```solidity
// Always use reentrancy protection
modifier nonReentrant() {
    if (_status == 1) revert ReentrancyGuard();
    _status = 1;
    _;
    _status = 0;
}

// Validate external calls
if (!usdcToken.transferFrom(msg.sender, address(this), amount)) {
    revert FeePaymentRequired();
}

// Owner-only functions
modifier onlyOwner() {
    if (msg.sender != owner) revert OnlyOwner();
    _;
}
```

### Never Do These:
- ❌ Skip USDC approval in tests
- ❌ Use `require` instead of custom errors
- ❌ Forget reentrancy protection on external functions
- ❌ Skip event emission testing
- ❌ Use real token addresses in tests

## 📚 Advanced AI Integration Patterns

### Client Library Design:
```typescript
// High-level client with easy-to-use methods
export class MailerClient {
  // Simple methods that hide complexity
  async sendPriority(subject: string, body: string) {
    return await this.contract.sendPriority(subject, body);
  }
  
  // Informational methods with clear return types
  async getRecipientClaimable(recipient: string): Promise<{
    amount: bigint,
    expiresAt: bigint,
    isExpired: boolean
  }> {
    // Implementation with clear data structure
  }
}
```

### Error Handling Patterns:
```typescript
// Provide clear error context in clients
try {
  await mailer.sendPriority(subject, body);
} catch (error) {
  if (error.reason === "FeePaymentRequired") {
    throw new Error("Insufficient USDC balance or approval");
  }
  throw error;
}
```

## 🚀 Deployment Considerations for AI

### Local Development:
```bash
# Terminal 1: Start blockchain
npx hardhat node

# Terminal 2: Deploy contracts
npm run deploy:local
```

### Network Configuration:
- **Local**: Hardhat network (chainId 31337)
- **Test Networks**: Use appropriate USDC addresses per network
- **Production**: Verify all contracts on Etherscan after deployment

## 📈 Monitoring and Maintenance

### Key Metrics to Track:
- Test coverage (aim for >95%)
- Gas usage per function
- Contract size limits
- Type safety coverage

### Regular Maintenance Tasks:
1. Update dependencies regularly
2. Run full test suite before any changes
3. Verify contract compilation after Solidity version changes
4. Update documentation when adding features

This guide ensures AI assistants can effectively work with the MailBox contracts while maintaining code quality, security, and functionality.
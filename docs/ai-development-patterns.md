# AI Development Patterns

> **For AI Assistants**: This guide provides specific patterns, examples, and workflows optimized for AI-assisted development of the MailBox multi-chain messaging system.

## 🎯 Quick Reference

### Essential Commands (Always Use These)
```bash
# After ANY contract changes
npm run compile

# Before committing changes  
npm test

# Check project health
npm run ai:workflow status

# Complete build process
npm run ai:workflow run full-build
```

## 🏗️ Development Patterns

### 1. Contract Modification Pattern

**✅ CORRECT Workflow:**
```bash
# 1. Make contract changes (EVM + Solana)
# Edit contracts/Mailer.sol
# Edit programs/mailer/src/lib.rs

# 2. ALWAYS compile after changes
npm run compile

# 3. Update tests if needed
# Edit test/evm/*.test.ts
# Edit test/solana/*.test.ts

# 4. Run full test suite
npm test

# 5. Update documentation
# Update relevant docs and examples
```

**❌ WRONG - Missing Steps:**
```bash
# Edit contract
# Run tests directly ← ERROR: Skip compilation
npm test  # Will fail with outdated types
```

### 2. Adding New Functions

**Example: Adding a new function to Mailer.sol**

```solidity
// contracts/Mailer.sol
/**
 * @notice Send bulk messages to multiple recipients
 * @param recipients Array of recipient addresses  
 * @param subjects Array of message subjects
 * @param bodies Array of message bodies
 * @dev Each array must have the same length
 */
function sendBulk(
    address[] calldata recipients,
    string[] calldata subjects, 
    string[] calldata bodies
) external nonReentrant {
    require(recipients.length == subjects.length && subjects.length == bodies.length, "Array length mismatch");
    
    for (uint256 i = 0; i < recipients.length; i++) {
        // Implementation logic
        emit MailSent(msg.sender, recipients[i], subjects[i], bodies[i]);
    }
}
```

**Follow-up Steps:**
1. Run `npm run compile` (generates TypeScript types)
2. Add corresponding Solana function in `programs/mailer/src/lib.rs`
3. Update TypeScript client in `src/evm/mailer-client.ts`
4. Add comprehensive tests in `test/evm/Mailer.test.ts`
5. Run `npm test` to verify everything works

### 3. Testing Patterns

**Standard Test Structure:**
```typescript
describe("New Feature", function () {
  let mailer: Mailer;
  let mockUSDC: MockUSDC;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;

  beforeEach(async function () {
    // Setup contracts and accounts
    const [ownerSigner, addr1Signer] = await ethers.getSigners();
    owner = ownerSigner;
    addr1 = addr1Signer;

    // Deploy MockUSDC
    const MockUSDCFactory = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDCFactory.deploy();
    
    // Deploy Mailer
    const MailerFactory = await ethers.getContractFactory("Mailer");
    mailer = await MailerFactory.deploy(mockUSDC.target, owner.address);

    // Fund test account
    await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
    await mockUSDC.connect(addr1).approve(mailer.target, ethers.parseUnits("100", 6));
  });

  it("Should handle new functionality correctly", async function () {
    // Test implementation
    await expect(mailer.connect(addr1).newFunction(...args))
      .to.emit(mailer, "EventName")
      .withArgs(...expectedArgs);
  });

  it("Should handle error conditions", async function () {
    // Test error conditions
    await expect(mailer.connect(addr1).newFunction(...invalidArgs))
      .to.be.revertedWithCustomError(mailer, "ExpectedError");
  });
});
```

**Key Testing Patterns:**
- Always fund accounts with MockUSDC before testing
- Test both success and failure scenarios  
- Verify event emissions with exact parameters
- Test fee calculations and balance changes
- Use custom errors, not require() messages

### 4. Multi-Chain Consistency

**When adding features, maintain consistency:**

**EVM (Solidity):**
```solidity
function send(
    address to,
    string calldata subject,
    string calldata body
) external nonReentrant {
    // Implementation
    emit MailSent(msg.sender, to, subject, body);
}
```

**Solana (Rust):**
```rust
pub fn send(
    ctx: Context<SendMessage>,
    to: Pubkey,
    subject: String,
    body: String,
) -> Result<()> {
    // Implementation
    emit!(MailSent {
        from: ctx.accounts.sender.key(),
        to,
        subject,
        body,
    });
    Ok(())
}
```

**TypeScript Client:**
```typescript
async send(
    to: string | PublicKey,
    subject: string,
    body: string
): Promise<TransactionResult> {
    if (this.isEvmRecipient(to)) {
        return this.evmClient.send(to, subject, body);
    } else {
        return this.solanaClient.send(to, subject, body);
    }
}
```

## 🧪 Testing Strategies

### Test Categories

**1. Unit Tests (Individual Functions)**
```typescript
describe("Fee Calculation", function () {
  it("Should calculate standard fee correctly", async function () {
    const baseFee = await mailer.getFee();
    const standardFee = (baseFee * 10n) / 100n;
    // Test fee calculation
  });
});
```

**2. Integration Tests (Full Workflows)**
```typescript  
describe("Message Sending Workflow", function () {
  it("Should complete full send -> claim workflow", async function () {
    // 1. Send priority message
    await mailer.connect(addr1).sendPriority(recipient, subject, body);
    
    // 2. Verify claimable amount
    const claimable = await mailer.getRecipientClaimable(addr1.address);
    expect(claimable.amount).to.be.gt(0);
    
    // 3. Claim revenue share  
    await mailer.connect(addr1).claimRecipientShare();
    
    // 4. Verify balance updated
    const finalBalance = await mockUSDC.balanceOf(addr1.address);
    expect(finalBalance).to.be.gt(initialBalance);
  });
});
```

**3. Error Condition Tests**
```typescript
describe("Error Handling", function () {
  it("Should reject insufficient balance", async function () {
    // Remove USDC from account
    await mockUSDC.connect(addr1).transfer(owner.address, await mockUSDC.balanceOf(addr1.address));
    
    // Should fail
    await expect(mailer.connect(addr1).send(recipient, subject, body))
      .to.be.revertedWithCustomError(mailer, "FeePaymentRequired");
  });
});
```

## 🔧 Common Debugging Patterns

### 1. Compilation Issues

**Problem:** TypeScript errors about missing contract types
**Solution:**
```bash
npm run compile  # Regenerate types
npm run build    # Rebuild TypeScript
```

**Problem:** Anchor build fails
**Solution:**
```bash
anchor --version  # Check version compatibility
anchor build --verbose  # Get detailed error info
```

### 2. Test Failures

**Problem:** "Contract function doesn't exist"
**Solution:**
```bash
npm run compile  # Regenerate contract types
rm -rf artifacts cache  # Clean rebuild
npm run compile
```

**Problem:** "Insufficient funds" errors
**Solution:**
```typescript
// Always fund and approve before testing
await mockUSDC.mint(testAddress, ethers.parseUnits("1000", 6));
await mockUSDC.connect(testSigner).approve(contractAddress, ethers.parseUnits("1000", 6));
```

## 🚀 AI Workflow Automation

### Available Workflows

```bash
# List all available workflows
npm run ai:workflow list

# Check project health
npm run ai:workflow status  

# Complete build process
npm run ai:workflow run full-build

# Run all tests
npm run ai:workflow run test-all

# Quick validation
npm run ai:workflow run quick-check

# New feature workflow (before/after coding)
npm run ai:workflow run new-feature
```

### Custom Workflow Usage

```bash
# Verbose output
npm run ai:workflow run full-build --verbose

# Dry run (see commands without executing)
npm run ai:workflow run test-all --dry-run
```

## 📋 Code Quality Checklist

### Before Committing Code:

- [ ] Contracts compile successfully: `npm run compile`
- [ ] All tests pass: `npm test` 
- [ ] TypeScript builds cleanly: `npm run build`
- [ ] Code follows existing patterns
- [ ] Documentation updated for new features
- [ ] Multi-chain consistency maintained (EVM + Solana)
- [ ] Error handling implemented
- [ ] Events emitted for state changes

### Code Review Checklist:

- [ ] Function signatures match across chains
- [ ] Fee calculations are precise
- [ ] Reentrancy protection in place
- [ ] Input validation implemented
- [ ] Gas usage reasonable
- [ ] Events include all necessary data

## 🎯 Performance Tips

### Efficient Development

1. **Use incremental compilation:**
   ```bash
   npx hardhat compile  # Only EVM
   anchor build         # Only Solana
   ```

2. **Run specific test suites:**
   ```bash
   npm run test:evm     # Only EVM tests
   npm run test:solana  # Only Solana tests  
   npm test -- --grep "MailService"  # Specific pattern
   ```

3. **Use watch mode during development:**
   ```bash
   npx hardhat watch compilation  # Auto-compile on changes
   npm run test:evm -- --watch    # Auto-test on changes
   ```

## 🔍 Debugging Tools

### Hardhat Console

```bash
npx hardhat console --network localhost

# In console:
const Mailer = await ethers.getContractFactory("Mailer");
const mailer = await Mailer.attach("0x...");
await mailer.getFee();
```

### Solana Program Testing

```bash
# Detailed logs
RUST_LOG=debug anchor test

# Specific test
anchor test -- --test test_name
```

### TypeScript Debugging

```typescript
// Add detailed logging
console.log('Contract address:', mailer.target);
console.log('Transaction hash:', tx.hash);
console.log('Gas used:', receipt.gasUsed.toString());
```

## 📊 Metrics and Monitoring

### Test Coverage

```bash
npm run test:coverage  # If available
npm run test -- --reporter spec  # Detailed test output
```

### Performance Monitoring

```typescript
// Time operations
const start = Date.now();
await mailer.send(recipient, subject, body);
console.log(`Send took ${Date.now() - start}ms`);
```

---

## 💡 AI Assistant Notes

### Key Reminders:
- **ALWAYS** run `npm run compile` after contract changes
- **NEVER** skip testing before committing
- **MAINTAIN** consistency between EVM and Solana implementations  
- **USE** the workflow automation scripts for complex tasks
- **FOLLOW** existing patterns and naming conventions
- **DOCUMENT** all new functions with comprehensive comments

### Quick Commands Reference:
- `npm run compile` - Compile contracts & generate types
- `npm test` - Run all tests (88+ tests)
- `npm run ai:workflow status` - Check project health
- `npm run deploy:local` - Deploy to local development

This guide should be your primary reference for AI-assisted development of the MailBox system.
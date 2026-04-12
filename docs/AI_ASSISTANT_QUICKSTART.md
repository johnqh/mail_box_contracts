# AI Assistant Quick Start Guide

🤖 **Welcome AI Assistant!** This guide gets you productive with the Mailer Contracts project in under 5 minutes.

This is the definitive quick start guide for AI assistants working on the Mailer multi-chain messaging protocol.

## 🚀 Immediate Setup Commands

```bash
# Check project status
git status
npm test

# Essential development commands (memorize these!)
npm run compile    # After any contract changes
npm test          # Before any commit
npm run build     # Check TypeScript compilation
```

## 📋 AI Development Checklist

### Before Starting Any Task

- [ ] Read this file and `CLAUDE.md`
- [ ] Check `git status` and `npm test`
- [ ] Understand the specific requirements

### While Coding

- [ ] Follow existing patterns in similar files
- [ ] Add comprehensive JSDoc comments
- [ ] Handle errors with specific messages
- [ ] Consider both EVM and Solana compatibility

### After Coding

- [ ] Run `npm run compile` (if contracts changed)
- [ ] Run `npm test` (ensure all 116+ tests pass)
- [ ] Run `npm run build` (check TypeScript)
- [ ] Check `npx eslint src/ test/ --ext .ts,.js`
- [ ] Update documentation if needed

## 🎯 Key Project Facts

| Aspect               | Details                                       |
| -------------------- | --------------------------------------------- |
| **Package Name**     | `@johnqh/mail_box_contracts`                  |
| **Current Version**  | 1.5.2                                         |
| **Total Tests**      | 116+ (75 EVM + 8 Solana + 41 Unified)         |
| **Chains Supported** | Ethereum, Polygon, Arbitrum, Optimism, Solana |
| **Main Contracts**   | MailService.sol, Mailer.sol, MockUSDC.sol     |
| **Main Programs**    | mailer                                        |
| **Unified Client**   | `src/unified/onchain-mailer-client.ts`        |

## 🚨 RECENT ARCHITECTURE CHANGES (Critical for AI Assistants!)

**IMPORTANT**: The project recently underwent simplification - **MailerClient and MailServiceClient have been REMOVED**.

### **Current Client Architecture (Updated 2024)**

```
✅ EVM: MailerClient only (handles messaging + delegation)
✅ Solana: MailerClient only (handles messaging + delegation)
✅ Unified: OnchainMailerClient (auto-detects wallet type)
❌ MailerClient: REMOVED (was a wrapper)
❌ MailServiceClient: REMOVED (functionality moved to MailerClient)
```

### **What This Means for AI Development**

- ✅ **Use MailerClient** for all EVM and Solana operations
- ✅ **Use OnchainMailerClient** for multi-chain applications
- ❌ **Don't reference MailerClient or MailServiceClient** - they no longer exist
- ✅ **MailerClient includes delegation methods** like `delegateTo()` and `getDelegationFee()`

## 🏗️ Project Architecture

```
mail_box_contracts/
├── contracts/           # EVM Solidity contracts
│   ├── MailService.sol # Delegation management
│   ├── Mailer.sol      # Messaging + revenue sharing
│   └── MockUSDC.sol    # Test USDC token
├── programs/            # Solana Rust programs
│   └── mailer/         # Messaging and delegation program
├── src/                 # TypeScript clients
│   ├── evm/            # EVM-specific clients
│   ├── solana/         # Solana-specific clients
│   ├── unified/        # 🌟 Cross-chain client
│   └── utils/          # Shared utilities
├── test/               # Comprehensive tests (116+)
│   ├── evm/           # 75 EVM tests
│   ├── solana/        # 8 Solana tests
│   └── unified/       # 41 unified tests
├── docs/              # AI-optimized documentation
└── examples/          # Working code examples
```

## 🔧 Most Common Development Scenarios

### 1. Contract Function Addition

```bash
# 1. Edit contracts/Mailer.sol or contracts/MailService.sol
# 2. Compile to regenerate TypeScript types
npm run compile

# 3. Update client in src/evm/mailer-client.ts
# 4. Add tests in test/evm/Mailer.test.ts
# 5. Run tests
npm test

# 6. Update unified client if needed
# Edit src/unified/onchain-mailer-client.ts
```

### 2. Bug Fix Workflow

```bash
# 1. Identify failing test
npm test -- --grep "specific test"

# 2. Fix the issue in contracts/ or src/
# 3. Always compile after contract changes
npm run compile

# 4. Verify fix
npm test

# 5. Add regression test to prevent future issues
```

### 3. Client Library Enhancement

```bash
# 1. Edit files in src/ directory
# 2. Run type checking
npx tsc --noEmit

# 3. Test unified client
npm run test:unified:direct

# 4. Update documentation with JSDoc
```

## ⚠️ Critical Pitfalls to Avoid

| ❌ Never Do This                 | ✅ Always Do This                                      |
| -------------------------------- | ------------------------------------------------------ |
| Edit contracts without compiling | Run `npm run compile` after contract changes           |
| Test without funding MockUSDC    | Fund test accounts: `mockUSDC.mint(addr, amount)`      |
| Miss error case testing          | Test both success AND failure scenarios                |
| Forget approvals in tests        | `mockUSDC.approve(contract, amount)` before operations |
| Skip TypeScript compilation      | Run `npm run build` to catch type errors               |
| Use `any` types                  | Use specific TypeScript types                          |
| Commit without tests             | Always run `npm test` before commits                   |

## 💡 Code Patterns to Follow

### Solidity Patterns

```solidity
// ✅ Use custom errors (gas efficient)
error InsufficientFunds(uint256 required, uint256 available);

// ✅ Emit detailed events
event MailSent(
    address indexed sender,
    address indexed recipient,
    string subject,
    uint256 fee
);

// ✅ Validate inputs
function sendMessage(string memory subject, string memory body) external {
    if (bytes(subject).length == 0) revert EmptySubject();
    if (bytes(body).length == 0) revert EmptyBody();
    // ... implementation
}
```

### TypeScript Patterns

````typescript
// ✅ Comprehensive JSDoc with examples
/**
 * Send a message with automatic chain detection
 *
 * @param subject - Message subject (1-200 characters)
 * @param body - Message body (1-10000 characters)
 * @param priority - Use priority sending with revenue share
 * @returns Promise resolving to transaction details
 *
 * @example
 * ```typescript
 * const result = await client.sendMessage("Hello", "World!", false);
 * console.log('Transaction:', result.transactionHash);
 * ```
 */
async sendMessage(subject: string, body: string, priority: boolean = false): Promise<MessageResult> {
    // Route to appropriate implementation
    if (this.chainType === 'evm') {
        return this.sendEVMMessage(subject, body, priority);
    } else {
        return this.sendSolanaMessage(subject, body, priority);
    }
}
````

### Test Patterns

```typescript
// ✅ Comprehensive test structure
describe('Contract Function', () => {
  beforeEach(async () => {
    // Setup: Deploy contracts, fund accounts, set approvals
    await mockUSDC.mint(user.address, ethers.parseUnits('100', 6));
    await mockUSDC
      .connect(user)
      .approve(mailer.address, ethers.parseUnits('10', 6));
  });

  it('should succeed with valid inputs', async () => {
    await expect(mailer.connect(user).sendMessage('Subject', 'Body'))
      .to.emit(mailer, 'MailSent')
      .withArgs(user.address, 'Subject', 'Body', expectedFee);
  });

  it('should revert with insufficient funds', async () => {
    await expect(
      mailer.connect(unfundedUser).sendMessage('Subject', 'Body')
    ).to.be.revertedWithCustomError(mailer, 'InsufficientFunds');
  });
});
```

## 📚 Essential Files for AI Context

### Must-Read Documentation

1. **`CLAUDE.md`** - Main AI assistant guide
2. **`docs/AI_DEVELOPMENT_PATTERNS.md`** - Comprehensive patterns
3. **`README.md`** - Project overview and API
4. **`.ai-config.json`** - AI tool configuration

### Key Code Files

1. **`src/unified/onchain-mailer-client.ts`** - Main unified client
2. **`src/unified/types.ts`** - TypeScript interfaces
3. **`contracts/Mailer.sol`** - Core EVM contract
4. **`test/evm/Mailer.test.ts`** - Comprehensive test patterns

### Working Examples

1. **`examples/basic-usage.ts`** - Complete usage examples
2. **`examples/unified-usage.ts`** - Cross-chain examples

## 🎯 Success Metrics

Your AI development session is successful when:

- ✅ **All tests pass**: `npm test` shows 116+ passing tests
- ✅ **Clean compilation**: `npm run build` with no TypeScript errors
- ✅ **No lint issues**: `npx eslint src/ test/ --ext .ts,.js` clean
- ✅ **Documentation updated**: JSDoc comments and README if needed
- ✅ **Cross-chain compatibility**: Works on both EVM and Solana
- ✅ **Proper error handling**: Specific error messages for different scenarios
- ✅ **Comprehensive testing**: Both success and failure cases covered

## 🆘 Emergency Commands

If something breaks:

```bash
# Reset and clean everything
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run compile

# Check what's actually broken
npm test -- --reporter spec

# Type checking only
npx tsc --noEmit

# Lint checking only
npx eslint src/ test/ --ext .ts,.js
```

## 📞 Need Help?

1. **Check existing patterns** in similar files
2. **Read error messages carefully** - they're usually specific
3. **Look at test files** for usage examples
4. **Check `CLAUDE.md`** for detailed guidance
5. **Verify all dependencies** are installed and up to date

---

**🎯 Remember**: This project prioritizes **security**, **comprehensive testing**, and **clear documentation**. Always follow these principles when developing new features or fixing bugs.

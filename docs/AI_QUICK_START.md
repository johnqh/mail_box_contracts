# AI-Assisted Development Quick Start

This guide provides AI assistants with everything needed to effectively work on the Mailer Contracts project.

## 🚀 Instant Setup Commands

```bash
# 1. Check project health
npm run ai:status

# 2. Complete environment setup
npm run ai:build

# 3. Run comprehensive tests
npm run ai:test

# 4. Quick validation
npm run ai:check
```

## 📋 AI-Optimized Workflow Commands

### Primary Development Commands

| Command             | Purpose                 | When to Use                    |
| ------------------- | ----------------------- | ------------------------------ |
| `npm run ai:build`  | Complete build workflow | After cloning, major changes   |
| `npm run ai:test`   | Comprehensive testing   | Before commits, after features |
| `npm run ai:check`  | Quick validation        | During development             |
| `npm run ai:status` | Project health check    | Troubleshooting                |

### Chain-Specific Commands

| Command                  | Purpose           | Technology             |
| ------------------------ | ----------------- | ---------------------- |
| `npm run compile:evm`    | EVM contracts     | Solidity + Hardhat     |
| `npm run compile:solana` | Solana programs   | Rust + Anchor          |
| `npm run test:evm`       | EVM tests only    | Hardhat tests          |
| `npm run test:solana`    | Solana tests only | Anchor tests           |
| `npm run test:unified`   | Client tests      | Cross-chain TypeScript |

## 🏗️ Project Architecture

### Multi-Chain Structure

```
contracts/          # EVM (Ethereum-compatible)
├── MailService.sol # Delegation management
├── Mailer.sol      # Messaging with revenue sharing
└── MockUSDC.sol    # Test token

programs/           # Solana blockchain
└── mailer/         # Messaging and delegation with revenue sharing

src/                # TypeScript clients
├── evm/            # EVM-specific clients
├── solana/         # Solana-specific clients
├── unified/        # Cross-chain unified client
└── utils/          # Shared utilities

test/               # Comprehensive test suites
├── evm/            # 105+ EVM contract tests
├── solana/         # Solana program tests
└── unified/        # Cross-chain client tests
```

## 🔧 Critical AI Development Rules

### 1. Always Compile After Contract Changes

```bash
# After modifying .sol or .rs files
npm run compile

# This regenerates TypeScript types
# Check typechain-types/ directory
```

### 2. Test-Driven Development

```bash
# Run existing tests first
npm test

# Add new tests for new features
# Follow patterns in test/ directory
```

### 3. Multi-Chain Considerations

- **EVM contracts**: Solidity with 6-decimal USDC
- **Solana programs**: Rust with SPL tokens
- **Unified client**: TypeScript with chain detection

## 🧪 Testing Patterns

### EVM Testing (105+ tests)

```typescript
// Fund test accounts with MockUSDC
await mockUSDC.mint(addr1.address, ethers.parseUnits('100', 6));
await mockUSDC
  .connect(addr1)
  .approve(contractAddress, ethers.parseUnits('100', 6));

// Test events and state changes
await expect(contract.delegateTo(delegate))
  .to.emit(contract, 'DelegationSet')
  .withArgs(addr1.address, delegate);
```

### Solana Testing

```bash
# Build programs first
anchor build

# Run program tests
anchor test --skip-local-validator
```

## 📦 Dependencies & Environment

### Required Tools

- **Node.js**: 18+ with npm
- **Rust**: 1.75.0 (Solana compatible)
- **Anchor**: 0.28.0 (Solana framework)
- **Hardhat**: EVM development environment

### Environment Setup

```bash
# Check if tools are available
node --version    # Should be 18+
rustc --version   # Should be 1.75.0
anchor --version  # Should be 0.28.0
```

## 🎯 Common AI Tasks

### Adding New Contract Function

1. Modify contract (.sol or .rs)
2. Run `npm run compile`
3. Update TypeScript clients
4. Add comprehensive tests
5. Run `npm test`
6. Update documentation

### Debugging Issues

1. Check `npm run ai:status`
2. Review compilation errors
3. Check test failures
4. Verify environment setup

### Cross-Chain Feature Development

1. Implement in both EVM and Solana
2. Update unified client interface
3. Add tests for both chains
4. Test cross-chain compatibility

## 🔍 Key Files for AI Reference

### Documentation

- `CLAUDE.md` - Primary AI assistant guide
- `.ai-config.json` - Project metadata
- `README.md` - User documentation

### Configuration

- `package.json` - NPM scripts and dependencies
- `hardhat.config.ts` - EVM configuration
- `Anchor.toml` - Solana configuration
- `.vscode/` - Editor optimizations

### Code Examples

- `examples/` - Working usage examples
- `test/` - Comprehensive test patterns
- `src/` - Client implementation examples

## ⚡ Quick Commands Reference

```bash
# 🏥 Health Check
npm run ai:status

# 🏗️ Build Everything
npm run ai:build

# 🧪 Test Everything
npm run ai:test

# ⚡ Quick Validation
npm run ai:check

# 🔧 EVM Development
npm run compile:evm && npm run test:evm

# 🦀 Solana Development
npm run compile:solana && npm run test:solana

# 🔄 Unified Development
npm run build:unified && npm run test:unified

# 🧹 Clean Slate
npm run clean && npm install
```

## 🚨 Common Pitfalls

1. **Forgetting to compile** after contract changes
2. **Not funding test accounts** with MockUSDC
3. **Missing environment variables** in .env files
4. **Version mismatches** between Anchor CLI and dependencies
5. **Not testing both chains** when making cross-chain changes

## 💡 Pro Tips for AI Development

- Use VS Code tasks (Ctrl/Cmd+Shift+P → "Run Task")
- Check `.vscode/tasks.json` for available automation
- Follow existing patterns in test files
- Reference `examples/` for working code
- Use `npm run ai:status` when stuck

---

**Remember**: This is a production-ready multi-chain project. Always test thoroughly and follow established patterns!

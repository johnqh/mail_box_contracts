# Development Workflow Guide

This document outlines the complete development workflow for the Mailer smart contract project, including setup, development practices, and deployment procedures.

## Quick Start for Developers

### Prerequisites

- **Node.js** 16+ 
- **npm** or **yarn**
- **Git**
- **VS Code** (recommended) with Solidity extension

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd mail_box_contracts

# Install dependencies
npm install

# Verify setup
npm run compile
npm test

# Start development
npx hardhat node  # Terminal 1 - Local blockchain
npm run deploy:local  # Terminal 2 - Deploy contracts
```

## Development Environment

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "juanblanco.solidity",
    "hardhat-solidity",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### Environment Files

Create `.env.local` for local development:
```env
# Local development
PRIVATE_KEY=0x...
RPC_URL=http://localhost:8545

# Recommended: Use Etherscan Multichain API Key (works for all networks)
ETHERSCAN_MULTICHAIN_API_KEY=your_multichain_key_here

# Legacy fallback
ETHERSCAN_API_KEY=your_key_here
```

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/new-feature

# Development cycle
npm run compile     # After contract changes
npm test           # Run full test suite
npm run build      # Build TypeScript

# Commit changes
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

### 2. Contract Development Best Practices

#### File Structure
```
contracts/
├── MailService.sol     # Domain & delegation
├── Mailer.sol         # Messaging & revenue
├── MockUSDC.sol       # Test token
└── interfaces/        # Future interfaces
```

#### Coding Standards

```solidity
// File header
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ContractName
 * @notice Brief description
 * @dev Detailed technical notes
 * @author Mailer Team
 */

contract ContractName {
    /// @notice Public state variable documentation
    uint256 public stateVariable;
    
    /// @notice Event documentation
    /// @param param1 Parameter description
    event EventName(address indexed param1);
    
    /// @notice Function documentation
    /// @dev Implementation details
    /// @param param Parameter description
    /// @return Description of return value
    function functionName(uint256 param) external returns (bool) {
        // Implementation
    }
}
```

#### Security Checklist

- [ ] Use `msg.sender` for authentication
- [ ] Validate all inputs
- [ ] Check for overflow/underflow (Solidity 0.8+)
- [ ] Use custom errors instead of strings
- [ ] Implement proper access controls
- [ ] Test edge cases and error conditions

### 3. Testing Workflow

#### Test-Driven Development

```bash
# 1. Write failing test
npm test -- --grep "new feature"

# 2. Implement feature
# Edit contracts/

# 3. Make test pass
npm run compile
npm test

# 4. Refactor if needed
npm test  # Ensure no regressions
```

#### Test Coverage Requirements

- **Minimum Coverage**: 90%
- **Functions**: 100% coverage required
- **Branches**: 85% minimum
- **Lines**: 90% minimum

```bash
# Generate coverage report
npx hardhat coverage
open coverage/index.html
```

#### Testing Standards

```typescript
describe("FeatureName", function () {
  describe("when condition", function () {
    beforeEach(async function () {
      // Setup specific to this condition
    });

    it("should handle normal case", async function () {
      // Test normal operation
    });

    it("should handle edge case", async function () {
      // Test edge conditions
    });

    it("should revert on invalid input", async function () {
      // Test error conditions
      await expect(
        contract.function(invalidInput)
      ).to.be.revertedWithCustomError(contract, "ErrorName");
    });
  });
});
```

## Code Quality Standards

### Linting and Formatting

```bash
# If available in project
npm run lint          # ESLint for TypeScript
npm run lint:fix      # Auto-fix issues
npm run format        # Prettier formatting
```

### Git Commit Standards

Use conventional commits:

```bash
feat: add delegation rejection functionality
fix: resolve fee calculation bug
docs: update README with new features
test: add comprehensive Mailer tests
refactor: optimize gas usage in MailService
style: format contract code
perf: improve claim gas efficiency
```

### Code Review Checklist

#### For Reviewers

- [ ] Code follows project patterns
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Gas optimization considered
- [ ] Security implications reviewed
- [ ] Breaking changes documented

#### For Authors

- [ ] Self-review completed
- [ ] Tests added for new functionality
- [ ] Documentation updated
- [ ] No sensitive data committed
- [ ] Commit messages are clear

## Deployment Workflow

### Local Development

```bash
# Terminal 1: Start local network
npx hardhat node

# Terminal 2: Deploy contracts
npm run deploy:local

# View deployment
cat deployments/hardhat.json
```

### Testnet Deployment

```bash
# Configure network in hardhat.config.ts
# Update .env with testnet details

npm run compile
npm run deploy:testnet

# Verify contracts
npm run verify:testnet
```

### Production Deployment

```bash
# Final testing
npm test
npm run coverage

# Security audit
# External audit recommended

# Deploy to mainnet
npm run deploy:mainnet
npm run verify:mainnet

# Monitor deployment
npm run monitor:mainnet
```

## Debug and Troubleshooting

### Common Issues

#### 1. Compilation Errors

```bash
# Clear cache and rebuild
npm run clean
rm -rf cache/ artifacts/
npm run compile
```

#### 2. Test Failures

```bash
# Run specific test file
npx hardhat test test/MailService.test.ts

# Run with more verbose output
npx hardhat test --verbose

# Debug specific test
npx hardhat test --grep "test description"
```

#### 3. Gas Issues

```bash
# Analyze gas usage
npx hardhat test --reporter gas

# Optimize gas usage
# Use gas-reporter in hardhat.config.ts
```

#### 4. Type Issues

```bash
# Regenerate types
npm run compile

# Check TypeScript
npm run build
npx tsc --noEmit
```

### Debug Logging

```typescript
// In tests - use console.log sparingly
console.log("Debug value:", await contract.getValue());

// In contracts - use events for debugging
event DebugLog(string message, uint256 value);
emit DebugLog("Debug message", value);
```

## Performance Optimization

### Gas Optimization

```solidity
// Use immutable for constants
address public immutable owner;

// Pack structs efficiently
struct ClaimableAmount {
    uint128 amount;    // Reduced from uint256
    uint128 timestamp; // Pack in single slot
}

// Use external for interfaces
function externalFunction() external pure returns (uint256);

// Minimize storage reads
uint256 _fee = sendFee; // Cache storage variable
```

### Development Speed

```bash
# Use test network caching
export HARDHAT_NETWORK_CACHE=true

# Parallel testing
npm test -- --parallel

# Watch mode for development
npx hardhat test --watch
```

## Monitoring and Maintenance

### Health Checks

```bash
# Daily checks
npm test                    # All tests pass
npm run compile            # No compilation errors
npm audit                  # No security vulnerabilities
npm outdated              # Check for updates
```

### Updates and Maintenance

```bash
# Update dependencies (carefully)
npm update

# Update Hardhat
npm install --save-dev hardhat@latest

# Update TypeChain
npm install --save-dev @typechain/hardhat@latest
```

## Documentation Maintenance

### Keep Updated

- [ ] README.md - Project overview
- [ ] CLAUDE.md - AI assistant guide
- [ ] ARCHITECTURE.md - System design
- [ ] TESTING.md - Test patterns
- [ ] DEPLOYMENT.md - Deploy instructions

### Documentation Standards

```markdown
# Use clear headers
## Section
### Subsection

# Include code examples
```solidity
contract Example {
    // Clear, commented code
}
```

# Use checklists for procedures
- [ ] Step 1
- [ ] Step 2
```

## Collaboration Guidelines

### Team Communication

- **Daily**: Share progress in team chat
- **Weekly**: Code review sessions
- **Monthly**: Architecture discussions
- **Releases**: Post-mortem reviews

### Knowledge Sharing

- Document decisions in ADRs (Architecture Decision Records)
- Share learnings in team wiki
- Maintain FAQ for common issues
- Regular code review sessions

## Continuous Integration

### GitHub Actions (Example)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run compile
      - run: npm test
      - run: npm run coverage
```

This workflow ensures consistent, high-quality development while maintaining security and performance standards.
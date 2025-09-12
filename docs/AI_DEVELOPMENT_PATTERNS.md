# AI Development Patterns for MailBox Contracts

This guide provides comprehensive patterns and examples for AI assistants working with the MailBox multi-chain messaging system.

## 🤖 Quick Start for AI Assistants

### Essential Commands (Always Run These)
```bash
# After any contract changes
npm run compile

# Before any commit or deployment
npm test

# Build everything
npm run build

# Check types and lint
npx tsc --noEmit
npx eslint src/ test/ --ext .ts,.js
```

### Project Status Check
```bash
# Get comprehensive project status
npm run ai:status

# Quick health check
git status && npm test
```

## 🏗️ Development Patterns

### 1. Contract Modification Pattern

**When modifying Solidity contracts:**
```bash
# 1. Edit contract files in contracts/
# 2. Always compile after changes
npm run compile

# 3. Run tests to ensure no regression
npm test

# 4. Check specific tests
npm test -- --grep "ContractName"
```

**When modifying Solana programs:**
```bash
# 1. Edit program files in programs/
# 2. Build with anchor
anchor build --skip-lint

# 3. Run tests
npm run test:solana
```

### 2. Client Library Development Pattern

**TypeScript Client Changes:**
```typescript
// 1. Modify files in src/
// 2. Update types if needed in src/types/
// 3. Add comprehensive JSDoc comments
// 4. Run type checking
npx tsc --noEmit

// 5. Test the changes
npm run test:unified:direct
```

### 3. Testing Patterns

**Comprehensive Test Strategy:**
```javascript
// Always test both success and failure cases
describe("Contract Function", () => {
  it("should succeed with valid inputs", async () => {
    // Setup test data
    await mockUSDC.mint(user.address, ethers.parseUnits("100", 6));
    await mockUSDC.connect(user).approve(contract.address, ethers.parseUnits("10", 6));
    
    // Execute and verify
    await expect(contract.connect(user).someFunction())
      .to.emit(contract, "SomeEvent")
      .withArgs(expectedArgs);
  });
  
  it("should fail with insufficient balance", async () => {
    // Test error conditions
    await expect(contract.connect(user).someFunction())
      .to.be.revertedWithCustomError(contract, "InsufficientFunds");
  });
});
```

## 📝 Code Documentation Standards

### 1. Solidity Documentation

```solidity
/**
 * @title Contract Name
 * @dev Detailed description of what the contract does
 * @author MailBox Protocol Team
 */
contract MyContract {
    /**
     * @dev Function description with business logic explanation
     * @param paramName Description of the parameter and its constraints
     * @return returnName Description of what is returned
     * 
     * Requirements:
     * - param must be non-zero
     * - caller must have sufficient balance
     * 
     * Emits:
     * - SomeEvent when successful
     * 
     * @custom:security This function has reentrancy protection
     */
    function someFunction(uint256 paramName) external returns (bool returnName) {
        // Implementation with clear comments
    }
}
```

### 2. TypeScript Documentation

```typescript
/**
 * Class description with usage examples
 * 
 * @example Basic Usage
 * ```typescript
 * const instance = new MyClass(config);
 * const result = await instance.method();
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * try {
 *   await instance.riskyMethod();
 * } catch (error) {
 *   console.log('Handle error:', error.message);
 * }
 * ```
 */
export class MyClass {
    /**
     * Method description with parameter details
     * 
     * @param param1 - Description and constraints
     * @param param2 - Optional parameter with default
     * @returns Promise resolving to result description
     * 
     * @throws {Error} When validation fails
     * @throws {NetworkError} When RPC connection fails
     * 
     * @since 1.0.0
     */
    async method(param1: string, param2: boolean = false): Promise<Result> {
        // Implementation with inline comments for complex logic
    }
}
```

## 🔍 Common Development Scenarios

### Scenario 1: Adding New Contract Function

```bash
# 1. Add function to contract
# Edit contracts/Mailer.sol

# 2. Compile and generate types
npm run compile

# 3. Add to TypeScript client
# Edit src/evm/mailer-client.ts

# 4. Write comprehensive tests
# Edit test/evm/Mailer.test.ts

# 5. Run full test suite
npm test

# 6. Update documentation
# Edit relevant README files
```

### Scenario 2: Fixing Bug in Multi-Chain Code

```bash
# 1. Identify bug in tests
npm test -- --grep "failing test"

# 2. Fix in both EVM and Solana if applicable
# Edit contracts/ and programs/

# 3. Compile both
npm run compile
anchor build --skip-lint

# 4. Fix unified client if needed
# Edit src/unified/mailbox-client.ts

# 5. Verify fix
npm test

# 6. Add regression test
# Add test case to prevent future regression
```

### Scenario 3: Updating Chain Configuration

```typescript
// When adding new network support:

// 1. Update network configs
// Edit src/utils/chain-config.ts
export const NETWORK_CONFIGS = {
  // ... existing configs
  newNetwork: {
    rpc: 'https://rpc.newnetwork.com',
    chainId: 12345,
    usdc: '0x...'
  }
};

// 2. Update types if needed
// Edit src/unified/types.ts

// 3. Test configuration
// Add tests in test/unified/
```

## 🚨 Error Handling Patterns

### 1. Smart Contract Error Handling

```solidity
// Use custom errors (gas efficient)
error InsufficientFunds(uint256 required, uint256 available);
error UnauthorizedAccess(address caller, address required);

function someFunction() external {
    if (balance < required) {
        revert InsufficientFunds(required, balance);
    }
}
```

### 2. TypeScript Error Handling

```typescript
// Comprehensive error handling with specific error types
async function riskyOperation(): Promise<Result> {
    try {
        const result = await chainOperation();
        return result;
    } catch (error) {
        // Handle specific error types
        if (error.message.includes('insufficient funds')) {
            throw new Error(`Insufficient USDC balance. Please add funds to continue.`);
        } else if (error.message.includes('user rejected')) {
            throw new Error(`Transaction was rejected by user. Please try again.`);
        } else if (error.code === 'NETWORK_ERROR') {
            throw new Error(`Network connection failed. Please check your internet connection.`);
        } else {
            // Re-throw with context
            throw new Error(`Operation failed: ${error.message}`);
        }
    }
}
```

## 🔧 Debugging Strategies

### 1. Contract Debugging

```bash
# Use hardhat console for debugging
npx hardhat console

# Deploy contracts locally for testing
npm run deploy:local

# Run specific test with detailed output
npm test -- --grep "specific test" --reporter spec
```

### 2. Client Debugging

```typescript
// Add detailed logging for debugging
console.log('🔍 Debug: Operation starting', { 
    chainType: this.chainType, 
    walletAddress: this.wallet.address,
    config: this.config 
});

// Use try-catch with detailed error context
try {
    const result = await operation();
    console.log('✅ Success:', result);
    return result;
} catch (error) {
    console.error('❌ Error details:', {
        operation: 'sendMessage',
        error: error.message,
        stack: error.stack,
        context: { subject, body, priority }
    });
    throw error;
}
```

## 📊 Testing Best Practices

### 1. Test Organization

```javascript
describe("Contract Name", () => {
    describe("Function Name", () => {
        describe("Success Cases", () => {
            it("should handle valid input", async () => {
                // Test implementation
            });
        });
        
        describe("Error Cases", () => {
            it("should revert with invalid input", async () => {
                // Error test implementation
            });
        });
        
        describe("Edge Cases", () => {
            it("should handle boundary conditions", async () => {
                // Edge case testing
            });
        });
    });
});
```

### 2. Mock Data Patterns

```javascript
// Consistent test data setup
const testAddresses = {
    owner: '0x1234567890123456789012345678901234567890',
    user1: '0x2345678901234567890123456789012345678901',
    user2: '0x3456789012345678901234567890123456789012'
};

const testAmounts = {
    smallAmount: ethers.parseUnits("1", 6),    // 1 USDC
    normalAmount: ethers.parseUnits("100", 6),  // 100 USDC  
    largeAmount: ethers.parseUnits("1000", 6)   // 1000 USDC
};

// Reusable setup functions
async function setupTestEnvironment() {
    const [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy contracts
    const mockUSDC = await deployContract("MockUSDC");
    const mailer = await deployContract("Mailer", [mockUSDC.address]);
    
    // Fund test accounts
    await mockUSDC.mint(user1.address, testAmounts.normalAmount);
    await mockUSDC.connect(user1).approve(mailer.address, testAmounts.normalAmount);
    
    return { owner, user1, user2, mockUSDC, mailer };
}
```

## 🚀 Performance Optimization

### 1. Gas Optimization Tips

```solidity
// Pack structs efficiently
struct Message {
    address sender;     // 20 bytes
    uint96 fee;        // 12 bytes (fits in same slot)
    uint256 timestamp; // 32 bytes (new slot)
    string content;    // dynamic
}

// Use events for data that doesn't need on-chain storage
event MessageSent(
    address indexed sender,
    address indexed recipient, 
    string subject,
    uint256 fee
);
```

### 2. TypeScript Performance

```typescript
// Cache expensive operations
class UnifiedMailBoxClient {
    private static moduleCache = new Map();
    
    private async loadModule(name: string) {
        if (!UnifiedMailBoxClient.moduleCache.has(name)) {
            const module = await import(name);
            UnifiedMailBoxClient.moduleCache.set(name, module);
        }
        return UnifiedMailBoxClient.moduleCache.get(name);
    }
}
```

## 📋 AI Assistant Checklist

When working on this project, always:

- [ ] **Compile after contract changes**: `npm run compile`
- [ ] **Run tests before committing**: `npm test`
- [ ] **Check types and lint**: `npx tsc --noEmit && npx eslint src/`
- [ ] **Update documentation** when adding new features
- [ ] **Add comprehensive tests** for new functionality
- [ ] **Handle errors gracefully** with specific error messages
- [ ] **Follow existing code patterns** and naming conventions
- [ ] **Add JSDoc comments** for all public methods
- [ ] **Consider multi-chain compatibility** for all changes
- [ ] **Verify gas efficiency** for contract changes

## 🎯 Success Metrics

A successful AI development session should result in:

- ✅ All tests passing (116+ tests)
- ✅ Zero TypeScript errors
- ✅ Zero ESLint warnings/errors  
- ✅ Clean git status
- ✅ Updated documentation
- ✅ Proper error handling
- ✅ Comprehensive test coverage
- ✅ Cross-chain compatibility maintained

## 📚 Additional Resources

- [Hardhat Documentation](https://hardhat.org/docs)
- [Anchor Framework Guide](https://book.anchor-lang.com/)
- [Ethers.js Documentation](https://docs.ethers.org/v6/)
- [Solana Web3.js Guide](https://solana-labs.github.io/solana-web3.js/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Remember**: This project emphasizes security, comprehensive testing, and clear documentation. Always prioritize these aspects when developing new features or fixing bugs.
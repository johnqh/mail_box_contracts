# AI Development Guide - Mailer Multi-Chain System

This comprehensive guide provides AI assistants with everything needed to effectively develop, maintain, and extend the Mailer multi-chain messaging system.

## 🎯 Project Overview for AI

**Mailer Contracts** is a production-ready multi-chain decentralized messaging system supporting:
- **EVM Chains**: Ethereum, Polygon, Arbitrum, Optimism, Base, etc.
- **Solana**: Mainnet, Devnet, Testnet, Localnet
- **Unified API**: Single client interface with automatic chain detection

### Core Architecture
```
mail_box_contracts/
├── contracts/              # Solidity smart contracts (EVM)
├── programs/               # Rust programs (Solana)
├── src/
│   ├── evm/               # EVM TypeScript clients
│   ├── solana/            # Solana TypeScript clients
│   ├── unified/           # Multi-chain unified client
│   └── utils/             # Shared utilities
├── test/                  # Comprehensive test suites
├── scripts/               # Deployment and management
└── examples/              # Working usage examples
```

## 🚀 Quick Start for AI Development

### Essential Commands
```bash
# Build everything (contracts + clients)
npm run compile    # EVM contracts + TypeScript types
npm run build      # All TypeScript clients

# Test everything
npm test           # All tests
npm run test:evm   # EVM tests only (75 tests)
npm run test:unified # Unified client tests

# Deploy
npm run deploy:local        # Local EVM deployment
npm run deploy:unified      # Multi-chain deployment
```

### Key Files to Understand First
1. `src/unified/onchain-mailer-client.ts` - Main unified client
2. `src/unified/wallet-detector.ts` - Automatic chain detection
3. `examples/unified-usage.ts` - Complete usage patterns
4. `CLAUDE.md` - Architecture overview and AI guide

## 🧠 AI Development Patterns

### 1. Adding New Chain Support

**Pattern**: Follow the EVM/Solana structure
```typescript
// 1. Create new chain directory: src/[chain]/
// 2. Implement client interfaces matching unified/types.ts
// 3. Add chain detection logic to wallet-detector.ts
// 4. Update unified client routing
// 5. Add tests following test/[chain]/ pattern
```

### 2. Multi-Chain Client Development

**Unified Client Extension**:
```typescript
class OnchainMailerClient {
  async newMethod(param: string): Promise<Result> {
    if (this.chainType === 'evm') {
      return this.newEVMMethod(param);
    } else if (this.chainType === 'solana') {
      return this.newSolanaMethod(param);
    }
    // Add other chains as needed
  }
}
```

**Error Handling Pattern**:
```typescript
try {
  const result = await client.someOperation();
  return result;
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes('insufficient funds')) {
    throw new Error('Insufficient balance for operation');
  }
  if (errorMessage.includes('user rejected')) {
    throw new Error('Transaction rejected by user');
  }
  throw new Error(`Operation failed: ${errorMessage}`);
}
```

### 3. Testing Patterns

**EVM Test Structure**:
```typescript
describe('NewFeature', () => {
  let contract: NewContract;
  let mockUSDC: MockUSDC;
  
  beforeEach(async () => {
    // Deploy contracts
    mockUSDC = await deployMockUSDC();
    contract = await deployNewContract(mockUSDC.address);
    
    // Fund test accounts
    await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
    await mockUSDC.connect(addr1).approve(contract.address, ethers.parseUnits("100", 6));
  });
  
  it('Should perform operation correctly', async () => {
    await expect(contract.connect(addr1).newFunction(123))
      .to.emit(contract, 'NewEvent')
      .withArgs(123, expectedResult);
  });
});
```

**Unified Client Test Pattern**:
```typescript
describe('UnifiedClient - NewFeature', () => {
  it('should route to appropriate chain implementation', async () => {
    const evmClient = new OnchainMailerClient(evmWallet, testConfig);
    const solanaClient = new OnchainMailerClient(solanaWallet, testConfig);
    
    expect(evmClient.getChainType()).to.equal('evm');
    expect(solanaClient.getChainType()).to.equal('solana');
  });
});
```

## 🛠 Development Workflows

### Adding New EVM Functionality

1. **Contract Development**:
   ```bash
   # Edit contracts/Contract.sol
   npm run compile
   # Check typechain-types/ for new types
   ```

2. **Client Integration**:
   ```typescript
   // Update src/evm/client.ts
   async newMethod(): Promise<Result> {
     return await this.contract.newMethod();
   }
   ```

3. **Unified Integration**:
   ```typescript
   // Update src/unified/mailbox-client.ts
   async newMethod(): Promise<Result> {
     if (this.chainType === 'evm') {
       return this.newEVMMethod();
     }
   }
   ```

### Adding New Solana Functionality

1. **Program Development**:
   ```rust
   // Edit programs/program_name/src/lib.rs
   // Add instruction handlers
   ```

2. **Build & Generate Types**:
   ```bash
   npm run build:solana  # Builds programs + generates types
   ```

3. **Client Integration**:
   ```typescript
   // Update src/solana/client.ts
   async newMethod(): Promise<Result> {
     const tx = await this.program.methods.newInstruction().rpc();
     return { transactionHash: tx };
   }
   ```

## 📚 Code Examples & Snippets

### Dynamic Import Pattern
```typescript
// Always use dynamic imports for chain-specific code
private async getEVMModules() {
  if (!this.cachedEVMModules) {
    this.cachedEVMModules = await import('../evm');
  }
  return this.cachedEVMModules;
}
```

### Configuration Pattern
```typescript
// Chain configurations should be extensible
interface ChainConfig {
  evm?: {
    rpc: string;
    chainId: number;
    contracts: { [key: string]: string };
  };
  solana?: {
    rpc: string;
    programs: { [key: string]: string };
    usdcMint: string;
  };
}
```

### Timeout Protection Pattern
```typescript
// Always add timeouts to network calls
const result = await Promise.race([
  networkOperation(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 10000)
  )
]);
```

## 🔍 Debugging Guidelines

### Common Issues & Solutions

1. **TypeScript Compilation Errors**:
   ```bash
   # Always recompile after contract changes
   npm run compile
   npm run build
   ```

2. **Test Failures**:
   ```bash
   # Run specific test suites
   npm run test:evm
   npm run test:unified
   ```

3. **Chain Detection Issues**:
   ```typescript
   // Debug wallet detection
   console.log('Wallet properties:', Object.keys(wallet));
   console.log('Detected type:', WalletDetector.detectWalletType(wallet));
   ```

## 🚨 Security Best Practices

1. **Input Validation**:
   ```typescript
   // Always validate addresses
   if (this.chainType === 'evm' && !ethers.isAddress(address)) {
     throw new Error('Invalid EVM address');
   }
   ```

2. **Amount Validation**:
   ```typescript
   // Validate amounts and prevent overflows
   if (amount <= 0 || amount > Number.MAX_SAFE_INTEGER) {
     throw new Error('Invalid amount');
   }
   ```

3. **Transaction Verification**:
   ```typescript
   // Always verify transactions completed
   const receipt = await tx.wait();
   if (!receipt || receipt.status !== 1) {
     throw new Error('Transaction failed');
   }
   ```

## 📖 Documentation Standards

### Function Documentation
```typescript
/**
 * @description Clear description of what the function does
 * @param param1 - Description of parameter with type info
 * @returns Promise resolving to result description
 * @throws Error description of when errors occur
 * 
 * @example
 * ```typescript
 * const result = await client.method('param1');
 * console.log('Result:', result.hash);
 * ```
 */
async method(param1: string): Promise<Result> {
  // Implementation
}
```

## 🎯 AI-Specific Guidelines

### Dynamic Imports Best Practices
```typescript
// ✅ Good: Dynamic imports for chain-specific heavy modules
const evmModules = await import('../evm');
const solanaModules = await import('../solana');

// ❌ Avoid: Static imports that load everything upfront
import { EvmClient } from '../evm/client';
import { SolanaClient } from '../solana/client';
```

### Error Message Patterns
```typescript
// ✅ Good: Specific, actionable error messages
throw new Error('Insufficient USDC balance. Required: 0.1 USDC, Available: 0.05 USDC');

// ❌ Avoid: Generic error messages
throw new Error('Transaction failed');
```

## 🔄 Maintenance Workflows

### Regular Maintenance Tasks
1. **Dependency Updates**:
   ```bash
   npm audit        # Check for vulnerabilities
   npm update       # Update dependencies
   npm test         # Verify everything still works
   ```

2. **Type Generation**:
   ```bash
   # After contract changes
   npm run compile  # Regenerates TypeScript types
   ```

### Pre-Deployment Checklist
- [ ] All tests passing (`npm test`)
- [ ] TypeScript builds without errors (`npm run build`)
- [ ] Examples work with new changes
- [ ] Documentation updated
- [ ] Security considerations reviewed

## 🎉 Success Metrics

The AI development environment is working well when:
- ✅ New features can be added following established patterns
- ✅ Tests provide clear feedback on breaking changes
- ✅ Documentation enables self-service development
- ✅ Error messages guide developers to solutions
- ✅ Examples demonstrate real-world usage patterns

This guide evolves with the project. Always update it when adding new patterns or discovering better approaches!
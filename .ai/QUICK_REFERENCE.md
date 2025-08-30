# MailBox Multi-Chain - Quick Reference for AI Development

## 🚀 Essential Commands

```bash
# 🔨 Build & Compile
npm run compile         # Compile EVM contracts + generate TypeScript types
npm run build          # Build all TypeScript clients (EVM + Solana + Unified)

# 🧪 Testing  
npm test              # Run all tests (105 EVM + unified client tests)
npm run test:evm      # Run EVM contract tests only (105 tests)
npm run test:unified  # Run unified client tests only

# 🚀 Deployment
npm run deploy:local     # Deploy EVM contracts to local Hardhat network
npm run deploy:unified   # Deploy to both EVM and Solana (specify networks)
```

## 📁 Key Files & Their Purpose

| File | Purpose | When to Modify |
|------|---------|----------------|
| `src/unified/mailbox-client.ts` | Main unified client - single API for all chains | Adding new features to unified API |
| `src/unified/wallet-detector.ts` | Automatic chain detection logic | Adding new chain support |
| `src/evm/mailer-client.ts` | EVM-specific client implementation | EVM contract changes |
| `src/solana/mailer-client.ts` | Solana-specific client implementation | Solana program changes |
| `src/utils/chain-config.ts` | Network configurations for all chains | Adding new networks |
| `examples/unified-usage.ts` | Complete usage examples | After API changes |

## 🧠 Core Concepts

### Automatic Chain Detection
```typescript
// Wallet goes in → Chain type detected automatically
const client = new UnifiedMailBoxClient(anyWallet, config);
console.log(client.getChainType()); // 'evm' | 'solana'
```

### Dynamic Module Loading
```typescript
// Chain-specific code loaded only when needed
const evmModules = await import('../evm');  // Only loads for EVM wallets
const solanaModules = await import('../solana');  // Only loads for Solana wallets
```

### Unified API Pattern
```typescript
// Same methods work on all chains
await client.sendMessage(subject, body, priority);  // Routes automatically
await client.delegateTo(address);  // Address format validated per chain
await client.claimRevenue();  // Chain-specific implementation
```

## 🛠️ Common Development Tasks

### Adding New Feature Across All Chains

1. **Design Interface** (`src/unified/types.ts`)
```typescript
interface NewFeatureResult {
  transactionHash: string;
  chainType: 'evm' | 'solana';
  // Chain-specific optional fields
}
```

2. **Implement Per Chain**
```typescript
// EVM: src/evm/client.ts
async newEVMFeature(): Promise<NewFeatureResult> { /* ... */ }

// Solana: src/solana/client.ts  
async newSolanaFeature(): Promise<NewFeatureResult> { /* ... */ }
```

3. **Add to Unified Client** (`src/unified/mailbox-client.ts`)
```typescript
async newFeature(): Promise<NewFeatureResult> {
  return this.chainType === 'evm' ? 
    this.newEVMFeature() : this.newSolanaFeature();
}
```

4. **Add Tests** (`test/unified/`)
```typescript
it('should work on both chains', async () => {
  const evmResult = await evmClient.newFeature();
  const solanaResult = await solanaClient.newFeature();
  expect(evmResult.chainType).to.equal('evm');
  expect(solanaResult.chainType).to.equal('solana');
});
```

### Modifying EVM Contracts

1. **Edit Contract** (`contracts/Contract.sol`)
2. **Compile**: `npm run compile` (ALWAYS do this)
3. **Update Client** (`src/evm/client.ts`)
4. **Update Unified** (`src/unified/mailbox-client.ts`)
5. **Test**: `npm run test:evm`

### Adding New Chain Support

1. **Create Directory**: `src/[newchain]/`
2. **Implement Client**: Following `ChainClient` interface
3. **Add Detection**: Update `wallet-detector.ts`
4. **Add Routing**: Update unified client
5. **Add Tests**: `test/[newchain]/`

## 🔍 Debugging Quick Fixes

### TypeScript Compilation Errors
```bash
# Always recompile after contract changes
npm run compile
npm run build
```

### Test Failures
```bash
# Run specific test suites to isolate issues
npm run test:evm        # Focus on EVM tests
npm run test:unified    # Focus on unified client tests
```

### Import Path Issues
```typescript
// Use relative imports consistently
import { Client } from '../evm/client';          // ✅ Good
import { Client } from '@/evm/client';           // ❌ Avoid absolute paths
```

### Wallet Detection Issues
```typescript
// Debug wallet detection
console.log('Wallet keys:', Object.keys(wallet));
console.log('Has address:', !!wallet.address);
console.log('Has publicKey:', !!wallet.publicKey);
console.log('Detected:', WalletDetector.detectWalletType(wallet));
```

## 🚨 Critical Patterns for AI

### Error Handling Pattern
```typescript
// ALWAYS use this pattern
try {
  const result = await operation();
  return result;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('insufficient funds')) {
    throw new Error('Insufficient balance for operation');
  }
  throw new Error(`Operation failed: ${message}`);
}
```

### Timeout Protection Pattern
```typescript
// ALWAYS add timeouts to network operations
const result = await Promise.race([
  networkOperation(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Operation timeout')), 10000)
  )
]);
```

### Address Validation Pattern
```typescript
// ALWAYS validate addresses before operations
const chainType = WalletDetector.detectChainFromAddress(address);
if (chainType !== this.chainType) {
  throw new Error(`Address format doesn't match wallet chain (${this.chainType})`);
}
```

### Dynamic Import Caching Pattern
```typescript
// ALWAYS cache dynamic imports for performance
private static moduleCache: any = null;

private async getModules() {
  if (!UnifiedClient.moduleCache) {
    UnifiedClient.moduleCache = await import('./heavy-module');
  }
  return UnifiedClient.moduleCache;
}
```

## 📊 Success Metrics

### When Everything is Working
- ✅ `npm run compile` completes without errors
- ✅ `npm run build` builds all TypeScript successfully  
- ✅ `npm run test:evm` shows 105/105 tests passing
- ✅ `npm run test:unified` shows unified tests passing
- ✅ Wallet detection works for all wallet types
- ✅ Same API works on all supported chains

### Performance Indicators
- Module loading time < 1 second
- Network operations timeout after 10 seconds
- Error messages are specific and actionable
- Address validation is instant
- Chain detection is 100% accurate

## 🎯 Architecture Principles

1. **Chain Agnostic**: Same API regardless of blockchain
2. **Performance First**: Lazy loading and module caching
3. **Type Safe**: Full TypeScript support with generated types
4. **Error Resilient**: Comprehensive error handling
5. **Developer Friendly**: Clear patterns and documentation
6. **Production Ready**: Real network configurations included

## 📚 Learning Resources

- **Architecture**: Read `PHASE_3_SUMMARY.md`
- **Development**: Read `AI_DEVELOPMENT_GUIDE.md`
- **Examples**: Study `examples/unified-usage.ts`
- **Patterns**: Check `.ai/snippets/common-patterns.ts`
- **Testing**: Review `.ai/patterns/testing-patterns.md`
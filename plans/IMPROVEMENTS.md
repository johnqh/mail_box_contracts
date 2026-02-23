# Improvement Plans for @sudobility/contracts

## Priority 1 - High Impact

### 1. Remove @ts-nocheck from OnchainMailerClient
- The `src/unified/onchain-mailer-client.ts` file begins with `// @ts-nocheck - Suppress false TypeScript errors with ESNext modules accessing class properties`. This disables all type checking on the most critical file in the package -- the unified client that both web and React Native apps depend on. The underlying type issues (likely related to dynamic imports and static class property caching) should be resolved properly so that full type safety is restored. The `evmClient` and `solanaClient` are typed as `any`, which further undermines type safety.

### 2. Add Integration Tests for Cross-Chain Parity
- The EVM tests are comprehensive (~75 tests plus upgrade tests), but there is no systematic verification that EVM and Solana implementations behave identically for equivalent operations. Adding a cross-chain parity test suite that exercises both chains through the `OnchainMailerClient` with identical inputs and validates equivalent outputs would catch behavioral drift between chains.

### 3. Improve Error Types for Client Libraries
- The EVM contract defines specific custom errors (`OnlyOwner`, `NoClaimableAmount`, `ClaimPeriodNotExpired`, etc.), but the TypeScript client layer may not expose these in a typed way. When a contract call reverts, the error should be decoded into a typed error object that consumers can switch on, rather than requiring them to parse error messages.

## Priority 2 - Medium Impact

### 4. Add JSDoc to React Hook Layer
- The `src/react/hooks/useMailerQueries.ts` and `useMailerMutations.ts` provide grouped hooks (`useFees()`, `useClaimableAmounts()`, `useMessaging()`, `useClaims()`, etc.) that are the primary API for React consumers. Each grouped hook should have JSDoc documenting the queries/mutations it returns, their parameters, and caching behavior.

### 5. Add Validation Utility Tests
- `src/utils/validation.ts` provides `validateDomain`, `validateMessage`, `validateAddress`, and `validateAmount`, and there is a test file at `test/unified/validation.test.ts`. Ensure edge cases are covered: empty strings, addresses with wrong checksums, extremely large amounts, domain names with special characters, and multi-byte unicode in messages.

## Priority 3 - Nice to Have

### 6. Consolidate Build Targets
- The project has four separate TypeScript configurations (`tsconfig.unified.json`, `tsconfig.react-native.json`, `tsconfig.evm.json`, `tsconfig.solana.json`) and produces multiple build outputs. The build matrix is complex and can lead to inconsistencies. Evaluate whether the EVM-only and Solana-only builds are still consumed independently or if consumers always use the unified build.

### 7. Add Gas/Compute Unit Estimation Tests
- The EVM client supports configurable gas multipliers via `GasOptions` and the Solana client supports `ComputeUnitOptions` with auto-simulate capability. These are critical for transaction reliability but may not be thoroughly tested. Adding unit tests that verify gas estimation logic with mocked RPC responses would prevent regressions.

### 8. Document Soft-Fail Fee Pattern for Consumers
- The soft-fail pattern (transactions succeed with `feePaid=false` when USDC transfer fails) is documented in the CLAUDE.md but should also be prominently documented in the JSDoc of every send method on `OnchainMailerClient`. Consumers need to know to check the `feePaid` field in transaction receipts.

# Gas Estimation Guide for EVM Mailer Client

## Overview

All EVM contract calls in the Mailer TypeScript client now include automatic gas estimation with configurable options. This ensures transactions are less likely to fail due to insufficient gas while preventing excessive gas usage.

## Key Features

✅ **Automatic Gas Estimation**: All write operations estimate required gas before execution
✅ **Configurable Buffer**: Default 20% buffer, customizable via `gasMultiplier`
✅ **Manual Override**: Option to use fixed gas limits when needed
✅ **EIP-1559 Support**: Full support for modern gas pricing
✅ **Max Gas Protection**: Set maximum gas limits to prevent excessive costs

## Changes Summary

### New Types

```typescript
// Gas configuration options
interface GasOptions {
  gasMultiplier?: number;        // Buffer multiplier (default: 1.2)
  maxGasLimit?: bigint;          // Maximum gas limit
  gasLimit?: bigint;             // Fixed gas limit (skips estimation)
  maxFeePerGas?: bigint;         // EIP-1559 max fee
  maxPriorityFeePerGas?: bigint; // EIP-1559 priority fee
}

// Transaction result with gas details
interface TransactionResult {
  hash: Hash;                     // Transaction hash
  estimatedGas?: bigint;          // Estimated gas amount
  gasLimit?: bigint;              // Actual gas limit used
}
```

### Updated Method Signatures

All write methods now:

1. Accept an optional `gasOptions` parameter
2. Return `TransactionResult` instead of just `Hash`

Example before:

```typescript
async send(...): Promise<Hash>
```

Example after:

```typescript
async send(..., gasOptions?: GasOptions): Promise<TransactionResult>
```

### Affected Methods

All write operations have been updated with gas estimation:

**Message Sending**

- `send()`
- `sendPrepared()`
- `sendThroughWebhook()`
- `sendToEmailAddress()`
- `sendPreparedToEmailAddress()`

**Claims Management**

- `claimRecipientShare()`
- `claimOwnerShare()`
- `claimExpiredShares()`

**Delegation**

- `delegateTo()`
- `rejectDelegation()`

**Configuration**

- `setFee()`
- `setDelegationFee()`
- `setCustomFeePercentage()`
- `clearCustomFeePercentage()`

**Permissions**

- `setPermission()`
- `removePermission()`

**Contract Control**

- `pause()`
- `unpause()`
- `emergencyUnpause()`
- `distributeClaimableFunds()`

**Deployment**

- `MailerClient.deploy()` - Returns `{ client, result }` with gas details

## Usage Examples

### Basic Usage (Automatic Estimation)

```typescript
// Automatic gas estimation with default 20% buffer
const result = await mailerClient.send(
  recipientAddress,
  'Subject',
  'Message body',
  payerAddress,
  false,
  false,
  walletClient,
  account
);

console.log(`Transaction: ${result.hash}`);
console.log(`Gas used: ${result.gasLimit}`);
```

### Custom Gas Buffer

```typescript
// Use 50% gas buffer for complex operations
const result = await mailerClient.send(
  recipientAddress,
  'Subject',
  'Message body',
  payerAddress,
  false,
  false,
  walletClient,
  account,
  { gasMultiplier: 1.5 }  // 50% buffer
);
```

### Fixed Gas Limit

```typescript
// Skip estimation and use fixed gas
const result = await mailerClient.claimRecipientShare(
  walletClient,
  account,
  { gasLimit: BigInt(300000) }  // Fixed 300k gas
);
```

### With Max Gas Protection

```typescript
// Estimate with max limit protection
const result = await mailerClient.delegateTo(
  delegateAddress,
  walletClient,
  account,
  {
    gasMultiplier: 1.3,
    maxGasLimit: BigInt(500000)  // Cap at 500k gas
  }
);
```

### EIP-1559 Pricing

```typescript
// Use modern gas pricing
const result = await mailerClient.send(
  recipientAddress,
  'Subject',
  'Message body',
  payerAddress,
  false,
  false,
  walletClient,
  account,
  {
    gasMultiplier: 1.2,
    maxFeePerGas: parseUnits('50', 9),      // 50 gwei
    maxPriorityFeePerGas: parseUnits('2', 9) // 2 gwei tip
  }
);
```

## Migration Guide

### For Existing Code

Existing code will continue to work without changes. The gas options parameter is optional, and sensible defaults are applied:

```typescript
// Old code - still works
const hash = await mailerClient.send(...);

// New code - with gas options
const result = await mailerClient.send(..., { gasMultiplier: 1.3 });
const hash = result.hash;  // Extract hash if needed
```

### Recommended Updates

1. **Update return type handling**:

```typescript
// Before
const txHash = await mailerClient.send(...);

// After
const { hash, gasLimit } = await mailerClient.send(...);
```

1. **Add gas monitoring**:

```typescript
const result = await mailerClient.send(...);
console.log(`Estimated: ${result.estimatedGas}, Used: ${result.gasLimit}`);
```

1. **Handle gas estimation failures**:

```typescript
try {
  const result = await mailerClient.send(...);
} catch (error) {
  if (error.message.includes('Gas estimation failed')) {
    // Use fallback gas limit
    const result = await mailerClient.send(..., { gasLimit: BigInt(500000) });
  }
}
```

## Best Practices

1. **Use defaults for most operations** - The 20% buffer works well for typical transactions

2. **Increase buffer for complex operations** - Use 1.5x or higher for deployment or batch operations

3. **Set max limits for user transactions** - Protect users from excessive gas costs:

```typescript
const userGasOptions = {
  gasMultiplier: 1.2,
  maxGasLimit: BigInt(1000000)  // 1M gas max
};
```

1. **Monitor gas usage** - Log estimated vs actual gas for optimization:

```typescript
const result = await mailerClient.send(...);
const efficiency = Number(result.estimatedGas) / Number(result.gasLimit);
console.log(`Gas efficiency: ${(efficiency * 100).toFixed(1)}%`);
```

1. **Handle network congestion** - Adjust fees during high traffic:

```typescript
const gasPrice = await publicClient.getGasPrice();
const isPeakTime = gasPrice > parseUnits('100', 9);

const gasOptions = {
  gasMultiplier: isPeakTime ? 1.5 : 1.2,
  maxFeePerGas: isPeakTime ? gasPrice * 2n : gasPrice
};
```

## Deployment Specifics

Contract deployment uses higher defaults due to complexity:

- Default multiplier: 1.5x (vs 1.2x for regular calls)
- Base estimation: 3M gas
- Returns both client instance and transaction result

```typescript
const { client, result } = await MailerClient.deploy(
  walletClient,
  publicClient,
  account,
  usdcAddress,
  ownerAddress,
  { gasMultiplier: 2.0 }  // Extra safe for deployment
);
```

## Troubleshooting

**"Gas estimation failed"**

- Contract call would revert (check requirements)
- Insufficient balance for operation
- Contract is paused

**Transaction runs out of gas**

- Increase `gasMultiplier` (try 1.5 or 2.0)
- Check for state changes during estimation
- Consider using fixed `gasLimit`

**Gas costs too high**

- Set `maxGasLimit` to cap costs
- Review operation necessity
- Batch operations when possible

## Technical Details

The implementation:

1. Estimates gas using `publicClient.estimateContractGas()`
2. Applies the multiplier for safety buffer
3. Respects max limits if configured
4. Uses the result for transaction execution
5. Returns both estimated and actual values

Default multipliers:

- Regular operations: 1.2x (20% buffer)
- Contract deployment: 1.5x (50% buffer)
- User configurable: 1.0x - 10.0x range

## Summary

Gas estimation is now integrated throughout the EVM Mailer client, providing:

- Safer transactions with automatic estimation
- Flexible configuration for different scenarios
- Better cost control with max limits
- Full backward compatibility
- Detailed gas usage reporting

This ensures your transactions are more reliable while maintaining control over gas costs.

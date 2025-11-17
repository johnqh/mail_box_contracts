# Stateless Client Migration Complete

## Summary

The OnchainMailerClient and its underlying EVM and Solana clients have been successfully refactored to be stateless. All wallet connections and chain information are now passed as parameters to each method call.

## What Was Changed

### 1. Removed Stateful Clients

- **Deleted**: `src/evm/mailer-client.ts` (stateful EVM client)
- **Deleted**: `src/solana/mailer-client.ts` (stateful Solana client)

### 2. Created Stateless Clients

- **Created**: `src/evm/mailer-client-stateless.ts` - Stateless EVM client
- **Created**: `src/solana/mailer-client-stateless.ts` - Stateless Solana client

### 3. Updated OnchainMailerClient

- **Modified**: `src/unified/onchain-mailer-client.ts` - Now uses stateless EVM and Solana clients
- No wallet or chain information stored in constructor
- All methods now require wallet and ChainInfo parameters

### 4. Updated Exports

- **Modified**: `src/evm/index.ts` - Only exports stateless client
- **Modified**: `src/solana/index.ts` - Only exports stateless client
- **Modified**: `src/index.ts` - Updated to export stateless clients

### 5. Fixed Contract Interface Issues

- Fixed `sendThroughWebhook` parameters to match contract
- Fixed `sendToEmailAddress` to include payer parameter
- Fixed `sendPreparedToEmailAddress` to include payer parameter
- Fixed `setPermission` to only take one parameter (allowedWallet)
- Fixed `getRecipientClaimable` function name
- Removed `getDelegation` function (doesn't exist in contract)
- Removed `distributeClaimableFunds` function (doesn't exist in contract)
- Fixed `hasPermission` to use `permissions` contract function

### 6. Fixed Type Issues

- Updated `MailerFees` interface to use `bigint` instead of `number`
- Added optional `expiresAt` property to `ClaimableInfo` interface
- Fixed return values for recipient claimable info

## How to Use the Stateless Clients

### Example Usage

```typescript
import { OnchainMailerClient } from '@sudobility/contracts';
import { ChainInfo } from '@sudobility/configs';
import { createWalletClient, createPublicClient, http } from 'viem';

// Create stateless client (no constructor parameters)
const client = new OnchainMailerClient();

// Prepare wallet and chain info
const evmWallet = {
  walletClient: createWalletClient({
    // ... wallet config
  }),
  publicClient: createPublicClient({
    // ... public client config (optional)
  })
};

const chainInfo: ChainInfo = {
  chainType: 'evm',
  chainId: 1,
  mailerAddress: '0x...',
  // ... other chain config
};

// All methods now take wallet and chainInfo as parameters
const result = await client.sendMessage(
  'Hello',
  'Message body',
  evmWallet,
  chainInfo,
  {
    to: '0xRecipient',
    priority: true
  }
);
```

## Key Features

1. **Automatic Chain Switching**: For EVM transactions, the client will automatically switch to the correct chain if needed
2. **Dynamic RPC Management**: RPC endpoints are created from ChainInfo for each call
3. **No State**: No wallet or configuration stored in the client instance
4. **Full Type Safety**: All methods are fully typed with proper wallet and chain info requirements

## Build Status

✅ **Core TypeScript builds successfully**:

- `npm run build:evm` - ✅ Successful
- `npm run build:solana` - ✅ Successful

## Next Steps (Not Implemented)

The React components (`src/react/`) still use the old stateful client API and would need to be updated:

1. Update `MailerProvider` to use stateless client
2. Update `useMailerMutations` hook to pass wallet and chainInfo to all client calls
3. Update `useMailerQueries` hook to pass wallet and chainInfo to all client calls
4. Remove references to non-existent methods like `sendToEmail`, `sendPreparedToEmail`, `setFee`, `setDelegationFee`

These React components are out of scope for the current stateless migration but would need to be updated for a complete migration.

## Migration Guide

For users migrating from the stateful to stateless client:

### Before (Stateful)

```typescript
const client = new OnchainMailerClient(wallet, chainInfo);
await client.sendMessage('Hello', 'Body', { to: '0x...' });
```

### After (Stateless)

```typescript
const client = new OnchainMailerClient();
await client.sendMessage('Hello', 'Body', wallet, chainInfo, { to: '0x...' });
```

All methods follow this pattern - wallet and chainInfo are now passed as parameters rather than stored in the constructor.

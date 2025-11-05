# Stateless OnchainMailerClient Implementation

## Overview

The OnchainMailerClient has been successfully refactored to be completely stateless. All wallet connections and chain information are now passed as parameters to each method call, providing maximum flexibility and alignment with modern Web3 patterns.

## Key Changes

### 1. Stateless Constructor
```typescript
// Old: Wallet in constructor
const client = new OnchainMailerClient(wallet, config);

// New: No parameters needed
const client = new OnchainMailerClient();
```

### 2. Wallet and ChainInfo as Parameters
```typescript
// All methods now accept wallet and ChainInfo
await client.sendMessage(
  subject: string,
  body: string,
  wallet: EVMWallet | SolanaWallet,
  chainInfo: ChainInfo,
  options?: { priority?: boolean; to?: string }
);
```

### 3. ChainInfo from @sudobility/configs
```typescript
import { RpcHelpers } from '@sudobility/configs';
import { Chain } from '@sudobility/types';

// Get chain information with RPC endpoints and contract addresses
const chainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);
```

## Features Implemented

### 1. Automatic Chain Switching (EVM)
When calling a transaction method, the client automatically switches to the chain specified in ChainInfo:
```typescript
private async switchChainIfNeeded(
  walletClient: WalletClient,
  targetChainId: number
): Promise<void>
```

### 2. RPC Endpoint Management
The client automatically creates PublicClient (EVM) or Connection (Solana) from ChainInfo if not provided:
```typescript
// RPC URL built from ChainInfo
if (chainInfo.alchemyNetwork) {
  rpcUrl = `https://${chainInfo.alchemyNetwork}.g.alchemy.com/v2/demo`;
} else if (chainInfo.ankrNetwork) {
  rpcUrl = `https://rpc.ankr.com/${chainInfo.ankrNetwork}`;
}
```

### 3. Wallet Type Definitions
```typescript
export interface EVMWallet {
  walletClient: WalletClient;
  publicClient?: PublicClient; // Optional, created from ChainInfo if needed
}

export interface SolanaWallet {
  wallet: WalletAdapter;
  connection?: Connection; // Optional, created from ChainInfo if needed
}
```

## Method Signatures

### Transaction Methods
```typescript
// Send message
async sendMessage(
  subject: string,
  body: string,
  wallet: Wallet,
  chainInfo: ChainInfo,
  options?: { priority?: boolean; to?: string; resolveSenderToName?: boolean }
): Promise<MessageResult>

// Delegate to address
async delegateTo(
  delegate: string,
  wallet: Wallet,
  chainInfo: ChainInfo
): Promise<DelegationResult>

// Claim revenue
async claimRevenue(
  wallet: Wallet,
  chainInfo: ChainInfo
): Promise<UnifiedTransaction>
```

### Read Methods
```typescript
// Get send fee
async getSendFee(
  chainInfo: ChainInfo,
  publicClient?: PublicClient,
  connection?: Connection
): Promise<bigint>

// Get delegation
async getDelegation(
  address: string,
  chainInfo: ChainInfo,
  publicClient?: PublicClient,
  connection?: Connection
): Promise<string | null>
```

## Usage Examples

### Basic EVM Usage
```typescript
import { OnchainMailerClient } from '@sudobility/contracts';
import { createWalletClient, createPublicClient, http } from 'viem';
import { RpcHelpers } from '@sudobility/configs';
import { Chain } from '@sudobility/types';

// Create stateless client
const client = new OnchainMailerClient();

// Get chain info
const chainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);

// Create wallet
const walletClient = createWalletClient({
  account: privateKeyToAccount('0x...'),
  chain: mainnet,
  transport: http()
});

// Send message
await client.sendMessage(
  'Subject',
  'Body',
  { walletClient },
  chainInfo,
  { priority: true }
);
```

### Basic Solana Usage
```typescript
// Create stateless client
const client = new OnchainMailerClient();

// Get chain info
const chainInfo = RpcHelpers.getChainInfo(Chain.SOLANA_MAINNET);

// Create wallet
const wallet = new PhantomWalletAdapter();
await wallet.connect();

// Send message
await client.sendMessage(
  'Subject',
  'Body',
  { wallet },
  chainInfo,
  { priority: true }
);
```

### Multi-Chain Usage
```typescript
const client = new OnchainMailerClient();

// Use with Ethereum
const ethInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);
await client.sendMessage('Hello', 'World', evmWallet, ethInfo);

// Use with Polygon (same client, different chain)
const polygonInfo = RpcHelpers.getChainInfo(Chain.POLYGON_MAINNET);
await client.sendMessage('Hello', 'World', evmWallet, polygonInfo);

// Use with Solana (same client, different chain type)
const solanaInfo = RpcHelpers.getChainInfo(Chain.SOLANA_MAINNET);
await client.sendMessage('Hello', 'World', solanaWallet, solanaInfo);
```

## Benefits

1. **Complete Flexibility**: Any wallet can be used with any method call
2. **No State Management**: Client doesn't hold any state, reducing complexity
3. **Multi-Wallet Support**: Same client instance works with unlimited wallets
4. **Chain Agnostic**: Single client handles all chains
5. **Automatic Chain Switching**: Seamless multi-chain operations
6. **RPC Management**: Automatic RPC endpoint selection from ChainInfo
7. **Thread Safe**: Stateless design is inherently thread-safe
8. **Better Testing**: Easier to test with mock wallets and chain info

## Migration Notes

### React Components
The React hooks and provider components need to be updated to work with the new stateless API. See `src/react/MIGRATION_NEEDED.md` for details.

### Backward Compatibility
The old constructor-based API has been removed. Applications need to update to pass wallet and ChainInfo as parameters.

## Files Created/Modified

- **src/unified/onchain-mailer-client.ts**: Complete refactor to stateless pattern
- **examples/stateless-usage.ts**: Comprehensive usage examples
- **test/unified/stateless-client.test.ts**: Tests for stateless behavior
- **docs/stateless-client-implementation.md**: This documentation

## Next Steps

1. Update React components to work with stateless API
2. Update all examples to use the new pattern
3. Update package documentation
4. Consider adding convenience wrappers for common use cases
# ChainConfig Usage Guide

## Overview

This guide explains how to use `ChainConfig` from `@johnqh/types` (v1.8.1+) to initialize TypeScript clients with automatic chain information derivation using `RpcHelpers`.

## What Changed

Previously, you needed to manually configure RPC URLs, chain IDs, and USDC addresses for each network. Now, you only need:

1. **Chain enum** (e.g., `Chain.ETH_MAINNET`)
2. **Alchemy API key** (for RPC access)
3. **Etherscan API key** (for block explorer API access)

Everything else is automatically derived!

## Quick Start

### Basic Usage

```typescript
import { Chain, ChainConfig, RpcHelpers } from '@johnqh/types';
import { buildChainConfig } from '@johnqh/mail_box_contracts';

// 1. Create config with minimal information
const chainConfig: ChainConfig = {
  chain: Chain.ETH_MAINNET,
  alchemyApiKey: process.env.ALCHEMY_API_KEY!,
  etherscanApiKey: process.env.ETHERSCAN_MULTICHAIN_API_KEY!
};

// 2. Get all derived chain information
const chainInfo = RpcHelpers.getChainInfo(chainConfig);
console.log('Chain:', chainInfo.name);           // "Ethereum"
console.log('RPC URL:', chainInfo.rpcUrl);       // Auto-generated Alchemy URL
console.log('Chain ID:', chainInfo.chainId);     // 1
console.log('USDC:', chainInfo.usdcAddress);     // Official USDC address
console.log('Explorer:', chainInfo.explorerUrl); // Block explorer URL

// 3. Build unified config for mailer client
const mailerAddress = '0x...'; // Your deployed contract
const config = buildChainConfig(chainConfig, mailerAddress);

// 4. Initialize client (EVM example)
import { createPublicClient, http } from 'viem';
import { MailerClient } from '@johnqh/mail_box_contracts';

const publicClient = createPublicClient({
  transport: http(config.evm!.rpc),
  chain: { id: config.evm!.chainId, ... }
});

const mailerClient = new MailerClient(
  config.evm!.contracts.mailer,
  publicClient
);
```

## Available Chains

### EVM Chains

- `Chain.ETH_MAINNET`, `Chain.ETH_SEPOLIA`
- `Chain.BASE_MAINNET`, `Chain.BASE_SEPOLIA`
- `Chain.POLYGON_MAINNET`, `Chain.POLYGON_MUMBAI`
- `Chain.OPTIMISM_MAINNET`, `Chain.OPTIMISM_SEPOLIA`
- `Chain.ARBITRUM_MAINNET`, `Chain.ARBITRUM_SEPOLIA`
- `Chain.AVALANCHE_MAINNET`, `Chain.AVALANCHE_FUJI`
- `Chain.BNB_MAINNET`, `Chain.BNB_TESTNET`
- And many more...

### Solana Chains

- `Chain.SOLANA_MAINNET`
- `Chain.SOLANA_DEVNET`
- `Chain.SOLANA_TESTNET`

## Multi-Chain Example

```typescript
const alchemyApiKey = process.env.ALCHEMY_API_KEY!;
const etherscanApiKey = process.env.ETHERSCAN_MULTICHAIN_API_KEY!;

// Initialize clients for multiple chains
const chains = [
  Chain.ETH_MAINNET,
  Chain.BASE_MAINNET,
  Chain.POLYGON_MAINNET,
  Chain.OPTIMISM_MAINNET,
];

for (const chain of chains) {
  const chainConfig: ChainConfig = { chain, alchemyApiKey, etherscanApiKey };
  const chainInfo = RpcHelpers.getChainInfo(chainConfig);

  console.log(`Setting up ${chainInfo.name}...`);

  const config = buildChainConfig(chainConfig, MAILER_ADDRESS);
  // ... create client
}
```

## Switching Networks

Switching between mainnet and testnet is as simple as changing one enum value:

```typescript
// Mainnet
const mainnetConfig: ChainConfig = {
  chain: Chain.ETH_MAINNET,  // 👈 Change this
  alchemyApiKey: '...',
  etherscanApiKey: '...'
};

// Testnet
const testnetConfig: ChainConfig = {
  chain: Chain.ETH_SEPOLIA,  // 👈 To this
  alchemyApiKey: '...',
  etherscanApiKey: '...'
};
```

## RpcHelpers Utility Methods

The `RpcHelpers` class provides many useful methods:

```typescript
import { RpcHelpers, Chain } from '@johnqh/types';

// Get chain type
const type = RpcHelpers.getChainType(Chain.ETH_MAINNET);
// Returns: ChainType.EVM

// Get chain ID
const chainId = RpcHelpers.getChainId(Chain.ETH_MAINNET);
// Returns: 1

// Get USDC address
const usdc = RpcHelpers.getUSDCAddress(Chain.POLYGON_MAINNET);
// Returns: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"

// Get user-friendly name
const name = RpcHelpers.getUserFriendlyName(Chain.BASE_MAINNET);
// Returns: "Base"

// Get RPC URL
const rpcUrl = RpcHelpers.getRpcUrl(alchemyApiKey, Chain.ETH_MAINNET);
// Returns: "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"

// Get block explorer API URL
const explorerApi = RpcHelpers.getExplorerApiUrl(etherscanApiKey, Chain.ETH_MAINNET);
// Returns: "https://api.etherscan.io/api?apikey=YOUR_KEY"

// Get block explorer browser URL
const explorer = RpcHelpers.getBlockExplorerUrl(Chain.ETH_MAINNET);
// Returns: "https://etherscan.io"
```

## Environment Variables

Set these in your `.env` file:

```bash
# Single Alchemy API key works for all networks (EVM + Solana)
ALCHEMY_API_KEY=your_alchemy_api_key_here

# Single Etherscan Multichain API key works for 60+ networks
ETHERSCAN_MULTICHAIN_API_KEY=your_etherscan_multichain_api_key_here
```

## Benefits

1. **Single Source of Truth**: Chain enum + API keys
2. **No Hardcoded Values**: RPC URLs and addresses are derived
3. **Type Safety**: Full TypeScript support with IDE autocomplete
4. **Easy Network Switching**: Change one enum value
5. **Consistent API**: Works the same for EVM and Solana
6. **Less Configuration**: Fewer environment variables needed
7. **Automatic Updates**: New chains can be added to @johnqh/types package

## Migration Guide

### Before (Manual Configuration)

```typescript
const config = {
  evm: {
    rpc: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
    chainId: 1,
    contracts: {
      mailer: '0x...',
      usdc: '0xA0b86a33E6441146a8A8e27c01f0D9B1F5E42E92'
    }
  }
};
```

### After (ChainConfig)

```typescript
import { Chain, ChainConfig, RpcHelpers } from '@johnqh/types';
import { buildChainConfig } from '@johnqh/mail_box_contracts';

const chainConfig: ChainConfig = {
  chain: Chain.ETH_MAINNET,
  alchemyApiKey: process.env.ALCHEMY_API_KEY!,
  etherscanApiKey: process.env.ETHERSCAN_MULTICHAIN_API_KEY!
};

const config = buildChainConfig(chainConfig, '0x...');
// All fields automatically filled!
```

## Complete Example

See [`examples/config-usage.ts`](./examples/config-usage.ts) for complete working examples demonstrating:

- EVM client initialization
- Solana client initialization
- Multi-chain support
- Getting USDC addresses
- Using RpcHelpers utilities

## Resources

- [@johnqh/types Documentation](https://www.npmjs.com/package/@johnqh/types)
- [Alchemy API](https://www.alchemy.com/)
- [Etherscan API](https://etherscan.io/apis)

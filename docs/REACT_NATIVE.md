# React Native Integration Guide

This guide explains how to use `@sudobility/contracts` in a React Native application.

## Prerequisites

- React Native >= 0.70.0
- Node.js >= 20.18.0

## Installation

### 1. Install the package

```bash
npm install @sudobility/contracts
# or
yarn add @sudobility/contracts
```

### 2. Install required polyfills

```bash
npm install react-native-get-random-values buffer react-native-url-polyfill text-encoding
# or
yarn add react-native-get-random-values buffer react-native-url-polyfill text-encoding
```

### 3. Install chain-specific dependencies

For EVM chains:

```bash
npm install viem
```

For Solana:

```bash
npm install @solana/web3.js @solana/spl-token
```

### 4. iOS Setup (if using Solana)

```bash
cd ios && pod install && cd ..
```

## Configuration

### Metro Bundler Configuration

Add the following to your `metro.config.js`:

```javascript
const { getDefaultConfig } = require('@react-native/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for additional file extensions
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

// Handle node_modules that need transformation
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer'),
  stream: require.resolve('readable-stream'),
  crypto: require.resolve('react-native-get-random-values'),
};

module.exports = config;
```

### Babel Configuration (optional)

If you encounter issues with ES modules, add to `babel.config.js`:

```javascript
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Add if using optional chaining or nullish coalescing in dependencies
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator',
  ],
};
```

## Usage

### Step 1: Import polyfills first

In your app entry point (e.g., `index.js` or `App.tsx`), import polyfills **before any other imports**:

```typescript
// index.js or App.tsx - MUST BE FIRST
import '@sudobility/contracts/react-native/polyfills';

// Then your other imports
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

### Step 2: Use the client

```typescript
import { OnchainMailerClient, verifyPolyfills } from '@sudobility/contracts/react-native';
import { RpcHelpers } from '@sudobility/configs';
import { Chain } from '@sudobility/types';

// Optional: Verify polyfills are loaded correctly
const { success, missing } = verifyPolyfills();
if (!success) {
  console.error('Missing polyfills:', missing);
}

// Create client
const client = new OnchainMailerClient();

// Get chain info
const chainInfo = RpcHelpers.getChainInfo(Chain.ETH_MAINNET);

// Use with your wallet connection
async function sendMessage() {
  const result = await client.sendMessage(
    wallet, // Your connected wallet
    chainInfo,
    'Subject',
    'Message body',
    { priority: true }
  );
  console.log('Transaction:', result.transactionHash);
}
```

## EVM-Only Usage

If you only need EVM support, you can use a lighter setup:

```typescript
// Minimal polyfills for EVM-only
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Import EVM client directly
import { EVMMailerClient } from '@sudobility/contracts/evm';
```

## Solana Usage

Solana requires additional setup due to its crypto dependencies:

```typescript
// Full polyfills required
import '@sudobility/contracts/react-native/polyfills';

import { SolanaMailerClient } from '@sudobility/contracts/react-native';
import { Connection, PublicKey } from '@solana/web3.js';

const client = new SolanaMailerClient();
const connection = new Connection('https://api.mainnet-beta.solana.com');

// Use with Solana wallet adapter
```

## Using with Wallet Libraries

### With WalletConnect (EVM)

```typescript
import { createWalletClient, custom } from 'viem';
import { mainnet } from 'viem/chains';
import { OnchainMailerClient } from '@sudobility/contracts/react-native';

// Create wallet client from WalletConnect provider
const walletClient = createWalletClient({
  chain: mainnet,
  transport: custom(walletConnectProvider),
});

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const client = new OnchainMailerClient();
await client.sendMessage(
  { walletClient, publicClient },
  chainInfo,
  'Subject',
  'Body'
);
```

### With Solana Mobile Wallet Adapter

```typescript
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol';
import { OnchainMailerClient } from '@sudobility/contracts/react-native';

const client = new OnchainMailerClient();

await transact(async (wallet) => {
  await client.sendMessage(
    { wallet, connection },
    chainInfo,
    'Subject',
    'Body'
  );
});
```

## Troubleshooting

### "Buffer is not defined"

Ensure polyfills are imported before any other code:

```typescript
// MUST be the first import
import '@sudobility/contracts/react-native/polyfills';
```

### "crypto.getRandomValues is not a function"

Install and import the polyfill:

```bash
npm install react-native-get-random-values
```

```typescript
import 'react-native-get-random-values';
```

### Metro bundler errors with `.cjs` files

Add to `metro.config.js`:

```javascript
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];
```

### Hermes engine compatibility

If using Hermes (default in React Native 0.70+), ensure you have the latest version. Some crypto operations may require:

```javascript
// In metro.config.js
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});
```

### iOS build fails with Solana dependencies

Some Solana packages include native modules. Ensure:

1. Run `pod install` after adding dependencies
2. Clean build: `cd ios && rm -rf build Pods && pod install && cd ..`
3. Reset Metro cache: `npx react-native start --reset-cache`

### Android build fails

Clear gradle cache:

```bash
cd android && ./gradlew clean && cd ..
```

## Performance Considerations

1. **Lazy loading**: The unified client uses dynamic imports to only load chain-specific code when needed.

2. **Connection reuse**: Reuse `Connection` (Solana) and `PublicClient` (EVM) instances instead of creating new ones.

3. **Transaction batching**: For multiple operations, consider batching where possible.

## Example Project Structure

```
your-app/
├── index.js                    # Polyfills imported here FIRST
├── App.tsx
├── src/
│   ├── services/
│   │   └── mailer.ts          # Mailer client initialization
│   ├── hooks/
│   │   └── useMailer.ts       # React hooks for mailer
│   └── screens/
│       └── SendMessage.tsx
├── metro.config.js            # Metro configuration
└── babel.config.js            # Babel configuration
```

## API Reference

See the main [README.md](../README.md) for full API documentation. The React Native exports are identical to the standard exports, just with polyfills pre-configured.

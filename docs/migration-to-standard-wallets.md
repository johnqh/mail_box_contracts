# Migration Guide: From UnifiedWallet to Standard Wallet Libraries

## Overview

This guide helps you migrate from the old `UnifiedWallet` abstraction to using standard wallet libraries:

- **EVM**: wagmi's `WalletClient` and `PublicClient`
- **Solana**: `@solana/wallet-adapter` interface

## Why This Change?

The `UnifiedWallet` interface attempted to normalize incompatible wallet systems, which:

- Created unnecessary abstraction layers
- Fought against ecosystem standards
- Made the code harder to maintain
- Confused developers familiar with standard libraries

The new approach:

- Uses standard wagmi for EVM chains
- Uses standard wallet-adapter for Solana
- Provides better type safety
- Integrates naturally with existing tools

## Migration Steps

### 1. Update Dependencies

```bash
# For EVM projects
npm install viem wagmi

# For Solana projects
npm install @solana/wallet-adapter-base @solana/wallet-adapter-react @solana/wallet-adapter-wallets

# Remove if no longer needed
npm uninstall @custom/unified-wallet
```

### 2. EVM Migration

#### Old Approach (UnifiedWallet)

```typescript
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';

// Old: Creating a unified wallet wrapper
const unifiedWallet = {
  address: window.ethereum.selectedAddress,
  chainType: 'evm',
  signTransaction: async (tx) => {
    return window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [tx]
    });
  }
};

const client = new OnchainMailerClient(unifiedWallet, config);
```

#### New Approach (wagmi)

```typescript
import { createWalletClient, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';

// New: Use standard wagmi clients
const walletClient = createWalletClient({
  chain: mainnet,
  transport: http()
});

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http()
});

const client = OnchainMailerClient.forEVM(
  walletClient,
  publicClient,
  '0xMailerContract',
  '0xUSDCContract'
);
```

### 3. Solana Migration

#### Old Approach (UnifiedWallet)

```typescript
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';

// Old: Creating a unified wallet wrapper
const unifiedWallet = {
  address: window.solana.publicKey.toString(),
  chainType: 'solana',
  publicKey: window.solana.publicKey.toString(),
  signTransaction: async (tx) => window.solana.signTransaction(tx)
};

const client = new OnchainMailerClient(unifiedWallet, config);
```

#### New Approach (wallet-adapter)

```typescript
import { Connection } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';

// New: Use standard wallet-adapter
const wallet = useWallet(); // Or new PhantomWalletAdapter()
const connection = new Connection('https://api.devnet.solana.com');

const client = OnchainMailerClient.forSolana(
  wallet,
  connection,
  'MailerProgramId',
  'USDCMintAddress'
);
```

### 4. React Integration Migration

#### Old Approach

```typescript
import { MailerProvider } from '@johnqh/mail_box_contracts/react';

function App() {
  // Old: Pass raw wallet object
  const wallet = window.ethereum || window.solana;

  return (
    <MailerProvider wallet={wallet} config={config}>
      <YourApp />
    </MailerProvider>
  );
}
```

#### New Approach - EVM with wagmi

```typescript
import { WagmiConfig, createConfig } from 'wagmi';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const config = createConfig({
  chains: [mainnet],
  transports: {
    [mainnet.id]: http()
  }
});

function App() {
  return (
    <WagmiConfig config={config}>
      <YourApp />
    </WagmiConfig>
  );
}

// In your component
function YourComponent() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const mailerClient = useMemo(() => {
    if (!walletClient || !publicClient) return null;

    return OnchainMailerClient.forEVM(
      walletClient,
      publicClient,
      MAILER_ADDRESS,
      USDC_ADDRESS
    );
  }, [walletClient, publicClient]);
}
```

#### New Approach - Solana with wallet-adapter

```typescript
import { WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

const wallets = [new PhantomWalletAdapter()];

function App() {
  return (
    <WalletProvider wallets={wallets}>
      <YourApp />
    </WalletProvider>
  );
}

// In your component
function YourComponent() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const mailerClient = useMemo(() => {
    if (!wallet.connected) return null;

    return OnchainMailerClient.forSolana(
      wallet,
      connection,
      MAILER_PROGRAM,
      USDC_MINT
    );
  }, [wallet, connection]);
}
```

### 5. API Changes

#### Getting Wallet Address

Old:

```typescript
const address = client.getWalletAddress(); // Synchronous
```

New:

```typescript
const address = await client.getWalletAddressAsync(); // Async for EVM
```

#### Client Creation

Old:

```typescript
new OnchainMailerClient(wallet, config); // Generic constructor
```

New:

```typescript
// Specific factory methods
OnchainMailerClient.forEVM(walletClient, publicClient, mailer, usdc);
OnchainMailerClient.forSolana(wallet, connection, program, mint);
```

## Benefits After Migration

1. **Better Type Safety**: Full TypeScript support from wagmi and wallet-adapter
2. **Ecosystem Compatibility**: Works with all wagmi and wallet-adapter tools
3. **Simpler Mental Model**: No custom abstractions to learn
4. **Better Documentation**: Can reference wagmi and wallet-adapter docs
5. **Future Proof**: Aligned with ecosystem standards

## Common Issues and Solutions

### Issue: "Legacy config-based initialization is deprecated"

**Solution**: Use the new factory methods instead of passing config objects:

```typescript
// Instead of this:
new OnchainMailerClient(wallet, { evm: {...} });

// Do this:
OnchainMailerClient.forEVM(walletClient, publicClient, mailer, usdc);
```

### Issue: TypeScript errors with wallet types

**Solution**: Use the proper types from the libraries:

```typescript
import type { WalletClient, PublicClient } from 'viem';
import type { WalletContextState } from '@solana/wallet-adapter-react';
```

### Issue: Cannot find wallet address synchronously

**Solution**: Use the async method:

```typescript
const address = await client.getWalletAddressAsync();
```

## Example Projects

See the following examples for complete implementations:

- [wagmi-integration.ts](../examples/wagmi-integration.ts) - EVM with wagmi
- [wallet-adapter-integration.ts](../examples/wallet-adapter-integration.ts) - Solana with wallet-adapter

## Need Help?

If you encounter issues during migration:

1. Check the [examples](../examples/) directory
2. Review the [API documentation](./api-reference.md)
3. Open an issue on [GitHub](https://github.com/johnqh/mail_box_contracts/issues)

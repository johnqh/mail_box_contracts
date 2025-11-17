# Migration Guide: Stateless Client Pattern

## Overview

The OnchainMailerClient has been refactored to follow a stateless pattern where wallets are passed as function parameters instead of being stored in the constructor. This provides better flexibility and aligns with common Web3 patterns.

## Benefits of the New Pattern

1. **Multiple Wallets**: Same client instance can be used with different wallets
2. **Better Separation**: Clear separation between configuration and wallet state
3. **Thread Safety**: Client is stateless and can be shared safely
4. **Flexibility**: Different wallets for different operations
5. **Standard Pattern**: Aligns with wagmi, ethers, and other Web3 libraries

## API Changes

### Old Pattern (v1/v2)

```typescript
// Wallet passed to constructor
const client = new OnchainMailerClient(wallet, config);

// Methods use stored wallet
const result = await client.sendMessage(subject, body, priority);
```

### New Pattern (v3)

```typescript
// Only configuration in constructor
const client = new OnchainMailerClient({
  evm: { mailerAddress: '0x...', usdcAddress: '0x...' },
  solana: { programId: '...', usdcMint: '...' }
});

// Wallet passed to methods
const result = await client.sendMessage(
  subject,
  body,
  wallet, // Wallet passed here
  { priority: true }
);
```

## Migration Examples

### EVM Migration

#### Before

```typescript
import { OnchainMailerClient } from '@sudobility/contracts';

// Create wallet-specific client
const wallet = createWalletClient({...});
const publicClient = createPublicClient({...});

const client = OnchainMailerClient.forEVM(
  wallet,
  publicClient,
  mailerAddress,
  usdcAddress
);

// Send message
const result = await client.sendMessage('Hello', 'World', true);

// Delegate
const delegation = await client.delegateTo('0xDelegate');
```

#### After

```typescript
import { OnchainMailerClient } from '@sudobility/contracts';

// Create stateless client
const client = new OnchainMailerClient({
  evm: {
    mailerAddress: '0x...',
    usdcAddress: '0x...'
  }
});

// Send message with wallet
const result = await client.sendMessage(
  'Hello',
  'World',
  { walletClient: wallet, publicClient },
  { priority: true }
);

// Delegate with wallet
const delegation = await client.delegateTo(
  '0xDelegate',
  { walletClient: wallet, publicClient }
);
```

### Solana Migration

#### Before

```typescript
import { OnchainMailerClient } from '@sudobility/contracts';

// Create wallet-specific client
const wallet = useWallet();
const connection = new Connection('...');

const client = OnchainMailerClient.forSolana(
  wallet,
  connection,
  programId,
  usdcMint
);

// Send message
const result = await client.sendMessage('Hello', 'World', true);

// Claim revenue
const claim = await client.claimRevenue();
```

#### After

```typescript
import { OnchainMailerClient } from '@sudobility/contracts';

// Create stateless client
const client = new OnchainMailerClient({
  solana: {
    programId: '...',
    usdcMint: '...'
  }
});

// Send message with wallet
const result = await client.sendMessage(
  'Hello',
  'World',
  { wallet, connection },
  { priority: true }
);

// Claim revenue with wallet
const claim = await client.claimRevenue({ wallet, connection });
```

## React Integration

### Before

```typescript
function useMailerClient() {
  const wallet = useWallet();
  const { connection } = useConnection();

  // Client tied to specific wallet
  const client = useMemo(() => {
    if (!wallet.connected) return null;
    return OnchainMailerClient.forSolana(
      wallet,
      connection,
      programId,
      usdcMint
    );
  }, [wallet, connection]);

  return client;
}
```

### After

```typescript
// Create a single client instance (can be global)
const mailerClient = new OnchainMailerClient({
  evm: {
    mailerAddress: process.env.NEXT_PUBLIC_MAILER_ADDRESS!,
    usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS
  },
  solana: {
    programId: process.env.NEXT_PUBLIC_MAILER_PROGRAM!,
    usdcMint: process.env.NEXT_PUBLIC_USDC_MINT!
  }
});

function SendMessageButton() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const handleSend = async () => {
    // Pass wallet when calling
    const result = await mailerClient.sendMessage(
      'Subject',
      'Body',
      { wallet, connection },
      { priority: true }
    );
  };

  return <button onClick={handleSend}>Send</button>;
}
```

## Multi-Wallet Support

One of the key benefits is supporting multiple wallets with the same client:

```typescript
const client = new OnchainMailerClient({
  evm: { mailerAddress: '0x...', usdcAddress: '0x...' }
});

// Use with wallet 1
const result1 = await client.sendMessage(
  'From wallet 1',
  'Message body',
  { walletClient: wallet1, publicClient },
  { priority: true }
);

// Use with wallet 2
const result2 = await client.sendMessage(
  'From wallet 2',
  'Different message',
  { walletClient: wallet2, publicClient },
  { priority: false }
);
```

## Read Operations

Read operations can optionally take a client for better performance:

```typescript
// With specific client
const fee1 = await client.getSendFee(publicClient);

// Or use default (will create temporary client)
const fee2 = await client.getSendFee();
```

## Type Definitions

### EVM Wallet

```typescript
interface EVMWallet {
  walletClient: WalletClient;
  publicClient: PublicClient;
}
```

### Solana Wallet

```typescript
interface SolanaWallet {
  wallet: WalletAdapter;
  connection: Connection;
}
```

## Best Practices

1. **Create once, use many**: Create a single client instance and reuse it
2. **Configuration in environment**: Store addresses in environment variables
3. **Type safety**: Use TypeScript interfaces for wallet parameters
4. **Error handling**: Always handle wallet connection errors
5. **Connection management**: Manage connections separately from the client

## Backward Compatibility

For gradual migration, you can create a wrapper that maintains the old API:

```typescript
class LegacyMailerClient {
  private client: OnchainMailerClient;
  private wallet: any;

  constructor(wallet: any, config: any) {
    this.wallet = wallet;
    this.client = new OnchainMailerClient(config);
  }

  async sendMessage(subject: string, body: string, priority: boolean) {
    return this.client.sendMessage(subject, body, this.wallet, { priority });
  }
}
```

## Summary

The new stateless pattern provides:

- Better flexibility for multi-wallet scenarios
- Cleaner separation of concerns
- Standard Web3 patterns
- Easier testing and mocking
- Thread-safe client instances

The migration is straightforward - move wallet from constructor to method calls.

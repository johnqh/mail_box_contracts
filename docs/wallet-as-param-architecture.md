# Wallet-as-Parameter Architecture

## Overview

This document describes an architectural improvement where wallet connections are passed as function parameters instead of constructor parameters in the OnchainMailerClient. This pattern provides better flexibility, cleaner separation of concerns, and aligns with modern Web3 development patterns.

## Current Architecture (Constructor-based)

```typescript
// Wallet stored in constructor
const client = new OnchainMailerClient({
  wallet: walletClient,
  config: { ... }
});

// Methods use stored wallet
await client.sendMessage('Subject', 'Body', { priority: true });
```

### Limitations

1. **Single wallet per instance**: Each client is tied to one wallet
2. **State management complexity**: Client holds wallet state
3. **React hook issues**: Wallet changes require new client instances
4. **Thread safety concerns**: Stateful clients can't be safely shared
5. **Testing complexity**: Need to mock entire client for different wallets

## Improved Architecture (Parameter-based)

```typescript
// Only configuration in constructor
const client = new OnchainMailerClient({
  evm: { mailerAddress: '0x...', usdcAddress: '0x...' },
  solana: { programId: '...', usdcMint: '...' }
});

// Wallet passed to methods
await client.sendMessage(
  'Subject',
  'Body',
  wallet, // Pass wallet here
  { priority: true }
);
```

### Benefits

#### 1. Multiple Wallet Support

```typescript
// Same client, different wallets
await client.sendMessage('From Alice', 'Message', aliceWallet);
await client.sendMessage('From Bob', 'Message', bobWallet);
```

#### 2. Clean Separation of Concerns

- Client handles: Contract interaction logic, method implementations, validation
- Wallet handles: Signing, account management, connection state

#### 3. React Integration

```typescript
// Single global client instance
const mailerClient = new OnchainMailerClient(config);

function SendButton() {
  const wallet = useWallet(); // Wallet from React hook

  const handleSend = async () => {
    await mailerClient.sendMessage('Subject', 'Body', wallet);
  };

  return <button onClick={handleSend}>Send</button>;
}
```

#### 4. Testing Simplification

```typescript
// Easy to test with different wallets
const mockWallet1 = createMockWallet('0xAlice');
const mockWallet2 = createMockWallet('0xBob');

await client.sendMessage('Test', 'Body', mockWallet1);
await client.sendMessage('Test', 'Body', mockWallet2);
```

#### 5. Thread Safety

- Client is stateless and immutable
- Can be safely shared across components/threads
- No race conditions from wallet state changes

## Implementation Details

### Type Definitions

```typescript
// EVM Wallet
interface EVMWallet {
  walletClient: WalletClient;
  publicClient: PublicClient;
}

// Solana Wallet
interface SolanaWallet {
  wallet: WalletAdapter;
  connection: Connection;
}

// Unified wallet type
type Wallet = EVMWallet | SolanaWallet;
```

### Method Signatures

```typescript
class OnchainMailerClient {
  // Write operations require wallet
  async sendMessage(
    subject: string,
    body: string,
    wallet: Wallet,
    options?: { priority?: boolean; to?: string }
  ): Promise<TransactionResult>;

  async delegateTo(
    delegate: string,
    wallet: Wallet
  ): Promise<TransactionResult>;

  async claimRevenue(
    wallet: Wallet
  ): Promise<TransactionResult>;

  // Read operations can optionally take connection
  async getSendFee(
    connection?: PublicClient | Connection
  ): Promise<bigint>;

  async getDelegation(
    address: string,
    connection?: PublicClient | Connection
  ): Promise<string | null>;
}
```

### Wallet Detection

```typescript
function isEVMWallet(wallet: Wallet): wallet is EVMWallet {
  return 'walletClient' in wallet && 'publicClient' in wallet;
}

function isSolanaWallet(wallet: Wallet): wallet is SolanaWallet {
  return 'wallet' in wallet && 'connection' in wallet;
}
```

## Migration Strategy

### Phase 1: Parallel Implementation

- Create new methods with wallet parameters
- Keep existing constructor-based methods for compatibility
- Mark old methods as deprecated

### Phase 2: Documentation & Examples

- Update all documentation to use new pattern
- Provide migration guides
- Update example applications

### Phase 3: Removal

- Remove deprecated methods in major version bump
- Provide automated migration tool if needed

## Code Examples

### Basic Usage

```typescript
import { OnchainMailerClient } from '@sudobility/contracts';

// Create client once
const client = new OnchainMailerClient({
  evm: {
    mailerAddress: process.env.MAILER_ADDRESS,
    usdcAddress: process.env.USDC_ADDRESS
  },
  solana: {
    programId: process.env.PROGRAM_ID,
    usdcMint: process.env.USDC_MINT
  }
});

// EVM usage
const evmWallet = {
  walletClient: createWalletClient(...),
  publicClient: createPublicClient(...)
};

await client.sendMessage('Hello', 'World', evmWallet);

// Solana usage
const solanaWallet = {
  wallet: phantomWallet,
  connection: new Connection(...)
};

await client.sendMessage('Hello', 'World', solanaWallet);
```

### React Usage

```typescript
// App.tsx - Create client once
export const mailerClient = new OnchainMailerClient({
  evm: { ... },
  solana: { ... }
});

// Component.tsx - Use with any wallet
function MessageSender() {
  const { walletClient, publicClient } = useWalletClient();

  const sendMessage = async () => {
    const wallet = { walletClient, publicClient };
    await mailerClient.sendMessage('Subject', 'Body', wallet);
  };

  return <button onClick={sendMessage}>Send</button>;
}
```

### Advanced Patterns

```typescript
// Batch operations with different wallets
async function sendBatch(messages: Array<{ from: Wallet; content: string }>) {
  const results = await Promise.all(
    messages.map(({ from, content }) =>
      client.sendMessage('Batch', content, from)
    )
  );
  return results;
}

// Conditional wallet selection
async function smartSend(message: string, preferredChain?: 'evm' | 'solana') {
  const wallet = preferredChain === 'evm' ? evmWallet : solanaWallet;
  return client.sendMessage('Smart', message, wallet);
}
```

## Performance Considerations

### Advantages

- No wallet state management overhead
- Client can be cached/memoized safely
- Reduced memory usage (one client for all wallets)
- Better garbage collection (wallets released after use)

### Caching Strategy

```typescript
// Global singleton pattern
let clientInstance: OnchainMailerClient;

export function getMailerClient(): OnchainMailerClient {
  if (!clientInstance) {
    clientInstance = new OnchainMailerClient(config);
  }
  return clientInstance;
}
```

## Security Considerations

1. **No stored credentials**: Wallets aren't stored, reducing attack surface
2. **Explicit authorization**: Each operation explicitly receives wallet
3. **Easier auditing**: Clear wallet usage in each function call
4. **Reduced state corruption**: No mutable wallet state to corrupt

## Comparison with Industry Standards

### Similar Patterns

#### Ethers.js v6

```typescript
// Contract instance without signer
const contract = new Contract(address, abi, provider);
// Pass signer for transactions
await contract.connect(signer).transfer(to, amount);
```

#### Wagmi Actions

```typescript
// Actions take config as parameter
await sendTransaction(config, {
  to: '0x...',
  value: parseEther('1')
});
```

#### Solana Web3.js

```typescript
// Transaction built separately from signing
const transaction = new Transaction().add(instruction);
await sendAndConfirmTransaction(connection, transaction, [signer]);
```

## Conclusion

The wallet-as-parameter architecture provides significant improvements in flexibility, maintainability, and alignment with Web3 best practices. This pattern enables better multi-wallet support, cleaner React integration, and improved testing capabilities while maintaining a simple and intuitive API.

## Implementation Status

- ✅ Prototype created (onchain-mailer-client-v3.ts)
- ✅ Examples documented (stateless-client-usage.ts)
- ✅ Migration guide created (stateless-client-migration.md)
- ⏳ Ready for integration in next major version

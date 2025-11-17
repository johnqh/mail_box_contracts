# Integration Guide

Complete integration guide for using `@johnqh/mail_box_contracts` across different environments and frameworks.

## Table of Contents

- [Installation](#installation)
- [Node.js Backend Integration](#nodejs-backend-integration)
- [Frontend Integration](#frontend-integration)
- [React Native Integration](#react-native-integration)
- [Framework-Specific Examples](#framework-specific-examples)
- [TypeScript Support](#typescript-support)
- [Module Format Support](#module-format-support)
- [Common Integration Patterns](#common-integration-patterns)
- [Troubleshooting](#troubleshooting)

## Installation

```bash
npm install @johnqh/mail_box_contracts
```

The package supports both CommonJS and ESM module formats, automatically serving the appropriate version based on your environment.

## Node.js Backend Integration

### CommonJS (Traditional Node.js)

```javascript
const { OnchainMailerClient, WalletDetector } = require('@johnqh/mail_box_contracts');

// Initialize client
const client = new OnchainMailerClient({
  network: { 
    chainType: 'evm', 
    network: 'mainnet', 
    rpcUrl: process.env.RPC_URL 
  },
  addresses: { 
    mailer: process.env.MAILER_ADDRESS,
    usdcToken: process.env.USDC_ADDRESS 
  },
  privateKey: process.env.PRIVATE_KEY
});

// Send a message
async function sendMessage() {
  try {
    const result = await client.sendMessage(
      '0x742d35Cc6634C0532925a3b8D2C36B7f1234567',
      'Hello from Node.js',
      'This message was sent from a Node.js backend!'
    );
    console.log('Message sent:', result.txHash);
  } catch (error) {
    console.error('Failed to send message:', error.message);
  }
}
```

### ESM (Modern Node.js)

```javascript
import { OnchainMailerClient, WalletDetector } from '@johnqh/mail_box_contracts';

const client = new OnchainMailerClient({
  network: { chainType: 'solana', network: 'mainnet-beta', rpcUrl: process.env.SOLANA_RPC },
  addresses: { 
    mailer: process.env.SOLANA_MAILER_PROGRAM,
    usdcToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  privateKey: process.env.SOLANA_PRIVATE_KEY
});

// Use async/await at top level in ESM
const result = await client.sendMessage(
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  'Subject',
  'Message body'
);
```

## Frontend Integration

### React.js with Webpack/Vite

```tsx
import React, { useState } from 'react';
import { OnchainMailerClient, WalletDetector, ChainType } from '@johnqh/mail_box_contracts';

const MailComponent: React.FC = () => {
  const [client, setClient] = useState<OnchainMailerClient | null>(null);

  useEffect(() => {
    async function initializeClient() {
      // Detect wallet type
      const walletType = WalletDetector.detectWalletType(window.ethereum);
      
      const clientConfig = {
        network: { 
          chainType: ChainType.EVM,
          network: 'mainnet', 
          rpcUrl: process.env.REACT_APP_RPC_URL 
        },
        addresses: { 
          mailer: process.env.REACT_APP_MAILER_ADDRESS,
          usdcToken: process.env.REACT_APP_USDC_ADDRESS 
        }
      };

      const mailerClient = new OnchainMailerClient(clientConfig);
      setClient(mailerClient);
    }

    initializeClient();
  }, []);

  const sendMessage = async () => {
    if (!client) return;
    
    try {
      const result = await client.sendMessage(
        recipient,
        subject,
        messageBody
      );
      alert(`Message sent! TX: ${result.txHash}`);
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div>
      <button onClick={sendMessage}>Send Message</button>
    </div>
  );
};
```

### Vue.js Integration

```vue
<template>
  <div>
    <button @click="sendMessage">Send Message</button>
  </div>
</template>

<script>
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';

export default {
  data() {
    return {
      client: null
    };
  },
  
  async mounted() {
    this.client = new OnchainMailerClient({
      network: { chainType: 'evm', network: 'mainnet', rpcUrl: process.env.VUE_APP_RPC_URL },
      addresses: { 
        mailer: process.env.VUE_APP_MAILER_ADDRESS,
        usdcToken: process.env.VUE_APP_USDC_ADDRESS 
      }
    });
  },

  methods: {
    async sendMessage() {
      const result = await this.client.sendMessage('0x...', 'Subject', 'Body');
      console.log('Sent:', result.txHash);
    }
  }
};
</script>
```

## React Native Integration

```tsx
import React, { useEffect, useState } from 'react';
import { View, Button, Alert } from 'react-native';
import { OnchainMailerClient, ChainType } from '@johnqh/mail_box_contracts';

const MailScreen: React.FC = () => {
  const [client, setClient] = useState<OnchainMailerClient | null>(null);

  useEffect(() => {
    const initClient = async () => {
      const mailerClient = new OnchainMailerClient({
        network: { 
          chainType: ChainType.SOLANA,
          network: 'devnet', 
          rpcUrl: 'https://api.devnet.solana.com'
        },
        addresses: { 
          mailer: 'YOUR_SOLANA_PROGRAM_ID',
          usdcToken: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
        },
        privateKey: 'YOUR_PRIVATE_KEY' // In production, use secure key management
      });
      setClient(mailerClient);
    };

    initClient();
  }, []);

  const handleSendMessage = async () => {
    if (!client) return;

    try {
      const result = await client.sendMessage(
        'RECIPIENT_PUBLIC_KEY',
        'Mobile Message',
        'Sent from React Native app'
      );
      Alert.alert('Success', `Message sent! TX: ${result.txHash}`);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View>
      <Button title="Send Message" onPress={handleSendMessage} />
    </View>
  );
};
```

## Framework-Specific Examples

### Express.js API Server

```javascript
const express = require('express');
const { OnchainMailerClient } = require('@johnqh/mail_box_contracts');

const app = express();
app.use(express.json());

// Initialize client once
const mailerClient = new OnchainMailerClient({
  network: { chainType: 'evm', network: 'mainnet', rpcUrl: process.env.RPC_URL },
  addresses: { 
    mailer: process.env.MAILER_ADDRESS,
    usdcToken: process.env.USDC_ADDRESS 
  },
  privateKey: process.env.PRIVATE_KEY
});

// Send message endpoint
app.post('/api/send-message', async (req, res) => {
  try {
    const { to, subject, body, priority } = req.body;
    
    const options = { priority: priority || 'standard' };
    const result = await mailerClient.sendMessage(to, subject, body, options);
    
    res.json({ 
      success: true, 
      txHash: result.txHash,
      block: result.block 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Check delegation endpoint
app.get('/api/delegation/:address', async (req, res) => {
  try {
    const delegation = await mailerClient.getDelegation(req.params.address);
    res.json({ delegation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Mail API server running on port 3000');
});
```

### Next.js API Routes

```typescript
// pages/api/mail/send.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { OnchainMailerClient, ChainType } from '@johnqh/mail_box_contracts';

const client = new OnchainMailerClient({
  network: { 
    chainType: ChainType.EVM,
    network: 'mainnet', 
    rpcUrl: process.env.RPC_URL! 
  },
  addresses: { 
    mailer: process.env.MAILER_ADDRESS!,
    usdcToken: process.env.USDC_ADDRESS!
  },
  privateKey: process.env.PRIVATE_KEY!
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, body } = req.body;
    const result = await client.sendMessage(to, subject, body);
    
    res.status(200).json({ 
      success: true,
      txHash: result.txHash 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
```

### NestJS Service

```typescript
// mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnchainMailerClient, ChainType, SendMessageOptions } from '@johnqh/mail_box_contracts';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private client: OnchainMailerClient;

  constructor(private configService: ConfigService) {
    this.client = new OnchainMailerClient({
      network: {
        chainType: ChainType.EVM,
        network: this.configService.get('NETWORK') || 'mainnet',
        rpcUrl: this.configService.get('RPC_URL')!
      },
      addresses: {
        mailer: this.configService.get('MAILER_ADDRESS')!,
        usdcToken: this.configService.get('USDC_ADDRESS')!
      },
      privateKey: this.configService.get('PRIVATE_KEY')!
    });
  }

  async sendMessage(
    to: string,
    subject: string,
    body: string,
    options?: SendMessageOptions
  ) {
    try {
      this.logger.log(`Sending message to ${to}: ${subject}`);
      const result = await this.client.sendMessage(to, subject, body, options);
      this.logger.log(`Message sent successfully: ${result.txHash}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      throw error;
    }
  }

  async getDelegation(address: string) {
    return await this.client.getDelegation(address);
  }
}
```

### Serverless Functions

#### Vercel Function

```typescript
// api/send-message.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { OnchainMailerClient, ChainType } from '@johnqh/mail_box_contracts';

const client = new OnchainMailerClient({
  network: { 
    chainType: ChainType.SOLANA,
    network: 'mainnet-beta', 
    rpcUrl: process.env.SOLANA_RPC_URL!
  },
  addresses: { 
    mailer: process.env.SOLANA_MAILER_PROGRAM!,
    usdcToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  privateKey: process.env.SOLANA_PRIVATE_KEY!
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, body } = req.body;
    const result = await client.sendMessage(to, subject, body);
    
    res.json({ success: true, txHash: result.txHash });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### AWS Lambda

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { OnchainMailerClient, ChainType } from '@johnqh/mail_box_contracts';

const client = new OnchainMailerClient({
  network: { 
    chainType: ChainType.EVM,
    network: 'mainnet', 
    rpcUrl: process.env.RPC_URL! 
  },
  addresses: { 
    mailer: process.env.MAILER_ADDRESS!,
    usdcToken: process.env.USDC_ADDRESS!
  },
  privateKey: process.env.PRIVATE_KEY!
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const { to, subject, body } = JSON.parse(event.body || '{}');
    const result = await client.sendMessage(to, subject, body);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        txHash: result.txHash 
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
    };
  }
};
```

## TypeScript Support

The package includes complete TypeScript definitions:

```typescript
import { 
  OnchainMailerClient,
  WalletDetector,
  ChainType,
  SendMessageOptions,
  TransactionResult,
  NetworkConfig 
} from '@johnqh/mail_box_contracts';

// Fully typed configuration
const config: NetworkConfig = {
  chainType: ChainType.EVM,
  network: 'mainnet',
  rpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
  chainId: 1
};

// Typed options
const options: SendMessageOptions = {
  priority: 'priority',
  gasConfig: {
    gasPrice: 20000000000n,
    gasLimit: 100000n
  }
};

// Typed result
const result: TransactionResult = await client.sendMessage(
  '0x...',
  'Subject',
  'Body',
  options
);
```

## Module Format Support

The package automatically serves the appropriate module format:

### Package.json Configuration

```json
{
  "main": "dist/unified/src/unified/index.js",
  "module": "dist/unified-esm/src/unified/index.js",
  "types": "dist/unified/src/unified/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/unified-esm/src/unified/index.js",
      "require": "./dist/unified/src/unified/index.js",
      "types": "./dist/unified/src/unified/index.d.ts"
    }
  }
}
```

### Environment Detection

- **Node.js with `require()`** → Gets CommonJS build
- **Node.js with `import`** → Gets ESM build
- **Webpack/Vite bundlers** → Gets ESM build (enables tree-shaking)
- **React Native Metro** → Gets ESM build (optimized bundles)

## Common Integration Patterns

### Environment-Based Configuration

```typescript
// config/mailer.ts
import { OnchainMailerClient, ChainType } from '@johnqh/mail_box_contracts';

function createMailerClient() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return new OnchainMailerClient({
    network: {
      chainType: ChainType.EVM,
      network: isProduction ? 'mainnet' : 'sepolia',
      rpcUrl: isProduction 
        ? process.env.MAINNET_RPC_URL! 
        : process.env.SEPOLIA_RPC_URL!
    },
    addresses: {
      mailer: isProduction 
        ? process.env.MAINNET_MAILER_ADDRESS!
        : process.env.SEPOLIA_MAILER_ADDRESS!,
      usdcToken: isProduction
        ? '0xA0b86a33E6Bef2a7ceDE37CEFf51097e' // Mainnet USDC
        : '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // Sepolia USDC
    },
    privateKey: process.env.PRIVATE_KEY!
  });
}

export const mailerClient = createMailerClient();
```

### Error Handling Wrapper

```typescript
// utils/mailer-wrapper.ts
import { OnchainMailerClient, OperationError } from '@johnqh/mail_box_contracts';

export class MailerWrapper {
  private client: OnchainMailerClient;

  constructor(client: OnchainMailerClient) {
    this.client = client;
  }

  async sendMessageSafely(to: string, subject: string, body: string) {
    try {
      const result = await this.client.sendMessage(to, subject, body);
      return { success: true, data: result };
    } catch (error) {
      const operationError = error as OperationError;
      return { 
        success: false, 
        error: {
          code: operationError.code || 'UNKNOWN_ERROR',
          message: operationError.message,
          txHash: operationError.txHash
        }
      };
    }
  }
}
```

### Multi-Chain Support

```typescript
// services/multi-chain-mailer.ts
import { OnchainMailerClient, ChainType, WalletDetector } from '@johnqh/mail_box_contracts';

export class MultiChainMailer {
  private evmClient: OnchainMailerClient;
  private solanaClient: OnchainMailerClient;

  constructor() {
    this.evmClient = new OnchainMailerClient({
      network: { chainType: ChainType.EVM, network: 'mainnet', rpcUrl: process.env.EVM_RPC! },
      addresses: { 
        mailer: process.env.EVM_MAILER_ADDRESS!,
        usdcToken: process.env.EVM_USDC_ADDRESS!
      }
    });

    this.solanaClient = new OnchainMailerClient({
      network: { chainType: ChainType.SOLANA, network: 'mainnet-beta', rpcUrl: process.env.SOLANA_RPC! },
      addresses: { 
        mailer: process.env.SOLANA_MAILER_PROGRAM!,
        usdcToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      }
    });
  }

  async sendMessage(to: string, subject: string, body: string) {
    // Auto-detect chain based on address format
    const chainType = WalletDetector.detectChainFromAddress(to);
    
    if (chainType === ChainType.EVM) {
      return await this.evmClient.sendMessage(to, subject, body);
    } else if (chainType === ChainType.SOLANA) {
      return await this.solanaClient.sendMessage(to, subject, body);
    } else {
      throw new Error(`Unsupported address format: ${to}`);
    }
  }
}
```

## Troubleshooting

### Common Issues

#### Module Resolution Errors

```bash
# Error: Cannot find module '@johnqh/mail_box_contracts'
npm install @johnqh/mail_box_contracts

# Clear cache if needed
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### TypeScript Import Errors

```typescript
// Use type-only imports for types
import type { ChainType, NetworkConfig } from '@johnqh/mail_box_contracts';
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';
```

#### ESM/CommonJS Mixed Usage

```javascript
// Don't mix require and import in the same file
// ❌ Don't do this
const { OnchainMailerClient } = require('@johnqh/mail_box_contracts');
import { ChainType } from '@johnqh/mail_box_contracts';

// ✅ Use one consistently
import { OnchainMailerClient, ChainType } from '@johnqh/mail_box_contracts';
```

### Environment-Specific Issues

#### React Native Metro Bundler

```javascript
// metro.config.js - if you encounter resolution issues
module.exports = {
  resolver: {
    alias: {
      '@johnqh/mail_box_contracts': '@johnqh/mail_box_contracts/dist/unified-esm/src/unified/index.js'
    }
  }
};
```

#### Webpack Bundle Size

```javascript
// webpack.config.js - ensure tree shaking works
module.exports = {
  optimization: {
    usedExports: true,
    sideEffects: false
  }
};
```

### Performance Considerations

- **Tree Shaking**: ESM builds enable tree shaking in modern bundlers
- **Code Splitting**: Import specific functions when possible
- **Bundle Size**: The package is optimized for minimal bundle impact
- **Caching**: Initialize clients once and reuse them

---

For more examples and advanced usage patterns, see the [examples](./examples/) directory and [API documentation](./README.md).

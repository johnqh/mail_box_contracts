// Mailer Multi-Chain - Common Code Patterns for AI Development

// 1. UNIFIED CLIENT USAGE PATTERN
// =====================================
// Single client that automatically detects and routes to correct chain

import { OnchainMailerClient, TESTNET_CHAIN_CONFIG } from '../src/unified';

// Works with ANY wallet - automatic detection
const client = new OnchainMailerClient(wallet, TESTNET_CHAIN_CONFIG);
console.log('Detected chain:', client.getChainType()); // 'evm' | 'solana'

// Same methods work on all chains
await client.sendMessage("Subject", "Body", true); // priority message
await client.delegateTo("delegate-address"); // auto-validates address format
await client.claimRevenue(); // chain-specific implementation

// 2. DYNAMIC IMPORT PATTERN
// =====================================
// Load chain-specific modules only when needed

class UnifiedClient {
  private static evmModules: any = null;
  
  private async getEVMModules() {
    if (!UnifiedClient.evmModules) {
      const [ethersModule, evmModule] = await Promise.all([
        import('ethers'),
        import('../evm')
      ]);
      UnifiedClient.evmModules = {
        ethers: ethersModule.ethers,
        MailerClient: evmModule.MailerClient
      };
    }
    return UnifiedClient.evmModules;
  }
}

// 3. ERROR HANDLING PATTERN
// =====================================
// Consistent error handling across chains

async performOperation(): Promise<Result> {
  try {
    // Always add timeout protection
    const result = await Promise.race([
      this.chainSpecificOperation(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timeout')), 10000)
      )
    ]);
    return result;
  } catch (error) {
    // Always check error type
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Provide specific, actionable error messages
    if (errorMessage.includes('insufficient funds')) {
      throw new Error('Insufficient USDC balance for operation');
    }
    if (errorMessage.includes('user rejected')) {
      throw new Error('Transaction rejected by user');
    }
    throw new Error(`${this.chainType} operation failed: ${errorMessage}`);
  }
}

// 4. WALLET DETECTION PATTERN
// =====================================
// Automatic wallet type detection

import { WalletDetector } from '../src/unified';

// Detect wallet type
const chainType = WalletDetector.detectWalletType(wallet);
// Returns: 'evm' | 'solana'

// Validate address formats
const isValidEVM = WalletDetector.isEVMAddress('0x1234...');
const isValidSolana = WalletDetector.isSolanaAddress('9WzDXw...');

// Detect chain from address
const detectedChain = WalletDetector.detectChainFromAddress(address);
// Returns: 'evm' | 'solana' | null

// 5. CONFIGURATION PATTERN
// =====================================
// Extensible multi-chain configuration

interface ChainConfig {
  evm?: {
    rpc: string;
    chainId: number;
    contracts: {
      mailService: string;
      mailer: string;
      usdc: string;
    };
  };
  solana?: {
    rpc: string;
    programs: {
      mailService: string;
      mailer: string;
      mailBoxFactory: string;
    };
    usdcMint: string;
  };
  // Easy to extend for new chains
}

// Pre-configured networks
import { DEFAULT_CHAIN_CONFIG, TESTNET_CHAIN_CONFIG } from '../src/utils';

// Custom configuration
const customConfig = createChainConfig('ethereum', 'mainnet-beta');

// 6. TESTING PATTERN
// =====================================
// Multi-chain test structure

describe('UnifiedClient Feature', () => {
  it('should work with EVM wallet', async () => {
    const evmClient = new OnchainMailerClient(evmWallet, testConfig);
    expect(evmClient.getChainType()).to.equal('evm');
    
    // Test EVM-specific functionality
    const result = await evmClient.sendMessage('Test', 'Body', true);
    expect(result.chainType).to.equal('evm');
    expect(result.gasUsed).to.be.a('bigint'); // EVM-specific field
  });

  it('should work with Solana wallet', async () => {
    const solanaClient = new OnchainMailerClient(solanaWallet, testConfig);
    expect(solanaClient.getChainType()).to.equal('solana');
    
    // Test Solana-specific functionality  
    const result = await solanaClient.sendMessage('Test', 'Body', true);
    expect(result.chainType).to.equal('solana');
    expect(result.slot).to.be.a('number'); // Solana-specific field
  });
});

// 7. DEPLOYMENT PATTERN
// =====================================
// Multi-chain deployment approach

// Deploy to single chain
npx ts-node scripts/evm/deploy.ts --network sepolia
npx ts-node scripts/solana/deploy.ts --network devnet

// Deploy to both chains simultaneously
npx ts-node scripts/unified/deploy-all.ts --evm=sepolia --solana=devnet

// Verify deployments
npx ts-node scripts/unified/verify-deployments.ts

// 8. VALIDATION PATTERN
// =====================================
// Input validation across chains

import { AddressValidator } from '@johnqh/types';

// Validate inputs before operations using @johnqh/types
if (!AddressValidator.isValidEVMAddress(address) && !AddressValidator.isValidSolanaAddress(address)) {
  throw new Error('Invalid address format');
}

// Chain-specific validations
if (chainType === 'evm') {
  if (!AddressValidator.isValidEVMAddress(delegate)) {
    throw new Error('Invalid EVM address format');
  }
}

if (chainType === 'solana') {
  if (!AddressValidator.isValidSolanaAddress(delegate)) {
    throw new Error('Invalid Solana address format');
  }
}

// 9. MODULE STRUCTURE PATTERN
// =====================================
// How to organize new chain support

src/
├── [newchain]/
│   ├── index.ts           # Main exports
│   ├── client.ts          # Chain-specific client
│   ├── types.ts           # Chain-specific types
│   └── utils.ts           # Chain utilities
├── unified/
│   ├── mailbox-client.ts  # Add new chain routing
│   ├── wallet-detector.ts # Add detection logic
│   └── types.ts           # Add to union types
└── utils/
    ├── chain-config.ts    # Add network configs
    └── validation.ts      # Add validation logic

// 10. PERFORMANCE OPTIMIZATION PATTERN
// =====================================
// Optimize for production use

// Connection caching
private static connections: Map<string, any> = new Map();

private getConnection(rpc: string, chainType: 'evm' | 'solana') {
  const key = `${chainType}:${rpc}`;
  if (!this.connections.has(key)) {
    const connection = chainType === 'evm' ? 
      new ethers.JsonRpcProvider(rpc) :
      new Connection(rpc, 'confirmed');
    this.connections.set(key, connection);
  }
  return this.connections.get(key);
}

// Lazy initialization
private _client: ChainClient | null = null;

private async getClient(): Promise<ChainClient> {
  if (!this._client) {
    this._client = await this.initializeChainClient();
  }
  return this._client;
}
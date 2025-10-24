# Multi-Chain Deployment Guide

This project supports deployment to **25+ EVM-compatible networks** including Ethereum mainnet and popular Layer 2 solutions.

## 🚀 Quick Start

### 1. Setup Environment Variables

```bash
# Copy the environment template
cp .env.example .env

# Edit .env with your configuration
# Add your private key and RPC URLs
```

### 2. Fund Your Deployer Account

Ensure your deployer account has native tokens for gas fees on your target network:
- **Ethereum**: ETH
- **Polygon**: MATIC  
- **Arbitrum/Optimism/Base**: ETH
- **Avalanche**: AVAX
- **BSC**: BNB
- **Fantom**: FTM
- etc.

### 3. Deploy to Any Network

```bash
# Examples:
npm run deploy:sepolia          # Ethereum testnet
npm run deploy:polygon          # Polygon mainnet
npm run deploy:base             # Base mainnet
npm run deploy:arbitrum         # Arbitrum mainnet
npm run deploy:optimism         # Optimism mainnet
```

### 4. Verify Contracts (Optional)

```bash
# Get API keys from block explorers first
npm run verify:sepolia          # Verify on Etherscan
npm run verify:polygon          # Verify on PolygonScan
npm run verify:base             # Verify on BaseScan
```

## 🌐 Supported Networks

### Ethereum Networks
- **Mainnet**: `npm run deploy:mainnet`
- **Sepolia**: `npm run deploy:sepolia` 
- **Goerli**: `npm run deploy:goerli`

### Layer 2 & Scaling Solutions
- **Polygon**: `npm run deploy:polygon` / `npm run deploy:mumbai`
- **Optimism**: `npm run deploy:optimism` / `npm run deploy:optimism-goerli`
- **Arbitrum**: `npm run deploy:arbitrum` / `npm run deploy:arbitrum-sepolia`
- **Base**: `npm run deploy:base` / `npm run deploy:base-sepolia`
- **Linea**: `npm run deploy:linea` / `npm run deploy:linea-goerli`
- **Scroll**: `npm run deploy:scroll` / `npm run deploy:scroll-sepolia`
- **zkSync**: `npm run deploy:zksync` / `npm run deploy:zksync-testnet`
- **Mantle**: `npm run deploy:mantle` / `npm run deploy:mantle-testnet`

### Alternative L1s & Sidechains
- **Avalanche**: `npm run deploy:avalanche` / `npm run deploy:fuji`
- **BSC**: `npm run deploy:bsc` / `npm run deploy:bsc-testnet`
- **Fantom**: `npm run deploy:fantom` / `npm run deploy:fantom-testnet`
- **Gnosis**: `npm run deploy:gnosis` / `npm run deploy:chiado`
- **Moonbeam**: `npm run deploy:moonbeam` / `npm run deploy:moonbase-alpha`
- **Celo**: `npm run deploy:celo` / `npm run deploy:alfajores`

### Local Development
- **Hardhat**: `npm run deploy:local`
- **Localhost**: `npm run deploy:localhost`

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Required: Your private key (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# RPC URLs (get free ones from Alchemy, Infura, etc.)
ETHEREUM_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
POLYGON_RPC_URL=https://polygon-rpc.com
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
# ... (see .env.example for all networks)

# Block Explorer API Keys (for contract verification)
# Recommended: Use Etherscan Multichain API Key (V2 API) for all networks
ETHERSCAN_MULTICHAIN_API_KEY=your_multichain_key

# Legacy: Individual API keys (fallback)
ETHERSCAN_API_KEY=your_etherscan_key
POLYGONSCAN_API_KEY=your_polygonscan_key
# ... (see .env.example for all explorers)

# Optional: Custom USDC address override
USDC_ADDRESS=0x...
```

### Network-Specific USDC Addresses

The deployment script automatically uses the correct USDC token address for each network:

| Network | USDC Address |
|---------|-------------|
| Ethereum | `0xA0b86a33E6417a8c8df6D0e9D13A4DcF8C7d6E4b` |
| Polygon | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Optimism | `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Avalanche | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` |

*For testnets, MockUSDC is automatically deployed.*

## 📋 Deployment Process

### What Gets Deployed

1. **MockUSDC** (testnets only) - Test USDC token
2. **Mailer** - Mail sending contract
3. **MailService** - Domain registration and delegation

### Deployment Outputs

After deployment, you'll see:
```
🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!
==================================================
Network: polygon
Chain ID: 137
USDC Token: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
Mailer: 0x1234...abcd
MailService: 0x5678...efgh
==================================================
```

### Deployment Records

Deployment info is automatically saved to `deployments/<network>.json`:
```json
{
  "network": "polygon",
  "chainId": 137,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "deployer": "0x...",
  "contracts": {
    "usdc": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "mailer": "0x1234...abcd",
    "mailService": "0x5678...efgh"
  },
  "fees": {
    "sendFee": "1.0 USDC",
    "registrationFee": "100.0 USDC", 
    "delegationFee": "10.0 USDC"
  }
}
```

## 🔍 Contract Verification

### Block Explorer APIs

Get free API keys from:
- **Etherscan**: https://etherscan.io/apis
- **PolygonScan**: https://polygonscan.com/apis  
- **Arbiscan**: https://arbiscan.io/apis
- **BaseScan**: https://basescan.org/apis
- **SnowTrace** (Avalanche): https://snowtrace.io/apis

### Verification Commands

```bash
# Verify contracts after deployment
npm run verify:mainnet
npm run verify:polygon  
npm run verify:arbitrum
npm run verify:base
# ... etc for all networks
```

### Manual Verification

If automated verification fails:
```bash
npx hardhat verify --network polygon 0x1234...abcd "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" "0xOwnerAddress"
```

## 🛠️ Advanced Usage

### Custom RPC URLs

Override default RPC URLs via environment variables:
```bash
POLYGON_RPC_URL=https://your-custom-rpc.com npm run deploy:polygon
```

### Custom Gas Settings

Set custom gas prices in your network config or via environment:
```bash
GAS_PRICE_POLYGON=30000000000 npm run deploy:polygon
```

### Deploy to Custom Networks

Add new networks to `hardhat.config.ts`:
```typescript
networks: {
  myCustomNetwork: {
    url: process.env.CUSTOM_RPC_URL,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    chainId: 12345,
  }
}
```

## 🚨 Security Best Practices

1. **Never commit private keys** - Use environment variables
2. **Use hardware wallets** for mainnet deployments when possible  
3. **Test on testnets first** before mainnet deployment
4. **Verify contracts** on block explorers for transparency
5. **Use multi-sig wallets** for contract ownership on mainnet
6. **Store environment variables securely** (GitHub Secrets, etc.)

## 📊 Gas Usage Estimates

Approximate deployment costs (varies by network congestion):

| Network | Total Gas | Cost (USD)* |
|---------|-----------|-------------|
| Ethereum | ~2.4M gas | $30-120 |
| Polygon | ~2.4M gas | $0.05-0.20 |
| Arbitrum | ~2.4M gas | $1-5 |
| Optimism | ~2.4M gas | $1-5 |
| Base | ~2.4M gas | $1-5 |
| Avalanche | ~2.4M gas | $1-10 |
| BSC | ~2.4M gas | $0.50-2 |

*Estimates based on typical gas prices. Actual costs may vary.*

## 🆘 Troubleshooting

### Common Issues

**"Insufficient funds for gas"**
- Fund your deployer account with native tokens

**"Invalid API key"**
- Check your block explorer API key in `.env`

**"Network connection error"**  
- Verify your RPC URL is correct and accessible

**"Contract already exists"**
- Previous deployment succeeded; check `deployments/` folder

### Debug Mode

Enable verbose logging:
```bash
DEBUG=* npm run deploy:sepolia
```

### Support

For deployment issues:
1. Check network status pages
2. Verify account balances  
3. Test with testnets first
4. Review deployment logs in `deployments/` folder

## 🎯 Next Steps After Deployment

1. **Verify contracts** on block explorers
2. **Test functionality** using the deployed addresses
3. **Set up monitoring** for your contracts
4. **Configure frontend** to use deployed addresses
5. **Fund contracts** with USDC if needed for testing
6. **Set up ownership transfer** to multi-sig if needed

---

*This deployment system supports 25+ EVM networks with automatic USDC detection, comprehensive verification, and detailed deployment tracking.*
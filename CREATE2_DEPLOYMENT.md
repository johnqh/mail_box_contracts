# 🌐 Cross-Chain Deterministic Deployment with CREATE2

This document explains how to deploy MailBox contracts with identical addresses across all EVM chains using CREATE2.

## 🎯 Overview

Traditional contract deployment results in different addresses on different chains because addresses depend on the deployer's nonce. Our CREATE2 implementation ensures **identical contract addresses** across all EVM chains.

## ✨ Benefits

- **🔄 Identical Addresses**: Same contract addresses on Ethereum, Polygon, Arbitrum, Base, etc.
- **🔮 Predictable**: Know exact addresses before deployment
- **⚡ Efficient**: Batch deploy multiple contracts in single transaction
- **📦 Version Control**: Built-in versioning system for upgrades
- **🛡️ Deterministic**: Reproducible deployments across teams

## 🏗️ Architecture

### MailBoxFactory Contract

The `MailBoxFactory` uses CREATE2 to deploy:
- **Mailer**: Message sending with revenue sharing
- **MailService**: Domain registration and delegation

### Key Components

1. **Salt Generation**: Deterministic based on project name, version, and contract type
2. **Address Prediction**: Calculate addresses before deployment
3. **Deployment Verification**: Ensure addresses match predictions
4. **Batch Operations**: Deploy multiple contracts efficiently

## 📋 Quick Start

### 1. Install Dependencies

```bash
npm install
npm run compile
```

### 2. Predict Addresses

See what addresses will be deployed across all networks:

```bash
npx hardhat run scripts/predict-addresses.ts
```

Example output:
```
🌐 PREDICTED ADDRESSES BY NETWORK:
Network     Chain ID  Mailer                                      MailService
mainnet     1         0x1234567890AbCdEf1234567890AbCdEf12345678  0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
polygon     137       0x1234567890AbCdEf1234567890AbCdEf12345678  0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
arbitrum    42161     0x1234567890AbCdEf1234567890AbCdEf12345678  0xAbCdEf1234567890AbCdEf1234567890AbCdEf12
```

### 3. Deploy Contracts

Deploy to any EVM network with consistent addresses:

```bash
# Deploy to Polygon
OWNER_ADDRESS=0x123... npx hardhat run scripts/deploy-create2.ts --network polygon

# Deploy to Arbitrum (same addresses as Polygon!)
OWNER_ADDRESS=0x123... npx hardhat run scripts/deploy-create2.ts --network arbitrum
```

## 🌍 Supported Networks

### Mainnets
- **Ethereum** (Chain ID: 1)
- **Polygon** (Chain ID: 137)
- **Optimism** (Chain ID: 10)
- **Arbitrum** (Chain ID: 42161)
- **Base** (Chain ID: 8453)
- **Avalanche** (Chain ID: 43114)
- **BSC** (Chain ID: 56)
- **Gnosis** (Chain ID: 100)
- **Celo** (Chain ID: 42220)

### Testnets
- **Sepolia** (Chain ID: 11155111)
- **Base Sepolia** (Chain ID: 84532)
- **Scroll Sepolia** (Chain ID: 534351)

### Local Development
- **Hardhat** (Chain ID: 31337)
- **Localhost** (Chain ID: 1337)

## 🔧 Detailed Usage

### Environment Variables

```bash
# Required for mainnet deployments
OWNER_ADDRESS=0x123...  # Contract owner address

# Optional for testnets (will deploy MockUSDC if not provided)
USDC_ADDRESS=0x456...   # USDC token address
```

### Network Configuration

Add networks to your `hardhat.config.ts`:

```typescript
networks: {
  polygon: {
    url: "https://polygon-rpc.com",
    accounts: [process.env.PRIVATE_KEY]
  },
  arbitrum: {
    url: "https://arbitrum.io/rpc",
    accounts: [process.env.PRIVATE_KEY]
  }
}
```

### Advanced Usage

#### Custom Salt Generation

```bash
# Use custom project parameters
PROJECT_NAME="MailBox" VERSION="v2.0.0" npx hardhat run scripts/deploy-create2.ts --network mainnet
```

#### Address Prediction for Specific Network

```typescript
// In your scripts
const factory = await ethers.getContractAt("MailBoxFactory", factoryAddress);
const predictedAddress = await factory.predictMailerAddress(
  usdcToken,
  owner,
  salt,
  factoryAddress
);
```

#### Batch Deployment

```typescript
// Deploy both contracts in single transaction
const tx = await factory.deployBoth(
  usdcToken,
  owner,
  mailerSalt,
  mailServiceSalt
);
```

## 📊 Gas Costs

| Operation | Estimated Gas | Network |
|-----------|--------------|---------|
| Deploy Factory | ~2,000,000 | Any |
| Deploy Mailer | ~1,500,000 | Any |
| Deploy MailService | ~1,800,000 | Any |
| Deploy Both | ~3,200,000 | Any |

*Note: Actual costs vary by network and gas prices*

## 🔍 Verification

### Verify Deployment

After deployment, verify contracts are identical:

```bash
# Check contract addresses
npx hardhat run scripts/predict-addresses.ts

# Verify on Etherscan/Polygonscan
npx hardhat verify --network mainnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### Testing

Run comprehensive tests including factory functionality:

```bash
npm test                    # Run all tests
npm test MailBoxFactory     # Run factory-specific tests
```

## 🚨 Important Considerations

### Deployer Account

- **Same deployer** must be used across all networks for identical factory addresses
- **Fresh account** recommended for maximum consistency
- **Sufficient ETH** required on all target networks

### USDC Token Addresses

Each network has different USDC token addresses:
- Contracts will have **same addresses** but **different USDC dependencies**
- This is expected and correct behavior
- Factory automatically handles network-specific USDC addresses

### Version Management

- Changing version in salt will result in **different addresses**
- Use consistent version across all networks for a deployment cycle
- Plan version upgrades carefully to maintain address consistency

## 🐛 Troubleshooting

### Common Issues

**Different Factory Addresses**:
```bash
# Ensure same deployer account on all networks
# Check deployer nonce is consistent
```

**Deployment Failures**:
```bash
# Check deployer has sufficient ETH balance
# Verify USDC token address is correct for network
# Ensure contracts aren't already deployed
```

**Address Prediction Mismatches**:
```bash
# Verify same salt is used
# Check factory address is identical
# Confirm USDC and owner addresses match
```

### Debug Commands

```bash
# Check deployer nonce
npx hardhat console --network <network>
# > await ethers.getSigners().then(s => s[0].provider.getTransactionCount(s[0].address))

# Verify contract code
npx hardhat run scripts/verify-deployment.ts --network <network>

# Re-predict with debug info
DEBUG=true npx hardhat run scripts/predict-addresses.ts
```

## 🔗 Related Files

- `contracts/MailBoxFactory.sol` - Factory contract implementation
- `scripts/deploy-create2.ts` - Main deployment script
- `scripts/predict-addresses.ts` - Address prediction utility
- `test/MailBoxFactory.test.ts` - Comprehensive factory tests

## 📞 Support

For deployment issues or questions:

1. Check this documentation
2. Run prediction script to verify expected addresses
3. Review deployment logs for error details
4. Test on localhost/testnet first

---

**🎉 Happy Cross-Chain Deploying!**
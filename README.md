# MailBox Contracts - Decentralized Messaging System

A comprehensive Solidity-based decentralized email/messaging system with USDC fee integration, domain registration, and revenue sharing capabilities.

## 🏗️ Project Overview

**MailBox Contracts** enables decentralized messaging with built-in economic incentives through a two-tier fee system and revenue sharing mechanism.

### Core Features

- **Domain Registration**: Register and manage email domains with USDC fees
- **Delegation System**: Delegate email handling with rejection capability  
- **Two-Tier Messaging**: Priority (revenue share) vs Standard (fee-only) tiers
- **Revenue Sharing**: 90% back to senders, 10% to platform
- **Time-based Claims**: 60-day claim period for revenue shares

## 📦 NPM Package Installation

```bash
# Install the TypeScript client library
npm install mail_box_contracts

# Or with yarn
yarn add mail_box_contracts
```

### Quick Start

```typescript
import { MailBox__factory, MailService__factory } from 'mail_box_contracts';
import { ethers } from 'ethers';

// Connect to contracts
const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

// Initialize contracts
const mailer = MailBox__factory.connect('CONTRACT_ADDRESS', signer);
const mailService = MailService__factory.connect('CONTRACT_ADDRESS', signer);

// Send a priority message with revenue sharing
await mailer.sendPriority("Hello Web3!", "This is a decentralized message");

// Register a domain
await mailService.registerDomain("example.mailbox", false);

// Claim revenue share
await mailer.claimRecipientShare();
```

### TypeScript Support

Full TypeScript support with auto-generated contract types:

```typescript
import type { 
  MailBox, 
  MailService, 
  MockUSDC 
} from 'mail_box_contracts/typechain-types';

// Fully typed contract interactions
const tx: ContractTransaction = await mailer.sendPriority(subject, body);
const receipt: ContractReceipt = await tx.wait();
```

## 📁 Project Structure

```
mail_box_contracts/
├── contracts/              # Smart contracts
│   ├── MailService.sol    # Domain registration & delegation
│   ├── Mailer.sol         # Messaging with revenue sharing
│   └── MockUSDC.sol       # Test USDC token
├── test/                  # Comprehensive test suites
│   ├── MailService.test.ts # 27 tests for MailService
│   └── Mailer.test.ts     # 54 tests for Mailer
├── src/                   # TypeScript client wrappers
├── scripts/               # Deployment scripts
├── typechain-types/       # Auto-generated TypeScript types
└── CLAUDE.md              # AI assistant documentation
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn

### Installation

```bash
# Clone and install dependencies
npm install

# Compile contracts and generate types
npm run compile

# Run comprehensive test suite (81 tests)
npm test

# Deploy to local network
npm run deploy:local
```

## 📋 Smart Contracts

### MailService Contract

**Purpose**: Domain registration and delegation management

**Key Functions**:
- `delegateTo(address)` - Delegate email handling (10 USDC fee)
- `rejectDelegation(address)` - Reject unwanted delegations
- `registerDomain(string, bool)` - Register domains (100 USDC fee)
- `setRegistrationFee(uint256)` - Owner fee management

**Fees**:
- Domain Registration: 100 USDC
- Delegation: 10 USDC

### Mailer Contract

**Purpose**: Message sending with revenue sharing

**Message Types**:
- **Priority Messages**: Full fee (0.1 USDC) + 90% revenue share
  - `sendPriority(subject, body)`
  - `sendPriorityPrepared(mailId)`
- **Standard Messages**: 10% fee only (0.01 USDC)
  - `send(subject, body)`
  - `sendPrepared(mailId)`

**Revenue Model**:
- Senders pay fees to send messages to themselves
- Priority senders get 90% back as claimable revenue
- 60-day claim period for revenue shares
- Expired shares go to contract owner

## 🧪 Testing

Comprehensive test coverage with 81 passing tests:

```bash
# Run all tests
npm test

# Test categories:
# ✅ MailService (27 tests) - Delegation, domain registration, fees
# ✅ Mailer (54 tests) - Messaging, revenue sharing, claims
```

### Test Highlights
- Fee calculation verification
- Event emission testing
- Revenue sharing mechanics
- Time-based claim expiration
- Error condition handling
- Edge cases and security

## 🔧 Development Commands

```bash
# Essential commands
npm run compile    # Compile contracts + generate TypeScript types
npm test          # Run all 81 tests
npm run build     # Build TypeScript files

# Development
npx hardhat node      # Start local blockchain
npm run deploy:local  # Deploy to local network
npm run clean        # Clean artifacts
```

## 📊 Architecture

### Revenue Sharing Flow
1. **Priority Message**: User pays 0.1 USDC
2. **Revenue Split**: 90% claimable by sender, 10% to owner
3. **Claim Period**: 60 days to claim revenue share
4. **Expiration**: Unclaimed shares go to contract owner

### Delegation System
1. **Delegate**: Pay 10 USDC to delegate email handling
2. **Reject**: Delegates can reject unwanted delegations
3. **Clear**: Set delegate to address(0) to clear

## 🛠️ TypeScript Integration

Full TypeScript support with auto-generated types:

```typescript
import { MailService, Mailer } from "./typechain-types";

// Type-safe contract interactions
const mailService = MailService__factory.connect(address, signer);
await mailService.delegateTo(delegateAddress);

const mailer = Mailer__factory.connect(address, signer);
await mailer.sendPriority("Subject", "Body");
```

## 🔐 Security Features

- **Owner-only functions** protected by `onlyOwner` modifier
- **USDC transfer validation** - operations only proceed if payment succeeds
- **Time-based expiration** for revenue claims
- **Address validation** for delegation rejection
- **Comprehensive error handling** with custom errors

## 📖 Documentation

For AI assistants and detailed technical documentation, see:
- [`CLAUDE.md`](./CLAUDE.md) - Comprehensive AI assistant guide
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) - Deployment instructions

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Add comprehensive tests for new functionality
4. Ensure all 81 tests pass: `npm test`
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with**: Hardhat, TypeScript, Solidity ^0.8.24, Ethers v6
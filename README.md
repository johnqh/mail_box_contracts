# Multi-Chain Decentralized Messaging Contracts

[![Version](https://img.shields.io/npm/v/@johnqh/mail_box_contracts)](https://www.npmjs.com/package/@johnqh/mail_box_contracts)
[![Tests](https://img.shields.io/badge/tests-116%20passing-green)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](#typescript-support)
[![Multi-Chain](https://img.shields.io/badge/chains-EVM%20%7C%20Solana-purple)](#supported-chains)

A comprehensive multi-chain decentralized messaging system supporting both **EVM chains** and **Solana** with USDC fee integration, delegation management, and revenue sharing capabilities.

> **🤖 AI-Optimized**: This project includes comprehensive documentation, patterns, and tooling specifically designed for AI-assisted development. See [`AI_ASSISTANT_QUICKSTART.md`](./AI_ASSISTANT_QUICKSTART.md) and [`CLAUDE.md`](./CLAUDE.md) for AI development guides.

## 🏗️ Project Overview

This messaging system enables decentralized communication with built-in economic incentives through a two-tier fee system and revenue sharing mechanism. The system automatically detects your wallet type and routes to the appropriate blockchain implementation.

### 🌟 Core Features

- **🔗 Multi-Chain Support**: Works seamlessly on EVM chains (Ethereum, Polygon, etc.) and Solana
- **🤖 Automatic Chain Detection**: Detects wallet type and routes to appropriate implementation
- **👥 Delegation System**: Delegate message handling with rejection capability  
- **📧 Two-Tier Messaging**: Priority (revenue share) vs Standard (fee-only) tiers
- **💰 Revenue Sharing**: 90% back to senders, 10% to platform
- **⏰ Time-based Claims**: 60-day claim period for revenue shares
- **🛡️ Type-Safe**: Full TypeScript support across all chains

## 📦 NPM Package Installation

```bash
# Install the unified multi-chain TypeScript client library
npm install @johnqh/mail_box_contracts

# Or with yarn
yarn add @johnqh/mail_box_contracts
```

## 🚀 Quick Start - Unified Multi-Chain Client

```typescript
import { OnchainMailerClient, TESTNET_CHAIN_CONFIG } from '@johnqh/mail_box_contracts';

// Works with ANY wallet - automatically detects chain!
const client = new OnchainMailerClient(wallet, TESTNET_CHAIN_CONFIG);

// Same API works for both EVM and Solana
await client.sendMessage("Hello Multi-Chain!", "This works on any blockchain!", true);
await client.delegateTo("delegate-address"); // Format automatically validated
await client.claimRevenue(); // Chain-agnostic revenue claiming

console.log('Running on:', client.getChainType()); // 'evm' or 'solana'
```

## 🔧 Chain-Specific Usage

### EVM Chains (Ethereum, Polygon, Arbitrum, etc.)

```typescript
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';
import { ethers } from 'ethers';

// The unified client automatically detects EVM wallets
const wallet = {
  address: "0x...",
  request: async () => {},
  signTransaction: async (tx: any) => tx
};

const client = new OnchainMailerClient(wallet, EVM_CHAIN_CONFIG);

// Send priority message with revenue sharing
await client.sendMessage("Hello EVM!", "Decentralized message", true);

// Delegate to another address
await client.delegateTo("0x...");

// Claim revenue share
await client.claimRevenue();
```

### Solana

```typescript
import { OnchainMailerClient } from '@johnqh/mail_box_contracts';
import { Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';

// The unified client automatically detects Solana wallets
const keypair = Keypair.generate();
const wallet = new Wallet(keypair);

const client = new OnchainMailerClient(wallet, SOLANA_CHAIN_CONFIG);

// Send priority message with revenue sharing
await client.sendMessage("Hello Solana!", "Decentralized message", true);

// Delegate to another address
await client.delegateTo("...");

// Claim revenue share
await client.claimRevenue();
```

### TypeScript Support

Full TypeScript support with auto-generated contract types:

```typescript
import type { 
  Mailer, 
  MockUSDC 
} from 'mail_box_contracts/typechain-types';

// Fully typed contract interactions
const tx: ContractTransaction = await mailer.sendPriority(to, subject, body);
const receipt: ContractReceipt = await tx.wait();
```

## 📁 Project Structure

```
mail_box_contracts/
├── contracts/              # EVM smart contracts (Solidity)
│   ├── MailService.sol    # EVM delegation management
│   ├── Mailer.sol         # EVM messaging with revenue sharing
│   └── MockUSDC.sol       # Test USDC token
├── programs/               # Solana programs (Rust)
│   └── mailer/           # Solana messaging and delegation program
├── src/                   # Multi-chain TypeScript clients
│   ├── evm/              # EVM-specific clients
│   ├── solana/           # Solana-specific clients
│   ├── unified/          # Cross-chain unified client
│   └── utils/            # Shared utilities & validation
├── test/                  # Comprehensive test suites (116 tests)
│   ├── evm/              # EVM contract tests (75 tests)
│   ├── solana/           # Solana program tests
│   └── unified/          # Cross-chain client tests (41 tests)
├── typechain-types/       # Auto-generated TypeScript types
├── examples/              # Complete usage examples
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

# Run comprehensive test suite (116 tests)
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

Comprehensive test coverage with 116 passing tests:

```bash
# Run all tests
npm test

# Test categories:
# ✅ EVM Tests (75 tests) - Contract functionality, fees, revenue sharing
# ✅ Unified Tests (41 tests) - Cross-chain client, validation, wallet detection
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
# Essential commands (run these frequently!)
npm run compile    # Compile contracts + generate TypeScript types
npm test          # Run all 116 tests (75 EVM + 41 Unified)
npm run build     # Build TypeScript files

# AI-Optimized commands
npm run ai:dev     # Show AI helper commands + status
npm run ai:status  # Quick project health check
npm run ai:build   # Clean build everything
npm run ai:test    # Run comprehensive test suite (116 tests)  
npm run ai:check   # TypeScript + ESLint validation

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
import { OnchainMailerClient } from "@johnqh/mail_box_contracts";

// Type-safe contract interactions using unified client
const client = new OnchainMailerClient(wallet, chainConfig);
await client.delegateTo(delegateAddress);
await client.sendMessage("Subject", "Body", true); // priority message
await client.claimRevenue();
```

## 🔐 Security Features

- **Owner-only functions** protected by `onlyOwner` modifier
- **USDC transfer validation** - operations only proceed if payment succeeds
- **Time-based expiration** for revenue claims
- **Address validation** for delegation rejection
- **Comprehensive error handling** with custom errors

## 🤖 AI-Assisted Development

This project is optimized for AI-assisted development with comprehensive documentation, patterns, and tooling:

### Quick Start for AI Assistants
1. **Read**: [`AI_ASSISTANT_QUICKSTART.md`](./AI_ASSISTANT_QUICKSTART.md) - Essential guide for AI development
2. **Reference**: [`CLAUDE.md`](./CLAUDE.md) - Comprehensive AI assistant documentation
3. **Patterns**: [`docs/AI_DEVELOPMENT_PATTERNS.md`](./docs/AI_DEVELOPMENT_PATTERNS.md) - Development patterns and examples
4. **Config**: [`.ai-config.json`](./.ai-config.json) - AI tool configuration

### AI Development Features
- **🔧 AI Commands**: `npm run ai:dev` for AI-optimized development workflows
- **📊 Test Coverage**: 116 tests with detailed patterns for AI reference
- **📝 Rich Documentation**: Comprehensive JSDoc comments and inline examples
- **🎯 Success Metrics**: Clear validation criteria and checklists
- **⚡ Quick Validation**: `npm run ai:check` for TypeScript + ESLint
- **🔍 Project Status**: `npm run ai:status` for health check

### Documentation Structure
- **Primary Guide**: [`CLAUDE.md`](./CLAUDE.md) - Main AI assistant documentation
- **Quick Reference**: [`AI_ASSISTANT_QUICKSTART.md`](./AI_ASSISTANT_QUICKSTART.md) - Fast setup
- **Development Patterns**: [`docs/AI_DEVELOPMENT_PATTERNS.md`](./docs/AI_DEVELOPMENT_PATTERNS.md) - Code examples
- **Examples**: [`examples/`](./examples/) - Working code samples

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Add comprehensive tests for new functionality
4. Ensure all 116 tests pass: `npm test`
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Built with**: Hardhat, TypeScript, Solidity ^0.8.24, Ethers v6
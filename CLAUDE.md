# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Compile contracts and generate TypeScript types
npm run compile

# Run all tests
npm test

# Build TypeScript files
npm run build

# Deploy to local Hardhat network
npm run deploy:local

# Clean compiled artifacts
npm run clean

# Start local Hardhat node (for testing)
npx hardhat node
```

## Project Architecture

This is a Hardhat-based Solidity project with TypeScript wrapper functionality. The codebase follows a layered architecture:

### Core Components

- **Smart Contract Layer**: `contracts/MailBox.sol` - Simple contract with a single `getName()` pure function
- **TypeScript Client Layer**: `src/mailbox-client.ts` - `MailBoxClient` class that wraps contract interactions
- **Generated Types**: `typechain-types/` - Auto-generated TypeScript types from Solidity contracts via Hardhat Toolbox

### Key Architecture Patterns

- **Factory Pattern**: Uses TypeChain-generated factories (`MailBox__factory`) for contract deployment and connection
- **Client Wrapper Pattern**: `MailBoxClient` provides both static deployment method and instance-based contract interaction
- **Hardhat Integration**: Full integration with Hardhat for compilation, testing, and deployment

### Development Workflow

1. Contract changes require running `npm run compile` to regenerate TypeScript types
2. The `typechain-types/` directory is auto-generated and should not be manually edited
3. Tests use Hardhat's built-in test environment with Chai assertions
4. Client wrapper provides abstraction over raw contract calls

### File Structure Notes

- `src/index.ts` only exports TypeChain-generated types, not the client wrapper
- Client wrapper is in separate file (`mailbox-client.ts`) for modularity
- Deploy script demonstrates basic contract deployment pattern used throughout the project
- TypeScript compilation outputs to `dist/` directory

### Network Configuration

- Default local network uses chainId 1337
- Hardhat network is configured for local development and testing
- Contract deployment uses standard Hardhat deployment patterns
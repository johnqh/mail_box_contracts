# MailBox Smart Contract Project

A Solidity smart contract project with TypeScript wrapper for the MailBox contract.

## Project Structure

```
mail_box_contracts/
├── contracts/          # Solidity contracts
│   └── MailBox.sol     # Main MailBox contract
├── scripts/            # Deployment scripts
│   └── deploy.ts       # Deployment script
├── test/              # Test files
│   └── MailBox.test.ts # Contract tests
├── src/               # TypeScript wrapper
│   ├── index.ts       # Main exports
│   └── mailbox-client.ts # Client wrapper
├── typechain-types/   # Generated TypeScript types
├── hardhat.config.ts  # Hardhat configuration
└── package.json       # Project dependencies
```

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Compile the contracts:**
   ```bash
   npm run compile
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

4. **Deploy to local network:**
   ```bash
   npm run deploy:local
   ```

## Contract Details

### MailBox Contract

The `MailBox` contract contains:
- `getName()`: A pure function that returns "0xmail.box" as a string

### TypeScript Client

The project includes a TypeScript client (`MailBoxClient`) that provides:

- **Static deployment method:**
  ```typescript
  const client = await MailBoxClient.deploy(signer);
  ```

- **Connection to existing contract:**
  ```typescript
  const client = new MailBoxClient(contractAddress, provider);
  ```

- **Get contract name:**
  ```typescript
  const name = await client.getName(); // Returns "0xmail.box"
  ```

## Usage Example

```typescript
import { ethers } from "ethers";
import { MailBoxClient } from "./src/mailbox-client";

// Connect to provider
const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const signer = new ethers.Wallet("your-private-key", provider);

// Deploy new contract
const client = await MailBoxClient.deploy(signer);
console.log("Contract deployed at:", await client.getAddress());

// Call getName function
const name = await client.getName();
console.log("Contract name:", name); // "0xmail.box"
```

## Available Scripts

- `npm run compile` - Compile Solidity contracts and generate TypeScript types
- `npm run test` - Run contract tests
- `npm run deploy:local` - Deploy to local Hardhat network
- `npm run build` - Build TypeScript files
- `npm run clean` - Clean compiled artifacts

## Development

1. Start local Hardhat node:
   ```bash
   npx hardhat node
   ```

2. Deploy to local network:
   ```bash
   npm run deploy:local
   ```

3. The contract will be deployed and you'll see the address and initial function call result.

## Testing

The project includes comprehensive tests for the MailBox contract:
- Verifies `getName()` returns "0xmail.box"
- Confirms the function is pure (returns consistent results)

Run tests with:
```bash
npm test
```
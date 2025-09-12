# MailBox Contracts - Usage Examples

This directory contains comprehensive examples demonstrating how to use the MailBox decentralized messaging system.

## 🚀 Quick Start

### Prerequisites

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Start local Hardhat node (in separate terminal)
npx hardhat node

# Deploy contracts locally
npm run deploy:local
```

### Running Examples

```bash
# Run basic usage examples
npx ts-node examples/basic-usage.ts

# Or use the built version
npm run build
node dist/examples/basic-usage.js
```

## 📚 Available Examples

### `basic-usage.ts`

Comprehensive examples covering all major functionality:

**1. Contract Deployment**
- Deploy MockUSDC for testing
- Deploy Mailer contract (includes delegation functionality)
- Initialize MailerClient instance

**2. Account Setup**
- Fund accounts with test USDC
- Approve contract spending
- Check balances

**3. Domain Management**
- Register new domains
- Extend existing domains
- Check registration fees

**4. Delegation System**
- Delegate email handling to another address
- Reject unwanted delegations
- Clear existing delegations

**5. Messaging System**
- Send priority messages (with revenue sharing)
- Send standard messages (fee-only)
- Use prepared message IDs

**6. Revenue Claiming**
- Claim 90% revenue share from priority messages
- Owner claims accumulated fees
- Handle expired claims

**7. Advanced Patterns**
- Event listening for real-time updates
- Error handling best practices
- Batch operations
- Connecting to existing contracts

## 🎯 Example Usage Patterns

### Basic Message Sending

```typescript
import { MailerClient } from "../src/mailer-client";
import { ethers } from "ethers";

// Connect to contract
const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const mailer = new MailerClient("CONTRACT_ADDRESS", provider);

// Send priority message (with revenue sharing)
const signer = new ethers.Wallet("PRIVATE_KEY", provider);
await mailer.connect(signer).sendPriority("Subject", "Message body");

// Claim your 90% revenue share
await mailer.claimRecipientShare();
```

### Domain Registration and Delegation

```typescript
import { MailerClient } from "../src/evm/mailer-client";

const mailer = new MailerClient("CONTRACT_ADDRESS", provider);

// Delegate to another address (costs 10 USDC by default)
// MailerClient includes delegation functionality
await mailer.delegateTo("0x123...", walletClient, account);
```

### Individual Client Usage

```typescript
import { MailerClient } from "../src/evm/mailer-client";

// Deploy MailerClient (includes both messaging and delegation functionality)
const mailerClient = await MailerClient.deploy(
  walletClient,
  publicClient,
  account,
  "USDC_ADDRESS", 
  "OWNER_ADDRESS"
);

// Use MailerClient for both messaging and delegation
await mailerClient.sendPriority("0xRecipient", "Subject", "Body", walletClient, account);
await mailerClient.delegateTo("0xDelegate", walletClient, account);
```

## 💡 Key Concepts for Examples

### Revenue Sharing Model

```typescript
// Priority message: Pay 0.1 USDC, get 0.09 USDC back (claimable within 60 days)
await mailer.sendPriority("Subject", "Body");  // Costs 0.1 USDC
await mailer.claimRecipientShare();            // Get 0.09 USDC back

// Standard message: Pay 0.01 USDC, no revenue share
await mailer.send("Subject", "Body");          // Costs 0.01 USDC only
```

### Self-Messaging System

**Important**: All messages are sent TO the sender's own address. This is a self-messaging system for personal message storage with economic incentives.

```typescript
// When addr1 sends a message, the event shows:
// MailSent(from: addr1, to: addr1, subject: "...", body: "...")
```

### Fee Structure

| Operation | Cost | Notes |
|-----------|------|-------|
| Domain Registration | 100 USDC | 1-year registration |
| Delegation | 10 USDC | Can be cleared for free |
| Priority Message | 0.1 USDC | 90% revenue share |
| Standard Message | 0.01 USDC | No revenue share |

### Time-Based Claims

```typescript
// Priority messages create claimable revenue
const claimInfo = await mailer.getRecipientClaimable(address);
console.log("Amount:", claimInfo.amount);     // Claimable amount
console.log("Expires:", claimInfo.expiresAt); // 60 days from first message
console.log("Expired:", claimInfo.isExpired); // Whether claim period ended
```

## 🔧 Development Tips

### Testing with MockUSDC

```typescript
// Always use MockUSDC for testing
const mockUSDC = await MockUSDC__factory.connect(address, signer);

// Fund test accounts
await mockUSDC.mint(testAddress, ethers.parseUnits("1000", 6));

// Approve contract spending
await mockUSDC.approve(contractAddress, ethers.parseUnits("100", 6));
```

### Error Handling

```typescript
try {
  await mailer.sendPriority("Subject", "Body");
} catch (error) {
  if (error.reason === "FeePaymentRequired") {
    console.log("Need to fund account or approve USDC spending");
  }
}
```

### Event Monitoring

```typescript
// Listen for messages
mailer.getContract().on("MailSent", (from, to, subject, body) => {
  console.log(`New message from ${from}: ${subject}`);
});

// Listen for delegations (MailerClient handles delegation now)
mailerClient.getContract().on("DelegationSet", (delegator, delegate) => {
  console.log(`${delegator} delegated to ${delegate}`);
});
```

## 📊 Example Output

When you run `basic-usage.ts`, you'll see output like:

```
🚀 MailBox Contracts - Basic Usage Examples
Signer address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

📦 Example 1: Deploying Contracts
MockUSDC deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Mailer deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
MailerClient deployed at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0

💰 Example 2: Account Setup and Funding
USDC balance: 1000.0 USDC
Approved contracts to spend 500 USDC each

🌐 Example 3: Domain Registration
Registration fee: 100.0 USDC
✅ Registered domain 'example.mailbox'
✅ Extended domain 'example.mailbox'

👥 Example 4: Delegation System
Delegate address: 0x...
Delegation fee: 10.0 USDC
✅ Delegated email handling to 0x...
✅ Delegate rejected the delegation

📧 Example 5: Messaging System
Base send fee: 0.1 USDC
✅ Priority message sent
Claimable amount: 0.09 USDC
✅ Standard message sent

💰 Example 6: Revenue Claiming
✅ Claimed recipient revenue share
USDC balance after claim: 899.09 USDC
✅ Owner claimed their share

🎉 All examples completed successfully!
```

## 🎯 Next Steps

1. **Run the Examples**: Start with `basic-usage.ts` to understand core functionality
2. **Modify Parameters**: Change addresses, amounts, and messages to see how the system responds  
3. **Build Your App**: Use these patterns as building blocks for your own application
4. **Test Edge Cases**: Try error scenarios like insufficient balances or invalid addresses
5. **Monitor Events**: Set up event listeners to build reactive applications

For more detailed technical information, see:
- [`../CLAUDE.md`](../CLAUDE.md) - AI assistant development guide
- [`../AI_DEVELOPMENT_GUIDE.md`](../AI_DEVELOPMENT_GUIDE.md) - Comprehensive development patterns
- [`../README.md`](../README.md) - Project overview and setup instructions
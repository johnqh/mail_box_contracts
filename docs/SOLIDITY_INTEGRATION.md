# Solidity Integration Guide

This guide shows how to integrate Mailer messaging functionality into your Solidity smart contracts.

## Installation

Install the package in your Hardhat or Foundry project:

```bash
npm install @sudobility/contracts
```

## Quick Start

### 1. Import the Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@sudobility/contracts/contracts/interfaces/IMailer.sol";
import "@sudobility/contracts/contracts/interfaces/IERC20.sol";

contract MyContract {
    IMailer public mailer;
    IERC20 public usdcToken;

    constructor(address _mailerAddress, address _usdcAddress) {
        mailer = IMailer(_mailerAddress);
        usdcToken = IERC20(_usdcAddress);
    }

    function sendNotification(address recipient, string memory message) external {
        mailer.send(
            recipient,
            "Notification",
            message,
            msg.sender,  // payer
            false,       // no revenue share
            true         // resolve to name
        );
    }
}
```

### 2. Approve USDC Spending

Before sending messages, approve the Mailer contract to spend USDC:

```solidity
function approveMailer(uint256 amount) external {
    usdcToken.approve(address(mailer), amount);
}
```

### 3. Send Messages

```solidity
// Standard message (0.01 USDC fee)
mailer.send(recipient, "Subject", "Body", msg.sender, false, true);

// Priority message with revenue sharing (0.1 USDC fee, 90% claimable by recipient)
mailer.send(recipient, "Subject", "Body", msg.sender, true, true);
```

## Available Functions

The `IMailer` interface provides 5 messaging functions:

### 1. send()

Send a message to a wallet address with full subject and body.

```solidity
function send(
    address to,              // Recipient wallet address
    string calldata subject, // Message subject
    string calldata body,    // Message body
    address payer,           // Who pays the USDC fee
    bool revenueShareToReceiver,  // true = 0.1 USDC with 90% claimable, false = 0.01 USDC
    bool resolveSenderToName      // Resolve sender to name via off-chain service
) external;
```

**Example:**

```solidity
mailer.send(
    userAddress,
    "Welcome!",
    "Thanks for joining our platform",
    msg.sender,
    false,  // Standard fee
    true    // Resolve sender
);
```

### 2. sendPrepared()

Send a message using pre-prepared content (gas efficient for large messages).

```solidity
function sendPrepared(
    address to,
    string calldata mailId,  // Reference to off-chain content
    address payer,
    bool revenueShareToReceiver,
    bool resolveSenderToName
) external;
```

**Example:**

```solidity
mailer.sendPrepared(
    userAddress,
    "template-welcome-v1",  // Pre-stored template ID
    msg.sender,
    false,
    true
);
```

### 3. sendToEmailAddress()

Send to an email address when wallet is unknown.

```solidity
function sendToEmailAddress(
    string calldata toEmail,     // Recipient's email
    string calldata subject,
    string calldata body,
    address payer
) external;
```

**Example:**

```solidity
mailer.sendToEmailAddress(
    "user@example.com",
    "Account Alert",
    "Your transaction was successful",
    msg.sender
);
```

### 4. sendPreparedToEmailAddress()

Send pre-prepared content to an email address.

```solidity
function sendPreparedToEmailAddress(
    string calldata toEmail,
    string calldata mailId,
    address payer
) external;
```

### 5. sendThroughWebhook()

Send via webhook for custom delivery mechanisms.

```solidity
function sendThroughWebhook(
    address to,
    string calldata webhookId,   // Webhook identifier
    address payer,
    bool revenueShareToReceiver,
    bool resolveSenderToName
) external;
```

## Integration Patterns

### Pattern 1: User Pays Fee

The simplest pattern - user approves USDC and pays their own fees:

```solidity
contract SimpleNotifier {
    IMailer public mailer;

    function notify(address user, string memory message) external {
        mailer.send(
            user,
            "Notification",
            message,
            msg.sender,  // User pays
            false,
            true
        );
    }
}
```

### Pattern 2: Contract Pays Fee

Contract holds USDC and pays fees on behalf of users:

```solidity
contract ContractPaysNotifier {
    IMailer public mailer;
    IERC20 public usdc;

    constructor(address _mailer, address _usdc) {
        mailer = IMailer(_mailer);
        usdc = IERC20(_usdc);

        // Approve Mailer to spend contract's USDC
        usdc.approve(_mailer, type(uint256).max);
    }

    function notify(address user, string memory message) external {
        // First authorize this contract with Mailer
        // mailer.setPermission(address(this)) must be called by contract

        mailer.send(
            user,
            "System Notification",
            message,
            address(this),  // Contract pays
            false,
            false
        );
    }

    // Fund this contract with USDC
    receive() external payable {}
}
```

### Pattern 3: Bulk Notifications

Send notifications to multiple users efficiently:

```solidity
contract BulkNotifier {
    IMailer public mailer;

    function notifyMultiple(
        address[] calldata recipients,
        string calldata mailId  // Pre-prepared content
    ) external {
        for (uint i = 0; i < recipients.length; i++) {
            mailer.sendPrepared(
                recipients[i],
                mailId,
                msg.sender,
                false,
                true
            );
        }
    }
}
```

### Pattern 4: Event-Driven Messages

Automatically send messages on contract events:

```solidity
contract AutoNotifier {
    IMailer public mailer;

    event UserRegistered(address indexed user);

    function register() external {
        // Registration logic...

        // Send welcome message
        mailer.send(
            msg.sender,
            "Welcome!",
            "Your registration is complete",
            address(this),  // Contract pays
            false,
            true
        );

        emit UserRegistered(msg.sender);
    }
}
```

## Fee Structure

### Standard Messages (revenueShareToReceiver = false)

- **Fee**: 0.01 USDC (1% of base fee)
- **Recipient gets**: Nothing
- **Best for**: Notifications, alerts, one-way messages

### Priority Messages (revenueShareToReceiver = true)

- **Fee**: 0.1 USDC (full base fee)
- **Recipient gets**: 0.09 USDC (claimable within 60 days)
- **Owner gets**: 0.01 USDC
- **Best for**: Messages where you want to reward the recipient

## Deployed Contract Addresses

### Mainnet

- **Ethereum**: Coming soon
- **Polygon**: Coming soon
- **Arbitrum**: Coming soon
- **Optimism**: Coming soon
- **Base**: Coming soon

### Testnet

- **Sepolia**: `0x...` (Update with actual address)
- **Mumbai**: `0x...`
- **Arbitrum Goerli**: `0x...`

### USDC Addresses

Ensure you're using the correct USDC token address for your network:

- **Ethereum Mainnet**: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- **Polygon**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
- **Sepolia**: Use MockUSDC or testnet USDC

## Best Practices

### 1. Error Handling

The Mailer contract uses a soft-fail pattern - it doesn't revert on fee payment failures:

```solidity
// Listen for events to confirm message was sent
event MailSent(
    address indexed from,
    address indexed to,
    string subject,
    string body,
    bool revenueShareToReceiver,
    bool resolveSenderToName,
    bool feePaid  // Check this!
);
```

### 2. USDC Approval Management

```solidity
// Option 1: Approve per transaction (safer but more gas)
function sendWithApproval(address to, string memory msg) external {
    usdc.approve(address(mailer), 100000); // 0.1 USDC
    mailer.send(to, "Subject", msg, msg.sender, false, true);
}

// Option 2: Infinite approval (less gas, requires trust)
function approveOnce() external {
    usdc.approve(address(mailer), type(uint256).max);
}
```

### 3. Gas Optimization

```solidity
// Use sendPrepared for repeated messages
string constant WELCOME_TEMPLATE = "welcome-v1";

function welcomeUsers(address[] calldata users) external {
    for (uint i = 0; i < users.length; i++) {
        mailer.sendPrepared(
            users[i],
            WELCOME_TEMPLATE,
            msg.sender,
            false,
            true
        );
    }
}
```

### 4. Access Control

```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract SecureNotifier is Ownable {
    IMailer public mailer;

    function sendAdminMessage(
        address to,
        string calldata subject,
        string calldata body
    ) external onlyOwner {
        mailer.send(to, subject, body, address(this), false, true);
    }
}
```

## Example Use Cases

### DeFi Protocol Notifications

```solidity
contract DeFiNotifier {
    IMailer public mailer;

    function notifyLiquidation(address user, uint256 amount) external {
        mailer.send(
            user,
            "Liquidation Alert",
            string.concat("Position liquidated: ", amount, " tokens"),
            address(this),
            true,  // Reward user with revenue share
            true
        );
    }
}
```

### NFT Marketplace

```solidity
contract NFTMarketplace {
    IMailer public mailer;

    function notifySale(address seller, address buyer, uint256 tokenId) internal {
        // Notify seller
        mailer.send(
            seller,
            "NFT Sold",
            "Your NFT was purchased",
            address(this),
            false,
            true
        );

        // Notify buyer
        mailer.send(
            buyer,
            "Purchase Confirmed",
            "Your NFT purchase is complete",
            address(this),
            false,
            true
        );
    }
}
```

### DAO Governance

```solidity
contract DAONotifier {
    IMailer public mailer;

    function notifyProposal(address[] calldata voters, string calldata proposalId) external {
        for (uint i = 0; i < voters.length; i++) {
            mailer.sendPrepared(
                voters[i],
                proposalId,
                address(this),
                false,
                true
            );
        }
    }
}
```

## Complete Example Contract

See [`contracts/examples/MailerIntegrationExample.sol`](../contracts/examples/MailerIntegrationExample.sol) for a comprehensive example showing all integration patterns.

## Testing Your Integration

### Hardhat Test Example

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MyContract", function() {
  let mailer, myContract, usdc;

  beforeEach(async function() {
    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    // Deploy Mailer
    const Mailer = await ethers.getContractFactory("Mailer");
    mailer = await Mailer.deploy(usdc.address);

    // Deploy your contract
    const MyContract = await ethers.getContractFactory("MyContract");
    myContract = await MyContract.deploy(mailer.address, usdc.address);

    // Setup: Mint USDC and approve
    await usdc.mint(addr1.address, ethers.parseUnits("100", 6));
    await usdc.connect(addr1).approve(mailer.address, ethers.parseUnits("100", 6));
  });

  it("Should send notification", async function() {
    await expect(myContract.connect(addr1).sendNotification(addr2.address, "Hello"))
      .to.emit(mailer, "MailSent");
  });
});
```

## Troubleshooting

### Message not sending?

1. Check USDC approval: `usdc.allowance(payer, mailerAddress)`
2. Check USDC balance: `usdc.balanceOf(payer)`
3. Check if contract is paused: `mailer.isPaused()`
4. Listen for `MailSent` event and check `feePaid` boolean

### Gas costs too high?

1. Use `sendPrepared()` instead of `send()` for large messages
2. Use `sendThroughWebhook()` for custom delivery
3. Batch multiple sends in one transaction

## Support

- **Documentation**: [Full API Docs](./API.md)
- **Examples**: [`contracts/examples/`](../contracts/examples/)
- **Issues**: [GitHub Issues](https://github.com/johnqh/mail_box_contracts/issues)

## License

MIT

# Permission System for Smart Contract Integration

## Overview

The Mailer contract now supports a **permission system** that allows smart contracts to send messages while a wallet pays the fees. This solves the problem where smart contracts cannot easily approve and manage ERC20 tokens.

## The Problem

When a smart contract calls Mailer functions:
- `msg.sender` = smart contract address
- Mailer tries to `transferFrom(smartContract, ...)`
- **Issue**: Smart contracts typically cannot call `usdc.approve(mailer, amount)`
- Even if they could, it requires complex token management logic

## The Solution: Permission Mapping

The permission system allows a wallet to:
1. Grant permission for a contract to send messages
2. The wallet pays all fees automatically
3. The contract never needs to handle USDC approvals

### Architecture

```solidity
// Mapping: contractAddress => walletAddress
mapping(address => address) public permissions;

// Helper function
function _getPayer(address sender) internal view returns (address) {
    address permittedWallet = permissions[sender];
    if (permittedWallet != address(0)) {
        return permittedWallet;  // Wallet pays
    }
    return sender;  // Sender pays (normal case)
}
```

## Usage Workflow

### Step 1: Wallet Setup (One-Time)

```solidity
// 1. Wallet approves USDC to Mailer (one time, large amount)
usdc.approve(mailerAddress, 1000 * 10**6);  // Approve 1000 USDC

// 2. Wallet grants permission to the smart contract
mailer.setPermission(mySmartContractAddress);
```

### Step 2: Smart Contract Sends Messages (Forever)

```solidity
// Smart contract calls send() - wallet automatically pays!
contract MyProject {
    Mailer public mailer;

    function notifyUsers(address[] memory users) external {
        for (uint i = 0; i < users.length; i++) {
            // Wallet automatically pays the fee!
            mailer.send(
                users[i],
                "Notification",
                "You have a new alert",
                false,  // standard mode
                false   // no name resolution
            );
        }
    }
}
```

### Step 3: Revoke Permission (When Done)

```solidity
// Wallet can revoke permission at any time
mailer.clearPermission(mySmartContractAddress);
```

## Benefits

✅ **Smart contracts never need to handle USDC approvals**
✅ **Wallet maintains full control over spending**
✅ **One-time setup, unlimited messages**
✅ **Works with DAOs, multisigs, automated systems**
✅ **Secure: Only pre-authorized contracts can spend**
✅ **Flexible: Revoke anytime**

## Security Features

1. **Explicit Opt-In**: Wallet must explicitly call `setPermission(contractAddress)`
2. **One-to-One Mapping**: Each contract can only have one wallet sponsor
3. **Revocable**: Wallet can call `clearPermission()` anytime
4. **USDC Control**: Wallet controls total budget via initial `approve()` amount
5. **No Arbitrary Charges**: Contract can only spend through Mailer functions

## Example Use Cases

### 1. DAO Notification System
```solidity
// DAO treasury wallet approves + grants permission
// DAO contract sends notifications without managing tokens
```

### 2. Automated Trading Bot
```solidity
// User wallet approves + grants permission
// Bot contract sends trade alerts without token management
```

### 3. Subscription Service
```solidity
// Service wallet approves + grants permission
// Subscription contract sends renewal notifications
```

### 4. Multi-Signature Wallet
```solidity
// Multisig wallet approves + grants permission
// Multisig can send messages without complex token logic
```

## API Reference

### setPermission

```solidity
function setPermission(address contractAddress) external whenNotPaused
```

Grants permission for a contract to send messages using caller's USDC balance. If permission already exists for a different wallet, automatically revokes the old permission first.

**Parameters:**
- `contractAddress`: The contract to grant permission to

**Requirements:**
- `contractAddress` must not be `address(0)`
- Caller must have approved Mailer to spend their USDC
- Contract must not be paused

**Events:**
- `PermissionRevoked(address indexed contractAddress, address indexed wallet)` - If there was a previous wallet
- `PermissionGranted(address indexed contractAddress, address indexed wallet)` - Always emitted

### clearPermission

```solidity
function clearPermission(address contractAddress) external
```

Revokes permission from a contract.

**Parameters:**
- `contractAddress`: The contract to revoke permission from

**Requirements:**
- Caller must be the wallet that granted permission

**Events:**
- `PermissionRevoked(address indexed contractAddress, address indexed wallet)`

### permissions (View)

```solidity
function permissions(address contractAddress) external view returns (address)
```

Returns the wallet address that pays fees for a given contract.

**Returns:**
- `address`: The wallet address, or `address(0)` if no permission set

## Complete Example

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Mailer.sol";
import "./interfaces/IERC20.sol";

contract NotificationBot {
    Mailer public immutable mailer;
    address public owner;

    constructor(address _mailer) {
        mailer = Mailer(_mailer);
        owner = msg.sender;
    }

    // Send notification - wallet pays automatically
    function sendNotification(
        address recipient,
        string calldata subject,
        string calldata body
    ) external {
        require(msg.sender == owner, "Only owner");

        // Wallet automatically pays the fee!
        mailer.send(recipient, subject, body, false, false);
    }
}

// Deployment & Setup:
// 1. Deploy NotificationBot
// 2. Wallet: usdc.approve(mailer, 1000 * 10**6)
// 3. Wallet: mailer.setPermission(notificationBotAddress)
// 4. NotificationBot.sendNotification(...) works! Wallet pays!
```

## Migration from Old System

If you were using the old system where contracts needed to manage tokens:

**Before:**
```solidity
// Contract needed to:
usdc.approve(mailer, amount);  // Complex!
mailer.send(...);
```

**After:**
```solidity
// Wallet does setup once:
usdc.approve(mailer, largeAmount);
mailer.setPermission(contractAddress);

// Contract just calls:
mailer.send(...);  // That's it!
```

## FAQ

**Q: What if I want to change the sponsor wallet?**
A: New wallet simply calls `setPermission(contract)` - the old permission is automatically revoked with a `PermissionRevoked` event emitted

**Q: Can one wallet sponsor multiple contracts?**
A: Yes! Each contract gets its own permission mapping

**Q: Can multiple wallets sponsor the same contract?**
A: No, only one wallet per contract. When a new wallet calls `setPermission`, it automatically revokes the previous wallet's permission (with a `PermissionRevoked` event)

**Q: What happens if the wallet runs out of USDC allowance?**
A: Contract calls will fail with `FeePaymentRequired` error

**Q: Is this secure?**
A: Yes! Wallet explicitly grants permission, controls budget via approve amount, and can revoke anytime

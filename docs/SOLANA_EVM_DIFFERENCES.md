# Solana vs EVM Implementation Differences

## Overview

This document explains the architectural differences between the Solana and EVM implementations of the Mailer contract, focusing on why certain features exist in one but not the other.

## Core Business Logic: ✅ IDENTICAL

Both implementations share the same core business logic:

- **Fee Structure**: 0.1 USDC base send fee, 10 USDC delegation fee
- **Revenue Sharing**: 90% to recipient, 10% to owner (priority mode)
- **Standard Mode**: 10% fee only, no revenue sharing
- **Claim Period**: 60 days for revenue shares
- **Email Functions**: Always use standard 10% fee (no revenue sharing)
- **Delegation System**: Same delegation and rejection logic
- **Custom Fee Discounts**: Both support custom fee percentages per address
- **Pause Functionality**: Both support pause/unpause with fund distribution

## Permission System: EVM-Specific Feature

### EVM Implementation

The EVM contract includes a **permission system** that allows smart contracts to send messages while a wallet pays the fees:

```solidity
// Mapping: contractAddress => walletAddress
mapping(address => address) public permissions;

function setPermission(address contractAddress) external;
function clearPermission(address contractAddress) external;
function _getPayer(address sender) internal view returns (address);
```

**Why it's needed in EVM:**
1. ERC20 tokens use `transferFrom(from, to, amount)` pattern
2. Requires prior `approve(spender, amount)` call
3. Smart contracts typically cannot call `approve()` on behalf of users
4. Without this system, contracts would need complex token management logic
5. This permission system allows a wallet to:
   - Approve USDC to Mailer once
   - Grant permission for a contract to send messages
   - The wallet automatically pays all fees when the contract calls send functions

**Example EVM Flow:**
```solidity
// One-time setup by wallet
usdc.approve(mailer, 1000 * 10**6);  // Approve large amount
mailer.setPermission(myContractAddress);

// Forever after, contract can send messages
contract.send(recipient, subject, body);  // Wallet pays!
```

### Solana Implementation

The Solana implementation **does NOT have a permission system** - and doesn't need one!

**Why it's not needed in Solana:**
1. Solana uses **Program Derived Addresses (PDAs)** instead of approvals
2. Token transfers work differently - no `transferFrom` pattern
3. Programs specify token accounts directly in instructions
4. Contracts can own token accounts via PDAs
5. No "approval" concept - the caller's token account is passed directly

**Solana Flow (No Permission System Needed):**
```rust
// Contract has its own USDC token account (PDA)
let contract_usdc_account = PDA::derive(...);

// When contract calls send(), it passes its own token account
invoke(
    &spl_token::instruction::transfer(
        &token_program,
        &contract_usdc_account,  // From contract's account
        &mailer_usdc_account,    // To mailer
        &contract_authority,     // Contract signs
        &[],
        fee_amount,
    ),
    ...
)?;
```

In Solana, a smart contract simply:
1. Has its own token account (PDA)
2. Holds USDC in that account
3. Directly transfers from its account to Mailer
4. No approvals, no permission system needed

## Token Transfer Architecture

### EVM (Approval Pattern)
```
User Wallet
    ↓ approve(mailer, amount)
Mailer Contract
    ↓ transferFrom(user, mailer, fee)
Transfer executed
```

### Solana (Direct Account Pattern)
```
Sender Token Account (passed as instruction account)
    ↓ transfer instruction
Mailer Token Account (passed as instruction account)
    ↓ SPL Token Program validates & executes
Transfer executed
```

## Account Model Differences

### EVM
- **Single address per entity** (wallet or contract)
- Balances stored in token contract's mapping
- `balanceOf[address]` lookup
- Contracts interact via function calls

### Solana
- **Multiple accounts per entity**
- Each token held in separate token account
- Token accounts are PDAs owned by programs
- Programs interact via passing account references

## Fee Discount System Comparison

Both implementations support custom fee discounts, but stored differently:

### EVM
```solidity
mapping(address => uint256) public customFeeDiscount;
```
- Single mapping in contract storage
- Direct address lookup

### Solana
```rust
pub struct FeeDiscount {
    pub account: Pubkey,
    pub discount: u8,
    pub bump: u8,
}
```
- Separate PDA account per discount
- Account derived from `[b"discount", account.as_ref()]`
- Requires passing discount account in instruction

## Summary Table

| Feature | EVM | Solana | Reason for Difference |
|---------|-----|--------|----------------------|
| Core Business Logic | ✅ | ✅ | Platform-agnostic |
| Revenue Sharing | ✅ | ✅ | Platform-agnostic |
| Email Functions | ✅ | ✅ | Platform-agnostic |
| Delegation System | ✅ | ✅ | Platform-agnostic |
| Custom Fee Discounts | ✅ | ✅ | Platform-agnostic |
| Pause Functionality | ✅ | ✅ | Platform-agnostic |
| **Permission System** | ✅ | ❌ | EVM-specific (approval pattern) |
| Token Approvals | Required | Not needed | Different token models |
| Account Model | Single address | Multiple accounts (PDAs) | Blockchain architecture |
| Storage Pattern | Contract mappings | PDA accounts | Blockchain architecture |

## Conclusion

The **core business logic is identical** between both implementations. The only significant difference is the **permission system**, which is:

- **Required in EVM** due to the token approval pattern
- **Not needed in Solana** due to the PDA account model

Both contracts achieve the same functionality - allowing entities (wallets or contracts) to send messages with USDC fees and revenue sharing. The implementation differences reflect the underlying blockchain architectures, not differences in intended functionality.

## For Developers

When using either contract:

**EVM (with contracts):**
```javascript
// Wallet setup
await usdc.approve(mailer, largeAmount);
await mailer.setPermission(contractAddress);

// Contract sends
await contract.sendMessage(to, subject, body);
// Wallet pays automatically via permission system
```

**Solana (with contracts):**
```javascript
// Contract setup
const contractUSDC = await getOrCreateTokenAccount(
    contractPDA,
    usdcMint
);
await transferUSDC(walletUSDC, contractUSDC, amount);

// Contract sends
await program.methods
    .send(to, subject, body, false, false)
    .accounts({
        sender: contractPDA,
        senderUsdc: contractUSDC,  // Contract's own account
        ...
    })
    .rpc();
// Contract pays directly from its account
```

Both achieve the same result - messages sent by contracts with fee payment - using architecture-appropriate patterns.

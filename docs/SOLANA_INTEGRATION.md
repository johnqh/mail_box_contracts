# Solana Integration Guide

This guide shows how to integrate Mailer messaging functionality into your Solana programs using Cross-Program Invocation (CPI).

## Installation

Add the Mailer program as a dependency in your `Cargo.toml`:

```toml
[dependencies]
mailer = { path = "../mailer", features = ["cpi"] }
solana-program = "1.16"
spl-token = { version = "3.5", features = ["no-entrypoint"] }
borsh = "1.5"
```

## Quick Start

### 1. Import the CPI Module

```rust
use mailer::cpi;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
};

// Send a notification
pub fn send_notification<'a>(
    mailer_program: &AccountInfo<'a>,
    sender: &AccountInfo<'a>,
    recipient_claim_pda: &AccountInfo<'a>,
    mailer_state: &AccountInfo<'a>,
    sender_usdc: &AccountInfo<'a>,
    mailer_usdc: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    recipient: Pubkey,
    message: String,
) -> ProgramResult {
    cpi::send(
        mailer_program,
        sender,
        recipient_claim_pda,
        mailer_state,
        sender_usdc,
        mailer_usdc,
        token_program,
        system_program,
        recipient,
        "Notification".to_string(),
        message,
        false, // Standard fee (0.01 USDC)
        true,  // Resolve sender to name
    )
}
```

### 2. Derive Required PDAs

```rust
use mailer::cpi;

// Get recipient claim PDA
let (recipient_claim_pda, bump) = cpi::derive_recipient_claim_pda(
    &mailer_program_id,
    &recipient_pubkey
);

// Get mailer state PDA
let (mailer_state_pda, bump) = cpi::derive_mailer_state_pda(&mailer_program_id);
```

## Available CPI Functions

The Mailer CPI module provides 5 messaging functions:

### 1. send()

Send a message to a wallet address with full subject and body.

```rust
pub fn send<'a>(
    mailer_program: &AccountInfo<'a>,
    sender: &AccountInfo<'a>,
    recipient_claim_pda: &AccountInfo<'a>,
    mailer_state: &AccountInfo<'a>,
    sender_usdc: &AccountInfo<'a>,
    mailer_usdc: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    to: Pubkey,
    subject: String,
    body: String,
    revenue_share_to_receiver: bool,  // true = 0.1 USDC with 90% claimable, false = 0.01 USDC
    resolve_sender_to_name: bool,
) -> ProgramResult
```

**Example:**

```rust
cpi::send(
    mailer_program,
    user,
    recipient_claim_pda,
    mailer_state,
    user_usdc,
    mailer_usdc,
    token_program,
    system_program,
    recipient_pubkey,
    "Welcome!".to_string(),
    "Thanks for joining".to_string(),
    false,  // Standard fee
    true,   // Resolve sender
)?;
```

### 2. send_prepared()

Send a message using pre-stored content (gas efficient for large messages).

```rust
pub fn send_prepared<'a>(
    mailer_program: &AccountInfo<'a>,
    sender: &AccountInfo<'a>,
    recipient_claim_pda: &AccountInfo<'a>,
    mailer_state: &AccountInfo<'a>,
    sender_usdc: &AccountInfo<'a>,
    mailer_usdc: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    to: Pubkey,
    mail_id: String,               // Reference to off-chain content
    revenue_share_to_receiver: bool,
    resolve_sender_to_name: bool,
) -> ProgramResult
```

**Example:**

```rust
cpi::send_prepared(
    mailer_program,
    user,
    recipient_claim_pda,
    mailer_state,
    user_usdc,
    mailer_usdc,
    token_program,
    system_program,
    recipient_pubkey,
    "template-welcome-v1".to_string(),  // Pre-stored template
    false,
    true,
)?;
```

### 3. send_to_email()

Send to an email address when wallet is unknown.

```rust
pub fn send_to_email<'a>(
    mailer_program: &AccountInfo<'a>,
    sender: &AccountInfo<'a>,
    mailer_state: &AccountInfo<'a>,
    sender_usdc: &AccountInfo<'a>,
    mailer_usdc: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    to_email: String,
    subject: String,
    body: String,
) -> ProgramResult
```

**Example:**

```rust
cpi::send_to_email(
    mailer_program,
    user,
    mailer_state,
    user_usdc,
    mailer_usdc,
    token_program,
    "user@example.com".to_string(),
    "Account Alert".to_string(),
    "Your transaction was successful".to_string(),
)?;
```

### 4. send_prepared_to_email()

Send pre-stored content to an email address.

```rust
pub fn send_prepared_to_email<'a>(
    mailer_program: &AccountInfo<'a>,
    sender: &AccountInfo<'a>,
    mailer_state: &AccountInfo<'a>,
    sender_usdc: &AccountInfo<'a>,
    mailer_usdc: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    to_email: String,
    mail_id: String,
) -> ProgramResult
```

### 5. send_through_webhook()

Send via webhook for custom delivery mechanisms.

```rust
pub fn send_through_webhook<'a>(
    mailer_program: &AccountInfo<'a>,
    sender: &AccountInfo<'a>,
    recipient_claim_pda: &AccountInfo<'a>,
    mailer_state: &AccountInfo<'a>,
    sender_usdc: &AccountInfo<'a>,
    mailer_usdc: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    to: Pubkey,
    webhook_id: String,
    revenue_share_to_receiver: bool,
    resolve_sender_to_name: bool,
) -> ProgramResult
```

## Integration Patterns

### Pattern 1: Simple Notification

Basic notification to a user:

```rust
use mailer::cpi;

pub fn notify_user(
    accounts: &[AccountInfo],
    recipient: Pubkey,
    message: String,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let user = next_account_info(account_iter)?;
    let mailer_program = next_account_info(account_iter)?;
    let recipient_claim_pda = next_account_info(account_iter)?;
    let mailer_state = next_account_info(account_iter)?;
    let user_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    cpi::send(
        mailer_program,
        user,
        recipient_claim_pda,
        mailer_state,
        user_usdc,
        mailer_usdc,
        token_program,
        system_program,
        recipient,
        "Notification".to_string(),
        message,
        false,  // Standard fee
        true,   // Resolve sender
    )
}
```

### Pattern 2: Priority Message with Revenue Share

Reward recipients with claimable USDC:

```rust
pub fn send_reward_message(
    accounts: &[AccountInfo],
    recipient: Pubkey,
    subject: String,
    body: String,
) -> ProgramResult {
    // ... account setup

    cpi::send(
        mailer_program,
        user,
        recipient_claim_pda,
        mailer_state,
        user_usdc,
        mailer_usdc,
        token_program,
        system_program,
        recipient,
        subject,
        body,
        true,  // Enable revenue sharing (0.1 USDC, 90% claimable)
        true,
    )
}
```

### Pattern 3: Bulk Notifications

Send to multiple users efficiently:

```rust
pub fn notify_multiple_users(
    accounts: &[AccountInfo],
    recipients: Vec<Pubkey>,
    mail_id: String,
) -> ProgramResult {
    // ... account setup

    for recipient in recipients {
        let (recipient_claim_pda, _) = cpi::derive_recipient_claim_pda(
            mailer_program.key,
            &recipient
        );

        cpi::send_prepared(
            mailer_program,
            user,
            &recipient_claim_pda_account,  // Need to pass AccountInfo
            mailer_state,
            user_usdc,
            mailer_usdc,
            token_program,
            system_program,
            recipient,
            mail_id.clone(),
            false,
            true,
        )?;
    }

    Ok(())
}
```

### Pattern 4: Event-Driven Messages

Automatically send messages on program events:

```rust
pub fn process_user_registration(
    accounts: &[AccountInfo],
    user_pubkey: Pubkey,
) -> ProgramResult {
    // ... registration logic

    // Send welcome message via CPI
    cpi::send(
        mailer_program,
        payer,
        recipient_claim_pda,
        mailer_state,
        payer_usdc,
        mailer_usdc,
        token_program,
        system_program,
        user_pubkey,
        "Welcome!".to_string(),
        "Your account has been created successfully".to_string(),
        false,
        true,
    )?;

    msg!("User registered and welcome message sent");
    Ok(())
}
```

## Fee Structure

### Standard Messages (revenue_share_to_receiver = false)

- **Fee**: 0.01 USDC (10,000 with 6 decimals)
- **Recipient gets**: Nothing
- **Best for**: Notifications, alerts, one-way messages

### Priority Messages (revenue_share_to_receiver = true)

- **Fee**: 0.1 USDC (100,000 with 6 decimals)
- **Recipient gets**: 0.09 USDC (claimable within 60 days)
- **Owner gets**: 0.01 USDC
- **Best for**: Messages where you want to reward the recipient

## Account Requirements

When calling Mailer via CPI, you need to pass these accounts:

### For `send()`, `send_prepared()`, `send_through_webhook()`:

0. `[signer]` Sender
1. `[writable]` Recipient claim PDA
2. `[]` Mailer state PDA
3. `[writable]` Sender USDC account
4. `[writable]` Mailer USDC account
5. `[]` SPL Token program
6. `[]` System program

### For `send_to_email()`, `send_prepared_to_email()`:

0. `[signer]` Sender
1. `[]` Mailer state PDA
2. `[writable]` Sender USDC account
3. `[writable]` Mailer USDC account
4. `[]` SPL Token program

## PDA Derivation

The Mailer program uses PDAs for state management:

```rust
// Mailer state PDA (global singleton)
let (mailer_state, bump) = Pubkey::find_program_address(
    &[b"mailer"],
    &mailer_program_id
);

// Recipient claim PDA (per recipient)
let (recipient_claim, bump) = Pubkey::find_program_address(
    &[b"claim", &[1], recipient.as_ref()],
    &mailer_program_id
);

// Or use the helper functions:
use mailer::cpi;
let (state, bump) = cpi::derive_mailer_state_pda(&mailer_program_id);
let (claim, bump) = cpi::derive_recipient_claim_pda(&mailer_program_id, &recipient);
```

## Deployed Program IDs

### Devnet

- **Mailer Program**: `9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF`
- **USDC Mint**: Use devnet USDC or deploy MockUSDC

### Mainnet

- **Mailer Program**: Coming soon
- **USDC Mint**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## Best Practices

### 1. Error Handling

The Mailer program uses soft-fail behavior - it doesn't revert on fee payment failures:

```rust
// Monitor program logs to confirm message was sent
msg!("Attempting to send message");
cpi::send(...)?;
msg!("Message sent successfully");  // Only logged if send succeeded
```

### 2. USDC Approval

Ensure the sender has approved the Mailer program to spend USDC:

```rust
// Users must approve USDC spending before calling your program
// This is typically done client-side before the transaction
```

### 3. PDA Account Creation

When calling CPI, ensure the recipient_claim_pda account is created if needed:

```rust
// The Mailer program will create the PDA if it doesn't exist
// Make sure to include the system_program in accounts
```

### 4. Gas Optimization

```rust
// Use send_prepared for repeated messages
const WELCOME_TEMPLATE: &str = "welcome-v1";

cpi::send_prepared(
    mailer_program,
    user,
    recipient_claim_pda,
    mailer_state,
    user_usdc,
    mailer_usdc,
    token_program,
    system_program,
    recipient,
    WELCOME_TEMPLATE.to_string(),
    false,
    true,
)?;
```

## Example Use Cases

### DeFi Protocol Notifications

```rust
pub fn notify_liquidation(
    accounts: &[AccountInfo],
    user: Pubkey,
    amount: u64,
) -> ProgramResult {
    let message = format!("Liquidation alert: {} tokens", amount);

    cpi::send(
        mailer_program,
        program_authority,
        recipient_claim_pda,
        mailer_state,
        program_usdc,
        mailer_usdc,
        token_program,
        system_program,
        user,
        "Liquidation Alert".to_string(),
        message,
        true,  // Reward user for being notified
        true,
    )
}
```

### NFT Marketplace

```rust
pub fn notify_sale(
    accounts: &[AccountInfo],
    seller: Pubkey,
    buyer: Pubkey,
    nft_name: String,
) -> ProgramResult {
    // Notify seller
    cpi::send(
        mailer_program,
        program_authority,
        seller_claim_pda,
        mailer_state,
        program_usdc,
        mailer_usdc,
        token_program,
        system_program,
        seller,
        "NFT Sold".to_string(),
        format!("Your NFT '{}' was sold", nft_name),
        false,
        true,
    )?;

    // Notify buyer
    cpi::send(
        mailer_program,
        program_authority,
        buyer_claim_pda,
        mailer_state,
        program_usdc,
        mailer_usdc,
        token_program,
        system_program,
        buyer,
        "Purchase Confirmed".to_string(),
        format!("You purchased '{}'", nft_name),
        false,
        true,
    )
}
```

### DAO Governance

```rust
pub fn notify_proposal(
    accounts: &[AccountInfo],
    voters: Vec<Pubkey>,
    proposal_id: String,
) -> ProgramResult {
    for voter in voters {
        let (claim_pda, _) = cpi::derive_recipient_claim_pda(
            mailer_program.key,
            &voter
        );

        cpi::send_prepared(
            mailer_program,
            program_authority,
            &claim_pda_account,
            mailer_state,
            program_usdc,
            mailer_usdc,
            token_program,
            system_program,
            voter,
            proposal_id.clone(),
            false,
            true,
        )?;
    }

    Ok(())
}
```

## Complete Example Program

See [`programs/mailer-integration-example/src/lib.rs`](../programs/mailer-integration-example/src/lib.rs) for a comprehensive example showing all integration patterns.

## Troubleshooting

### Message not sending?

1. Check sender has enough USDC
2. Check Mailer program is correct address
3. Check PDAs are derived correctly
4. Monitor program logs for error messages

### High compute units?

1. Use `send_prepared()` instead of `send()` for large messages
2. Use `send_through_webhook()` for custom delivery
3. Batch multiple sends efficiently

## Support

- **Documentation**: [Full API Docs](./API.md)
- **Examples**: [`programs/mailer-integration-example/`](../programs/mailer-integration-example/)
- **Issues**: [GitHub Issues](https://github.com/johnqh/mail_box_contracts/issues)

## License

MIT

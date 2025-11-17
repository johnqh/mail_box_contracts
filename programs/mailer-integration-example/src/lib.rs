//! # Mailer Integration Example Program
//!
//! This example program demonstrates how to integrate Mailer messaging
//! functionality into your Solana program using Cross-Program Invocation (CPI).
//!
//! ## Integration Patterns Demonstrated
//!
//! 1. **Simple Notification** - Send basic message to user
//! 2. **Priority Message** - Send with revenue sharing
//! 3. **Email Notification** - Send to email when wallet unknown
//! 4. **Bulk Notifications** - Efficiently notify multiple users
//! 5. **Event-Driven Messages** - Auto-send on program events
//!
//! ## Usage
//!
//! Add to your program's `Cargo.toml`:
//! ```toml
//! [dependencies]
//! mailer = { path = "../mailer", features = ["cpi"] }
//! ```

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

// Declare the program ID
solana_program::declare_id!("ExampleProgramID11111111111111111111111111");

/// Program instruction
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub enum ExampleInstruction {
    /// Example 1: Send a simple notification to a user
    ///
    /// Accounts:
    /// 0. `[signer]` User (sender)
    /// 1. `[]` Mailer program
    /// 2. `[writable]` Recipient claim PDA
    /// 3. `[]` Mailer state PDA
    /// 4. `[writable]` User's USDC account
    /// 5. `[writable]` Mailer's USDC account
    /// 6. `[]` SPL Token program
    /// 7. `[]` System program
    SendNotification {
        recipient: Pubkey,
        message: String,
    },

    /// Example 2: Send a priority message with revenue sharing
    ///
    /// Accounts: Same as SendNotification
    SendPriorityMessage {
        recipient: Pubkey,
        subject: String,
        body: String,
    },

    /// Example 3: Send to email address (no wallet needed)
    ///
    /// Accounts:
    /// 0. `[signer]` User (sender)
    /// 1. `[]` Mailer program
    /// 2. `[]` Mailer state PDA
    /// 3. `[writable]` User's USDC account
    /// 4. `[writable]` Mailer's USDC account
    /// 5. `[]` SPL Token program
    SendEmailNotification {
        email: String,
        subject: String,
        body: String,
    },

    /// Example 4: Send prepared content (gas efficient)
    ///
    /// Accounts: Same as SendNotification
    SendPreparedNotification {
        recipient: Pubkey,
        mail_id: String,
    },

    /// Example 5: Send via webhook
    ///
    /// Accounts: Same as SendNotification
    SendViaWebhook {
        recipient: Pubkey,
        webhook_id: String,
    },
}

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = ExampleInstruction::try_from_slice(instruction_data)?;

    match instruction {
        ExampleInstruction::SendNotification { recipient, message } => {
            process_send_notification(program_id, accounts, recipient, message)
        }
        ExampleInstruction::SendPriorityMessage {
            recipient,
            subject,
            body,
        } => process_send_priority_message(program_id, accounts, recipient, subject, body),
        ExampleInstruction::SendEmailNotification {
            email,
            subject,
            body,
        } => process_send_email_notification(program_id, accounts, email, subject, body),
        ExampleInstruction::SendPreparedNotification { recipient, mail_id } => {
            process_send_prepared_notification(program_id, accounts, recipient, mail_id)
        }
        ExampleInstruction::SendViaWebhook {
            recipient,
            webhook_id,
        } => process_send_via_webhook(program_id, accounts, recipient, webhook_id),
    }
}

/// Example 1: Send a simple notification
///
/// Demonstrates the most basic integration pattern - sending a standard message
/// with no revenue sharing (0.01 USDC fee)
fn process_send_notification(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    recipient: Pubkey,
    message: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user = next_account_info(account_info_iter)?;
    let mailer_program = next_account_info(account_info_iter)?;
    let recipient_claim_pda = next_account_info(account_info_iter)?;
    let mailer_state_pda = next_account_info(account_info_iter)?;
    let user_usdc = next_account_info(account_info_iter)?;
    let mailer_usdc = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    // Verify user is signer
    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Sending notification to {}", recipient);

    // Call Mailer via CPI
    mailer::cpi::send(
        mailer_program,
        user,
        recipient_claim_pda,
        mailer_state_pda,
        user_usdc,
        mailer_usdc,
        token_program,
        system_program,
        recipient,
        "Notification".to_string(),
        message,
        false, // Standard fee (0.01 USDC), no revenue share
        true,  // Resolve sender to name
    )?;

    msg!("Notification sent successfully");
    Ok(())
}

/// Example 2: Send a priority message with revenue sharing
///
/// Demonstrates priority messaging where:
/// - Sender pays 0.1 USDC
/// - Recipient gets 90% (0.09 USDC) as claimable within 60 days
/// - Owner gets 10% (0.01 USDC)
fn process_send_priority_message(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    recipient: Pubkey,
    subject: String,
    body: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user = next_account_info(account_info_iter)?;
    let mailer_program = next_account_info(account_info_iter)?;
    let recipient_claim_pda = next_account_info(account_info_iter)?;
    let mailer_state_pda = next_account_info(account_info_iter)?;
    let user_usdc = next_account_info(account_info_iter)?;
    let mailer_usdc = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Sending priority message to {}", recipient);

    mailer::cpi::send(
        mailer_program,
        user,
        recipient_claim_pda,
        mailer_state_pda,
        user_usdc,
        mailer_usdc,
        token_program,
        system_program,
        recipient,
        subject,
        body,
        true,  // Enable revenue sharing (full 0.1 USDC fee)
        true,  // Resolve sender to name
    )?;

    msg!("Priority message sent - recipient can claim 90% revenue share");
    Ok(())
}

/// Example 3: Send to email address
///
/// Demonstrates sending to an email when the recipient's wallet is unknown.
/// Always uses standard fee (0.01 USDC) since there's no wallet for revenue sharing.
fn process_send_email_notification(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    email: String,
    subject: String,
    body: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user = next_account_info(account_info_iter)?;
    let mailer_program = next_account_info(account_info_iter)?;
    let mailer_state_pda = next_account_info(account_info_iter)?;
    let user_usdc = next_account_info(account_info_iter)?;
    let mailer_usdc = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Sending email notification to {}", email);

    mailer::cpi::send_to_email(
        mailer_program,
        user,
        mailer_state_pda,
        user_usdc,
        mailer_usdc,
        token_program,
        email,
        subject,
        body,
    )?;

    msg!("Email notification sent");
    Ok(())
}

/// Example 4: Send prepared content
///
/// Demonstrates gas-efficient messaging by referencing pre-stored content.
/// Useful for templates or large messages stored off-chain.
fn process_send_prepared_notification(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    recipient: Pubkey,
    mail_id: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user = next_account_info(account_info_iter)?;
    let mailer_program = next_account_info(account_info_iter)?;
    let recipient_claim_pda = next_account_info(account_info_iter)?;
    let mailer_state_pda = next_account_info(account_info_iter)?;
    let user_usdc = next_account_info(account_info_iter)?;
    let mailer_usdc = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Sending prepared content: {}", mail_id);

    mailer::cpi::send_prepared(
        mailer_program,
        user,
        recipient_claim_pda,
        mailer_state_pda,
        user_usdc,
        mailer_usdc,
        token_program,
        system_program,
        recipient,
        mail_id,
        false, // Standard fee
        true,  // Resolve sender to name
    )?;

    msg!("Prepared content sent");
    Ok(())
}

/// Example 5: Send via webhook
///
/// Demonstrates webhook-based delivery for custom notification systems
fn process_send_via_webhook(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    recipient: Pubkey,
    webhook_id: String,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user = next_account_info(account_info_iter)?;
    let mailer_program = next_account_info(account_info_iter)?;
    let recipient_claim_pda = next_account_info(account_info_iter)?;
    let mailer_state_pda = next_account_info(account_info_iter)?;
    let user_usdc = next_account_info(account_info_iter)?;
    let mailer_usdc = next_account_info(account_info_iter)?;
    let token_program = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Sending via webhook: {}", webhook_id);

    mailer::cpi::send_through_webhook(
        mailer_program,
        user,
        recipient_claim_pda,
        mailer_state_pda,
        user_usdc,
        mailer_usdc,
        token_program,
        system_program,
        recipient,
        webhook_id,
        false, // Standard fee
        true,  // Resolve sender to name
    )?;

    msg!("Webhook message sent");
    Ok(())
}

// Helper functions for deriving PDAs
pub fn get_recipient_claim_pda(mailer_program_id: &Pubkey, recipient: &Pubkey) -> (Pubkey, u8) {
    mailer::cpi::derive_recipient_claim_pda(mailer_program_id, recipient)
}

pub fn get_mailer_state_pda(mailer_program_id: &Pubkey) -> (Pubkey, u8) {
    mailer::cpi::derive_mailer_state_pda(mailer_program_id)
}

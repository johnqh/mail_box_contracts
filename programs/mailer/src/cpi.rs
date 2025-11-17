//! # Mailer CPI (Cross-Program Invocation) Module
//!
//! This module provides helper functions for other Solana programs to invoke
//! the Mailer program's instructions via CPI.
//!
//! ## Usage
//!
//! Add to your `Cargo.toml`:
//! ```toml
//! [dependencies]
//! mailer = { path = "../mailer", features = ["cpi"] }
//! ```
//!
//! Then in your program:
//! ```rust
//! use mailer::cpi;
//!
//! // Send a message via CPI
//! cpi::send(
//!     mailer_program,
//!     sender,
//!     recipient_claim_pda,
//!     mailer_state_pda,
//!     sender_usdc,
//!     mailer_usdc,
//!     token_program,
//!     system_program,
//!     recipient_pubkey,
//!     "Subject".to_string(),
//!     "Message body".to_string(),
//!     false, // revenue_share_to_receiver
//!     true,  // resolve_sender_to_name
//! )?;
//! ```

use borsh::BorshSerialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::invoke,
    pubkey::Pubkey,
};

use crate::MailerInstruction;

/// Send a message to a wallet address via CPI
///
/// # Arguments
/// * `mailer_program` - Mailer program account
/// * `sender` - Sender account (must be signer)
/// * `recipient_claim_pda` - Recipient's claim PDA account (writable)
/// * `mailer_state` - Mailer state PDA account
/// * `sender_usdc` - Sender's USDC token account (writable)
/// * `mailer_usdc` - Mailer's USDC token account (writable)
/// * `token_program` - SPL Token program
/// * `system_program` - System program
/// * `to` - Recipient's wallet address
/// * `subject` - Message subject
/// * `body` - Message body
/// * `revenue_share_to_receiver` - If true, charges 0.1 USDC with 90% claimable; if false, charges 0.01 USDC
/// * `resolve_sender_to_name` - If true, resolve sender address to name via off-chain service
#[allow(clippy::too_many_arguments)]
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
    revenue_share_to_receiver: bool,
    resolve_sender_to_name: bool,
) -> ProgramResult {
    let instruction = MailerInstruction::Send {
        to,
        subject,
        _body: body,
        revenue_share_to_receiver,
        resolve_sender_to_name,
    };

    let accounts = vec![
        AccountMeta::new_readonly(*sender.key, true),
        AccountMeta::new(*recipient_claim_pda.key, false),
        AccountMeta::new_readonly(*mailer_state.key, false),
        AccountMeta::new(*sender_usdc.key, false),
        AccountMeta::new(*mailer_usdc.key, false),
        AccountMeta::new_readonly(*token_program.key, false),
        AccountMeta::new_readonly(*system_program.key, false),
    ];

    let instruction_data = instruction.try_to_vec()?;
    let ix = Instruction {
        program_id: *mailer_program.key,
        accounts,
        data: instruction_data,
    };

    invoke(
        &ix,
        &[
            sender.clone(),
            recipient_claim_pda.clone(),
            mailer_state.clone(),
            sender_usdc.clone(),
            mailer_usdc.clone(),
            token_program.clone(),
            system_program.clone(),
        ],
    )
}

/// Send a prepared message (pre-stored content) via CPI
///
/// Gas efficient - stores large content off-chain, references by mail_id
#[allow(clippy::too_many_arguments)]
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
    mail_id: String,
    revenue_share_to_receiver: bool,
    resolve_sender_to_name: bool,
) -> ProgramResult {
    let instruction = MailerInstruction::SendPrepared {
        to,
        mail_id,
        revenue_share_to_receiver,
        resolve_sender_to_name,
    };

    let accounts = vec![
        AccountMeta::new_readonly(*sender.key, true),
        AccountMeta::new(*recipient_claim_pda.key, false),
        AccountMeta::new_readonly(*mailer_state.key, false),
        AccountMeta::new(*sender_usdc.key, false),
        AccountMeta::new(*mailer_usdc.key, false),
        AccountMeta::new_readonly(*token_program.key, false),
        AccountMeta::new_readonly(*system_program.key, false),
    ];

    let instruction_data = instruction.try_to_vec()?;
    let ix = Instruction {
        program_id: *mailer_program.key,
        accounts,
        data: instruction_data,
    };

    invoke(
        &ix,
        &[
            sender.clone(),
            recipient_claim_pda.clone(),
            mailer_state.clone(),
            sender_usdc.clone(),
            mailer_usdc.clone(),
            token_program.clone(),
            system_program.clone(),
        ],
    )
}

/// Send a message to an email address (when wallet is unknown) via CPI
///
/// Always charges standard 10% fee since there's no recipient wallet for revenue sharing
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
) -> ProgramResult {
    let instruction = MailerInstruction::SendToEmail {
        to_email,
        subject,
        _body: body,
    };

    let accounts = vec![
        AccountMeta::new_readonly(*sender.key, true),
        AccountMeta::new_readonly(*mailer_state.key, false),
        AccountMeta::new(*sender_usdc.key, false),
        AccountMeta::new(*mailer_usdc.key, false),
        AccountMeta::new_readonly(*token_program.key, false),
    ];

    let instruction_data = instruction.try_to_vec()?;
    let ix = Instruction {
        program_id: *mailer_program.key,
        accounts,
        data: instruction_data,
    };

    invoke(
        &ix,
        &[
            sender.clone(),
            mailer_state.clone(),
            sender_usdc.clone(),
            mailer_usdc.clone(),
            token_program.clone(),
        ],
    )
}

/// Send a prepared message to an email address via CPI
pub fn send_prepared_to_email<'a>(
    mailer_program: &AccountInfo<'a>,
    sender: &AccountInfo<'a>,
    mailer_state: &AccountInfo<'a>,
    sender_usdc: &AccountInfo<'a>,
    mailer_usdc: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    to_email: String,
    mail_id: String,
) -> ProgramResult {
    let instruction = MailerInstruction::SendPreparedToEmail { to_email, mail_id };

    let accounts = vec![
        AccountMeta::new_readonly(*sender.key, true),
        AccountMeta::new_readonly(*mailer_state.key, false),
        AccountMeta::new(*sender_usdc.key, false),
        AccountMeta::new(*mailer_usdc.key, false),
        AccountMeta::new_readonly(*token_program.key, false),
    ];

    let instruction_data = instruction.try_to_vec()?;
    let ix = Instruction {
        program_id: *mailer_program.key,
        accounts,
        data: instruction_data,
    };

    invoke(
        &ix,
        &[
            sender.clone(),
            mailer_state.clone(),
            sender_usdc.clone(),
            mailer_usdc.clone(),
            token_program.clone(),
        ],
    )
}

/// Send a message through a webhook via CPI
///
/// Useful for integration with external notification systems
#[allow(clippy::too_many_arguments)]
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
) -> ProgramResult {
    let instruction = MailerInstruction::SendThroughWebhook {
        to,
        webhook_id,
        revenue_share_to_receiver,
        resolve_sender_to_name,
    };

    let accounts = vec![
        AccountMeta::new_readonly(*sender.key, true),
        AccountMeta::new(*recipient_claim_pda.key, false),
        AccountMeta::new_readonly(*mailer_state.key, false),
        AccountMeta::new(*sender_usdc.key, false),
        AccountMeta::new(*mailer_usdc.key, false),
        AccountMeta::new_readonly(*token_program.key, false),
        AccountMeta::new_readonly(*system_program.key, false),
    ];

    let instruction_data = instruction.try_to_vec()?;
    let ix = Instruction {
        program_id: *mailer_program.key,
        accounts,
        data: instruction_data,
    };

    invoke(
        &ix,
        &[
            sender.clone(),
            recipient_claim_pda.clone(),
            mailer_state.clone(),
            sender_usdc.clone(),
            mailer_usdc.clone(),
            token_program.clone(),
            system_program.clone(),
        ],
    )
}

/// Helper function to derive the recipient claim PDA
///
/// Use this to get the correct PDA address for recipient claims
pub fn derive_recipient_claim_pda(mailer_program_id: &Pubkey, recipient: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"claim", &[1], recipient.as_ref()],
        mailer_program_id,
    )
}

/// Helper function to derive the mailer state PDA
pub fn derive_mailer_state_pda(mailer_program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"mailer"], mailer_program_id)
}

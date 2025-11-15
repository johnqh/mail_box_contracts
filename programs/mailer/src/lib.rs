//! # Native Solana Mailer Program
//!
//! A native Solana program for decentralized messaging with delegation management,
//! USDC fees and revenue sharing - no Anchor dependencies.
//!
//! ## Key Features
//!
//! - **Delegation Management**: Delegate mail handling with rejection capability  
//! - **Priority Messages**: Full fee (0.1 USDC) with 90% revenue share back to sender
//! - **Standard Messages**: 10% fee only (0.01 USDC) with no revenue share
//! - **Revenue Claims**: 60-day claim period for priority message revenue shares
//!
//! ## Program Architecture
//!
//! The program uses Program Derived Addresses (PDAs) with version byte for future-proofing:
//! - Mailer state: `[b"mailer"]` (no version - global singleton)
//! - Recipient claims: `[b"claim", &[1], recipient.key()]` (v1)
//! - Delegations: `[b"delegation", &[1], delegator.key()]` (v1)
//! - Fee discounts: `[b"discount", &[1], account.key()]` (v1)
//!
//! ## Fee Structure
//!
//! - Send Fee: 0.1 USDC (100,000 with 6 decimals)
//! - Delegation Fee: 10 USDC (10,000,000 with 6 decimals)
//! - Priority: Sender pays full fee, gets 90% back as claimable
//! - Standard: Sender pays 10% fee only
//! - Owner gets 10% of all fees

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_token::state::Account as TokenAccount;
use thiserror::Error;

// Program ID for the Native Mailer program
solana_program::declare_id!("9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF");

/// Base sending fee in USDC (with 6 decimals): 0.1 USDC
const SEND_FEE: u64 = 100_000;

/// Delegation fee in USDC (with 6 decimals): 10 USDC
const DELEGATION_FEE: u64 = 10_000_000;

/// Claim period for revenue shares: 60 days in seconds
const CLAIM_PERIOD: i64 = 60 * 24 * 60 * 60;

/// PDA version byte for forward compatibility
/// Allows future upgrades to use different PDA structures without collision
const PDA_VERSION: u8 = 1;

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

/// Program state account
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct MailerState {
    pub owner: Pubkey,
    pub usdc_mint: Pubkey,
    pub send_fee: u64,
    pub delegation_fee: u64,
    pub owner_claimable: u64,
    pub paused: bool,
    pub fee_paused: bool,
    pub bump: u8,
}

impl MailerState {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1; // 91 bytes

    pub fn increase_owner_claimable(&mut self, amount: u64) -> Result<(), ProgramError> {
        if amount == 0 {
            return Ok(());
        }

        self.owner_claimable = self
            .owner_claimable
            .checked_add(amount)
            .ok_or(MailerError::MathOverflow)?;

        Ok(())
    }
}

/// Recipient claim account (optimized for smaller rent cost)
/// Timestamp uses i64 for long-term compatibility with EVM implementation
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct RecipientClaim {
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub bump: u8,
}

impl RecipientClaim {
    pub const LEN: usize = 32 + 8 + 8 + 1; // 49 bytes
}

/// Delegation account
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct Delegation {
    pub delegator: Pubkey,
    pub delegate: Option<Pubkey>,
    pub bump: u8,
}

impl Delegation {
    pub const LEN: usize = 32 + 1 + 32 + 1; // 66 bytes (max with Some(Pubkey))
}

/// Fee discount account for custom fee percentages
/// Stores discount (0-100) instead of percentage for cleaner default behavior
/// 0 = no discount (100% fee), 100 = full discount (0% fee, free)
#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct FeeDiscount {
    pub account: Pubkey,
    pub discount: u8, // 0-100: 0 = no discount (full fee), 100 = full discount (free)
    pub bump: u8,
}

impl FeeDiscount {
    pub const LEN: usize = 32 + 1 + 1; // 34 bytes
}

/// Instructions
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum MailerInstruction {
    /// Initialize the program
    /// Accounts:
    /// 0. `[writable, signer]` Owner account
    /// 1. `[writable]` Mailer state account (PDA)
    /// 2. `[]` System program
    Initialize { usdc_mint: Pubkey },

    /// Send message with optional revenue sharing
    /// SOFT-FAIL BEHAVIOR: Does not revert on fee payment failure. No log message emitted if payment fails.
    /// This design allows composability - calling programs won't fail if message sending fails.
    /// Monitor program logs: if transaction succeeds but no log appears, message was dropped due to fee failure.
    /// Accounts:
    /// 0. `[signer]` Sender
    /// 1. `[writable]` Recipient claim account (PDA)
    /// 2. `[]` Mailer state account (PDA)
    /// 3. `[writable]` Sender USDC account
    /// 4. `[writable]` Mailer USDC account
    /// 5. `[]` Token program
    /// 6. `[]` System program
    Send {
        to: Pubkey,
        subject: String,
        _body: String,
        revenue_share_to_receiver: bool,
        resolve_sender_to_name: bool,
    },

    /// Send prepared message with optional revenue sharing (references off-chain content via mailId)
    /// SOFT-FAIL BEHAVIOR: Does not revert on fee payment failure. See Send instruction for details.
    /// Accounts:
    /// 0. `[signer]` Sender
    /// 1. `[writable]` Recipient claim account (PDA)
    /// 2. `[]` Mailer state account (PDA)
    /// 3. `[writable]` Sender USDC account
    /// 4. `[writable]` Mailer USDC account
    /// 5. `[]` Token program
    /// 6. `[]` System program
    SendPrepared {
        to: Pubkey,
        mail_id: String,
        revenue_share_to_receiver: bool,
        resolve_sender_to_name: bool,
    },

    /// Send message to email address (no wallet address known)
    /// Charges only 10% owner fee since recipient wallet is unknown
    /// SOFT-FAIL BEHAVIOR: Does not revert on fee payment failure. See Send instruction for details.
    /// Accounts:
    /// 0. `[signer]` Sender
    /// 1. `[]` Mailer state account (PDA)
    /// 2. `[writable]` Sender USDC account
    /// 3. `[writable]` Mailer USDC account
    /// 4. `[]` Token program
    SendToEmail {
        to_email: String,
        subject: String,
        _body: String,
    },

    /// Send prepared message to email address (no wallet address known)
    /// Charges only 10% owner fee since recipient wallet is unknown
    /// SOFT-FAIL BEHAVIOR: Does not revert on fee payment failure. See Send instruction for details.
    /// Accounts:
    /// 0. `[signer]` Sender
    /// 1. `[]` Mailer state account (PDA)
    /// 2. `[writable]` Sender USDC account
    /// 3. `[writable]` Mailer USDC account
    /// 4. `[]` Token program
    SendPreparedToEmail { to_email: String, mail_id: String },

    /// Send message through webhook (referenced by webhookId)
    /// SOFT-FAIL BEHAVIOR: Does not revert on fee payment failure. See Send instruction for details.
    /// Accounts:
    /// 0. `[signer]` Sender
    /// 1. `[writable]` Recipient claim account (PDA)
    /// 2. `[]` Mailer state account (PDA)
    /// 3. `[writable]` Sender USDC account
    /// 4. `[writable]` Mailer USDC account
    /// 5. `[]` Token program
    /// 6. `[]` System program
    SendThroughWebhook {
        to: Pubkey,
        webhook_id: String,
        revenue_share_to_receiver: bool,
        resolve_sender_to_name: bool,
    },

    /// Claim recipient share
    /// TIMESTAMP DEPENDENCY: Uses Clock::get()?.unix_timestamp for expiration checks (60 days).
    /// Validators can manipulate timestamps by ±30 seconds or more. Claims near the deadline
    /// have a small risk of denial. Recommended: Claim well before the 60-day deadline.
    /// Accounts:
    /// 0. `[signer]` Recipient
    /// 1. `[writable]` Recipient claim account (PDA)
    /// 2. `[]` Mailer state account (PDA)
    /// 3. `[writable]` Recipient USDC account
    /// 4. `[writable]` Mailer USDC account
    /// 5. `[]` Token program
    ClaimRecipientShare,

    /// Claim owner share
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    /// 2. `[writable]` Owner USDC account
    /// 3. `[writable]` Mailer USDC account
    /// 4. `[]` Token program
    ClaimOwnerShare,

    /// Set send fee (owner only)
    /// WARNING: Fee changes take effect IMMEDIATELY with no time delay or notification.
    /// This allows quick response to market conditions but requires user trust.
    /// - No maximum fee cap enforced
    /// - Users with pending transactions may pay different fees than expected
    /// - Monitor program logs for FeeUpdated events
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    SetFee { new_fee: u64 },

    /// Delegate to another address
    /// WARNING: Delegation fee is NON-REFUNDABLE, even if the delegate rejects the delegation.
    /// The fee is an anti-spam measure and goes to the contract owner regardless of delegation outcome.
    /// Accounts:
    /// 0. `[signer]` Delegator
    /// 1. `[writable]` Delegation account (PDA)
    /// 2. `[]` Mailer state account (PDA)
    /// 3. `[writable]` Delegator USDC account
    /// 4. `[writable]` Mailer USDC account
    /// 5. `[]` Token program
    /// 6. `[]` System program
    DelegateTo { delegate: Option<Pubkey> },

    /// Reject delegation
    /// NOTE: Rejecting a delegation does NOT refund the delegation fee paid by the delegator.
    /// The fee is an anti-spam measure and is non-refundable by design.
    /// Accounts:
    /// 0. `[signer]` Rejector
    /// 1. `[writable]` Delegation account (PDA)
    /// 2. `[]` Mailer state account (PDA)
    RejectDelegation,

    /// Set delegation fee (owner only)
    /// WARNING: Fee changes take effect IMMEDIATELY with no time delay.
    /// See SetFee instruction for detailed implications of instant fee changes.
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    SetDelegationFee { new_fee: u64 },

    /// Set custom fee percentage for a specific address (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[]` Mailer state account (PDA)
    /// 2. `[writable]` Fee discount account (PDA)
    /// 3. `[]` Account to set custom fee for
    /// 4. `[signer]` Payer for account creation
    /// 5. `[]` System program
    SetCustomFeePercentage {
        account: Pubkey,
        percentage: u8, // 0-100: 0 = free, 100 = full fee
    },

    /// Clear custom fee percentage for a specific address (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[]` Mailer state account (PDA)
    /// 2. `[writable]` Fee discount account (PDA)
    ClearCustomFeePercentage { account: Pubkey },

    /// Pause the contract (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    /// 2. `[writable]` Owner USDC account
    /// 3. `[writable]` Mailer USDC account  
    /// 4. `[]` Token program
    Pause,

    /// Unpause the contract (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    Unpause,

    /// Distribute claimable funds (when paused)
    /// Accounts:
    /// 0. `[signer]` Anyone can call
    /// 1. `[]` Mailer state account (PDA)
    /// 2. `[writable]` Recipient claim account (PDA)
    /// 3. `[writable]` Recipient USDC account
    /// 4. `[writable]` Mailer USDC account
    /// 5. `[]` Token program
    DistributeClaimableFunds { recipient: Pubkey },

    /// Claim expired recipient shares (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    /// 2. `[writable]` Recipient claim account (PDA)
    ClaimExpiredShares { recipient: Pubkey },

    /// Emergency unpause without fund distribution (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    EmergencyUnpause,

    /// Toggle fee collection on or off (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    SetFeePaused { fee_paused: bool },
}

/// Custom program errors
#[derive(Error, Debug, Copy, Clone)]
pub enum MailerError {
    #[error("Only the owner can perform this action")]
    OnlyOwner,
    #[error("No claimable amount available")]
    NoClaimableAmount,
    #[error("Claim period has expired")]
    ClaimPeriodExpired,
    #[error("Claim period has not expired yet")]
    ClaimPeriodNotExpired,
    #[error("Invalid recipient")]
    InvalidRecipient,
    #[error("No delegation to reject")]
    NoDelegationToReject,
    #[error("Invalid delegator")]
    InvalidDelegator,
    #[error("Account already initialized")]
    AlreadyInitialized,
    #[error("Account not initialized")]
    NotInitialized,
    #[error("Invalid PDA")]
    InvalidPDA,
    #[error("Invalid account owner")]
    InvalidAccountOwner,
    #[error("Invalid token mint")]
    InvalidMint,
    #[error("Invalid token program")]
    InvalidTokenProgram,
    #[error("Contract is paused")]
    ContractPaused,
    #[error("Contract is not paused")]
    ContractNotPaused,
    #[error("Invalid percentage (must be 0-100)")]
    InvalidPercentage,
    #[error("Math overflow")]
    MathOverflow,
}

impl From<MailerError> for ProgramError {
    fn from(e: MailerError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

/// Main instruction processor
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = MailerInstruction::try_from_slice(instruction_data)?;

    match instruction {
        MailerInstruction::Initialize { usdc_mint } => {
            process_initialize(program_id, accounts, usdc_mint)
        }
        MailerInstruction::Send {
            to,
            subject,
            _body,
            revenue_share_to_receiver,
            resolve_sender_to_name,
        } => process_send(
            program_id,
            accounts,
            to,
            subject,
            _body,
            revenue_share_to_receiver,
            resolve_sender_to_name,
        ),
        MailerInstruction::SendPrepared {
            to,
            mail_id,
            revenue_share_to_receiver,
            resolve_sender_to_name,
        } => process_send_prepared(
            program_id,
            accounts,
            to,
            mail_id,
            revenue_share_to_receiver,
            resolve_sender_to_name,
        ),
        MailerInstruction::SendToEmail {
            to_email,
            subject,
            _body,
        } => process_send_to_email(program_id, accounts, to_email, subject, _body),
        MailerInstruction::SendPreparedToEmail { to_email, mail_id } => {
            process_send_prepared_to_email(program_id, accounts, to_email, mail_id)
        }
        MailerInstruction::SendThroughWebhook {
            to,
            webhook_id,
            revenue_share_to_receiver,
            resolve_sender_to_name,
        } => process_send_through_webhook(
            program_id,
            accounts,
            to,
            webhook_id,
            revenue_share_to_receiver,
            resolve_sender_to_name,
        ),
        MailerInstruction::ClaimRecipientShare => {
            process_claim_recipient_share(program_id, accounts)
        }
        MailerInstruction::ClaimOwnerShare => process_claim_owner_share(program_id, accounts),
        MailerInstruction::SetFee { new_fee } => process_set_fee(program_id, accounts, new_fee),
        MailerInstruction::DelegateTo { delegate } => {
            process_delegate_to(program_id, accounts, delegate)
        }
        MailerInstruction::RejectDelegation => process_reject_delegation(program_id, accounts),
        MailerInstruction::SetDelegationFee { new_fee } => {
            process_set_delegation_fee(program_id, accounts, new_fee)
        }
        MailerInstruction::SetCustomFeePercentage {
            account,
            percentage,
        } => process_set_custom_fee_percentage(program_id, accounts, account, percentage),
        MailerInstruction::ClearCustomFeePercentage { account } => {
            process_clear_custom_fee_percentage(program_id, accounts, account)
        }
        MailerInstruction::Pause => process_pause(program_id, accounts),
        MailerInstruction::Unpause => process_unpause(program_id, accounts),
        MailerInstruction::DistributeClaimableFunds { recipient } => {
            process_distribute_claimable_funds(program_id, accounts, recipient)
        }
        MailerInstruction::ClaimExpiredShares { recipient } => {
            process_claim_expired_shares(program_id, accounts, recipient)
        }
        MailerInstruction::EmergencyUnpause => process_emergency_unpause(program_id, accounts),
        MailerInstruction::SetFeePaused { fee_paused } => {
            process_set_fee_paused(program_id, accounts, fee_paused)
        }
    }
}

/// Initialize the program
fn process_initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    usdc_mint: Pubkey,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify mailer account PDA
    let (mailer_pda, bump) = Pubkey::find_program_address(&[b"mailer"], program_id);
    if mailer_account.key != &mailer_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    // Create mailer account
    let rent = Rent::get()?;
    let space = 8 + MailerState::LEN; // 8 bytes for discriminator
    let lamports = rent.minimum_balance(space);

    invoke_signed(
        &system_instruction::create_account(
            owner.key,
            mailer_account.key,
            lamports,
            space as u64,
            program_id,
        ),
        &[
            owner.clone(),
            mailer_account.clone(),
            system_program.clone(),
        ],
        &[&[b"mailer", &[bump]]],
    )?;

    // Initialize state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    mailer_data[0..8].copy_from_slice(&hash_discriminator("account:MailerState").to_le_bytes());

    let mailer_state = MailerState {
        owner: *owner.key,
        usdc_mint,
        send_fee: SEND_FEE,
        delegation_fee: DELEGATION_FEE,
        owner_claimable: 0,
        paused: false,
        fee_paused: false,
        bump,
    };

    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Mailer initialized with owner: {}", owner.key);
    Ok(())
}

/// Send message with optional revenue sharing
fn process_send(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    to: Pubkey,
    subject: String,
    _body: String,
    revenue_share_to_receiver: bool,
    _resolve_sender_to_name: bool,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let sender = next_account_info(account_iter)?;
    let recipient_claim = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let sender_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !sender.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Load mailer state
    let (mailer_pda, _) = assert_mailer_account(program_id, mailer_account)?;
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(sender_usdc, sender.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Calculate effective fee based on custom discount (if any), or skip if fee_paused
    let effective_fee = if mailer_state.fee_paused {
        0 // Skip fee collection when fee_paused is true
    } else {
        calculate_fee_with_discount(program_id, sender.key, accounts, mailer_state.send_fee)?
    };

    if revenue_share_to_receiver {
        // Priority mode: full fee with revenue sharing

        // Create or load recipient claim account
        let (claim_pda, claim_bump) =
            Pubkey::find_program_address(&[b"claim", &[PDA_VERSION], to.as_ref()], program_id);

        if recipient_claim.key != &claim_pda {
            return Err(MailerError::InvalidPDA.into());
        }

        // Create claim account if needed
        if recipient_claim.lamports() == 0 {
            let rent = Rent::get()?;
            let space = 8 + RecipientClaim::LEN;
            let lamports = rent.minimum_balance(space);

            invoke_signed(
                &system_instruction::create_account(
                    sender.key,
                    recipient_claim.key,
                    lamports,
                    space as u64,
                    program_id,
                ),
                &[
                    sender.clone(),
                    recipient_claim.clone(),
                    system_program.clone(),
                ],
                &[&[b"claim", &[PDA_VERSION], to.as_ref(), &[claim_bump]]],
            )?;

            // Verify account is rent-exempt
            let account_lamports = recipient_claim.lamports();
            if !rent.is_exempt(account_lamports, space) {
                msg!("ERROR: Recipient claim account not rent-exempt! {} lamports for {} bytes",
                     account_lamports, space);
                return Err(ProgramError::InsufficientFunds);
            }
            msg!("Created rent-exempt recipient claim account: {} lamports for {} bytes",
                 account_lamports, space);

            // Initialize claim account
            let mut claim_data = recipient_claim.try_borrow_mut_data()?;
            claim_data[0..8]
                .copy_from_slice(&hash_discriminator("account:RecipientClaim").to_le_bytes());

            let claim_state = RecipientClaim {
                recipient: to,
                amount: 0,
                timestamp: 0,
                bump: claim_bump,
            };

            claim_state.serialize(&mut &mut claim_data[8..])?;
            drop(claim_data);
        }

        // Transfer effective fee (may be discounted)
        // If transfer fails, silently fail without emitting event
        if effective_fee > 0 {
            let transfer_result = invoke(
                &spl_token::instruction::transfer(
                    token_program.key,
                    sender_usdc.key,
                    mailer_usdc.key,
                    sender.key,
                    &[],
                    effective_fee,
                )?,
                &[
                    sender_usdc.clone(),
                    mailer_usdc.clone(),
                    sender.clone(),
                    token_program.clone(),
                ],
            );

            // If transfer fails, return Ok without logging
            if transfer_result.is_err() {
                return Ok(());
            }

            // Record revenue shares (only if fee > 0 and transfer succeeded)
            if record_shares(recipient_claim, mailer_account, to, effective_fee).is_err() {
                return Ok(());
            }
        }

        msg!("Priority mail sent from {} to {}: {} (revenue share enabled, resolve sender: {}, effective fee: {})", sender.key, to, subject, _resolve_sender_to_name, effective_fee);
    } else {
        // Standard mode: 10% fee only, no revenue sharing
        let owner_fee = (effective_fee * 10) / 100; // 10% of effective fee

        // Transfer only owner fee (10%)
        // If transfer fails, silently fail without emitting event
        if owner_fee > 0 {
            let transfer_result = invoke(
                &spl_token::instruction::transfer(
                    token_program.key,
                    sender_usdc.key,
                    mailer_usdc.key,
                    sender.key,
                    &[],
                    owner_fee,
                )?,
                &[
                    sender_usdc.clone(),
                    mailer_usdc.clone(),
                    sender.clone(),
                    token_program.clone(),
                ],
            );

            // If transfer fails, return Ok without logging
            if transfer_result.is_err() {
                return Ok(());
            }
        }

        // Update owner claimable
        let mut mailer_data = mailer_account.try_borrow_mut_data()?;
        let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
        mailer_state.increase_owner_claimable(owner_fee)?;
        mailer_state.serialize(&mut &mut mailer_data[8..])?;

        msg!(
            "Standard mail sent from {} to {}: {} (resolve sender: {}, effective fee: {})",
            sender.key,
            to,
            subject,
            _resolve_sender_to_name,
            effective_fee
        );
    }

    Ok(())
}

/// Send prepared message with optional revenue sharing (references off-chain content via mailId)
fn process_send_prepared(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    to: Pubkey,
    mail_id: String,
    revenue_share_to_receiver: bool,
    _resolve_sender_to_name: bool,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let sender = next_account_info(account_iter)?;
    let recipient_claim = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let sender_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !sender.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Load mailer state
    let (mailer_pda, _) = assert_mailer_account(program_id, mailer_account)?;
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(sender_usdc, sender.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Calculate effective fee based on custom discount (if any), or skip if fee_paused
    let effective_fee = if mailer_state.fee_paused {
        0 // Skip fee collection when fee_paused is true
    } else {
        calculate_fee_with_discount(program_id, sender.key, accounts, mailer_state.send_fee)?
    };

    if revenue_share_to_receiver {
        // Priority mode: full fee with revenue sharing

        // Create or load recipient claim account
        let (claim_pda, claim_bump) =
            Pubkey::find_program_address(&[b"claim", &[PDA_VERSION], to.as_ref()], program_id);

        if recipient_claim.key != &claim_pda {
            return Err(MailerError::InvalidPDA.into());
        }

        // Create claim account if needed
        if recipient_claim.lamports() == 0 {
            let rent = Rent::get()?;
            let space = 8 + RecipientClaim::LEN;
            let lamports = rent.minimum_balance(space);

            invoke_signed(
                &system_instruction::create_account(
                    sender.key,
                    recipient_claim.key,
                    lamports,
                    space as u64,
                    program_id,
                ),
                &[
                    sender.clone(),
                    recipient_claim.clone(),
                    system_program.clone(),
                ],
                &[&[b"claim", &[PDA_VERSION], to.as_ref(), &[claim_bump]]],
            )?;

            // Verify account is rent-exempt
            let account_lamports = recipient_claim.lamports();
            if !rent.is_exempt(account_lamports, space) {
                msg!("ERROR: Recipient claim account not rent-exempt! {} lamports for {} bytes",
                     account_lamports, space);
                return Err(ProgramError::InsufficientFunds);
            }
            msg!("Created rent-exempt recipient claim account: {} lamports for {} bytes",
                 account_lamports, space);

            // Initialize claim account
            let mut claim_data = recipient_claim.try_borrow_mut_data()?;
            claim_data[0..8]
                .copy_from_slice(&hash_discriminator("account:RecipientClaim").to_le_bytes());

            let claim_state = RecipientClaim {
                recipient: to,
                amount: 0,
                timestamp: 0,
                bump: claim_bump,
            };

            claim_state.serialize(&mut &mut claim_data[8..])?;
            drop(claim_data);
        }

        // Transfer effective fee (may be discounted)
        if effective_fee > 0 {
            let transfer_result = invoke(
                &spl_token::instruction::transfer(
                    token_program.key,
                    sender_usdc.key,
                    mailer_usdc.key,
                    sender.key,
                    &[],
                    effective_fee,
                )?,
                &[
                    sender_usdc.clone(),
                    mailer_usdc.clone(),
                    sender.clone(),
                    token_program.clone(),
                ],
            );

            if transfer_result.is_err() {
                return Ok(());
            }

            // Record revenue shares (only if fee > 0)
            if record_shares(recipient_claim, mailer_account, to, effective_fee).is_err() {
                return Ok(());
            }
        }

        msg!("Priority prepared mail sent from {} to {} (mailId: {}, revenue share enabled, resolve sender: {}, effective fee: {})", sender.key, to, mail_id, _resolve_sender_to_name, effective_fee);
    } else {
        // Standard mode: 10% fee only, no revenue sharing
        let owner_fee = (effective_fee * 10) / 100; // 10% of effective fee

        // Transfer only owner fee (10%)
        if owner_fee > 0 {
            let transfer_result = invoke(
                &spl_token::instruction::transfer(
                    token_program.key,
                    sender_usdc.key,
                    mailer_usdc.key,
                    sender.key,
                    &[],
                    owner_fee,
                )?,
                &[
                    sender_usdc.clone(),
                    mailer_usdc.clone(),
                    sender.clone(),
                    token_program.clone(),
                ],
            );

            if transfer_result.is_err() {
                return Ok(());
            }
        }

        // Update owner claimable
        let mut mailer_data = mailer_account.try_borrow_mut_data()?;
        let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
        mailer_state.increase_owner_claimable(owner_fee)?;
        mailer_state.serialize(&mut &mut mailer_data[8..])?;

        msg!(
            "Standard prepared mail sent from {} to {} (mailId: {}, resolve sender: {}, effective fee: {})",
            sender.key,
            to,
            mail_id,
            _resolve_sender_to_name,
            effective_fee
        );
    }

    Ok(())
}

/// Process send to email address (no wallet known, only owner fee)
fn process_send_to_email(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    to_email: String,
    subject: String,
    _body: String,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let sender = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let sender_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;

    if !sender.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Load mailer state
    let (mailer_pda, _) = assert_mailer_account(_program_id, mailer_account)?;
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(sender_usdc, sender.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Calculate effective fee based on custom discount (if any), or skip if fee_paused
    let effective_fee = if mailer_state.fee_paused {
        0 // Skip fee collection when fee_paused is true
    } else {
        calculate_fee_with_discount(_program_id, sender.key, accounts, mailer_state.send_fee)?
    };

    // Calculate 10% owner fee (no revenue share since no wallet address)
    let owner_fee = (effective_fee * 10) / 100;

    // Transfer fee from sender to mailer
    if owner_fee > 0 {
        let transfer_ix = spl_token::instruction::transfer(
            token_program.key,
            sender_usdc.key,
            mailer_usdc.key,
            sender.key,
            &[],
            owner_fee,
        )?;

        let transfer_result = invoke(
            &transfer_ix,
            &[
                sender_usdc.clone(),
                mailer_usdc.clone(),
                sender.clone(),
                token_program.clone(),
            ],
        );

        if transfer_result.is_err() {
            return Ok(());
        }
    }

    // Update owner claimable
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    mailer_state.increase_owner_claimable(owner_fee)?;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!(
        "Mail sent from {} to email {}: {} (effective fee: {})",
        sender.key,
        to_email,
        subject,
        effective_fee
    );

    Ok(())
}

/// Process send prepared to email address (no wallet known, only owner fee)
fn process_send_prepared_to_email(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    to_email: String,
    mail_id: String,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let sender = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let sender_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;

    if !sender.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Load mailer state
    let (mailer_pda, _) = assert_mailer_account(_program_id, mailer_account)?;
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(sender_usdc, sender.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Calculate effective fee based on custom discount (if any), or skip if fee_paused
    let effective_fee = if mailer_state.fee_paused {
        0 // Skip fee collection when fee_paused is true
    } else {
        calculate_fee_with_discount(_program_id, sender.key, accounts, mailer_state.send_fee)?
    };

    // Calculate 10% owner fee (no revenue share since no wallet address)
    let owner_fee = (effective_fee * 10) / 100;

    // Transfer fee from sender to mailer
    if owner_fee > 0 {
        let transfer_ix = spl_token::instruction::transfer(
            token_program.key,
            sender_usdc.key,
            mailer_usdc.key,
            sender.key,
            &[],
            owner_fee,
        )?;

        let transfer_result = invoke(
            &transfer_ix,
            &[
                sender_usdc.clone(),
                mailer_usdc.clone(),
                sender.clone(),
                token_program.clone(),
            ],
        );

        if transfer_result.is_err() {
            return Ok(());
        }
    }

    // Update owner claimable
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    mailer_state.increase_owner_claimable(owner_fee)?;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!(
        "Prepared mail sent from {} to email {} (mailId: {}, effective fee: {})",
        sender.key,
        to_email,
        mail_id,
        effective_fee
    );

    Ok(())
}

/// Send message through webhook (references webhook by webhookId)
fn process_send_through_webhook(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    to: Pubkey,
    webhook_id: String,
    revenue_share_to_receiver: bool,
    _resolve_sender_to_name: bool,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let sender = next_account_info(account_iter)?;
    let recipient_claim = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let sender_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !sender.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Load mailer state
    let (mailer_pda, _) = assert_mailer_account(program_id, mailer_account)?;
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(sender_usdc, sender.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Calculate effective fee based on custom discount (if any), or skip if fee_paused
    let effective_fee = if mailer_state.fee_paused {
        0 // Skip fee collection when fee_paused is true
    } else {
        calculate_fee_with_discount(program_id, sender.key, accounts, mailer_state.send_fee)?
    };

    if revenue_share_to_receiver {
        // Priority mode: full fee with revenue sharing

        // Create or load recipient claim account
        let (claim_pda, claim_bump) =
            Pubkey::find_program_address(&[b"claim", &[PDA_VERSION], to.as_ref()], program_id);

        if recipient_claim.key != &claim_pda {
            return Err(MailerError::InvalidPDA.into());
        }

        // Create claim account if needed
        if recipient_claim.lamports() == 0 {
            let rent = Rent::get()?;
            let space = 8 + RecipientClaim::LEN;
            let lamports = rent.minimum_balance(space);

            invoke_signed(
                &system_instruction::create_account(
                    sender.key,
                    recipient_claim.key,
                    lamports,
                    space as u64,
                    program_id,
                ),
                &[
                    sender.clone(),
                    recipient_claim.clone(),
                    system_program.clone(),
                ],
                &[&[b"claim", &[PDA_VERSION], to.as_ref(), &[claim_bump]]],
            )?;

            // Verify account is rent-exempt
            let account_lamports = recipient_claim.lamports();
            if !rent.is_exempt(account_lamports, space) {
                msg!("ERROR: Recipient claim account not rent-exempt! {} lamports for {} bytes",
                     account_lamports, space);
                return Err(ProgramError::InsufficientFunds);
            }
            msg!("Created rent-exempt recipient claim account: {} lamports for {} bytes",
                 account_lamports, space);

            // Initialize claim account
            let mut claim_data = recipient_claim.try_borrow_mut_data()?;
            claim_data[0..8]
                .copy_from_slice(&hash_discriminator("account:RecipientClaim").to_le_bytes());

            let claim_state = RecipientClaim {
                recipient: to,
                amount: 0,
                timestamp: 0,
                bump: claim_bump,
            };

            claim_state.serialize(&mut &mut claim_data[8..])?;
            drop(claim_data);
        }

        // Transfer effective fee (may be discounted)
        if effective_fee > 0 {
            let transfer_result = invoke(
                &spl_token::instruction::transfer(
                    token_program.key,
                    sender_usdc.key,
                    mailer_usdc.key,
                    sender.key,
                    &[],
                    effective_fee,
                )?,
                &[
                    sender_usdc.clone(),
                    mailer_usdc.clone(),
                    sender.clone(),
                    token_program.clone(),
                ],
            );

            if transfer_result.is_err() {
                return Ok(());
            }

            // Record revenue shares (only if fee > 0)
            if record_shares(recipient_claim, mailer_account, to, effective_fee).is_err() {
                return Ok(());
            }
        }

        msg!("Webhook mail sent from {} to {} (webhookId: {}, revenue share enabled, resolve sender: {}, effective fee: {})", sender.key, to, webhook_id, _resolve_sender_to_name, effective_fee);
    } else {
        // Standard mode: 10% fee only, no revenue sharing
        let owner_fee = (effective_fee * 10) / 100; // 10% of effective fee

        // Transfer only owner fee (10%)
        if owner_fee > 0 {
            let transfer_result = invoke(
                &spl_token::instruction::transfer(
                    token_program.key,
                    sender_usdc.key,
                    mailer_usdc.key,
                    sender.key,
                    &[],
                    owner_fee,
                )?,
                &[
                    sender_usdc.clone(),
                    mailer_usdc.clone(),
                    sender.clone(),
                    token_program.clone(),
                ],
            );

            if transfer_result.is_err() {
                return Ok(());
            }
        }

        // Update owner claimable
        let mut mailer_data = mailer_account.try_borrow_mut_data()?;
        let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
        mailer_state.increase_owner_claimable(owner_fee)?;
        mailer_state.serialize(&mut &mut mailer_data[8..])?;

        msg!(
            "Webhook mail sent from {} to {} (webhookId: {}, resolve sender: {}, effective fee: {})",
            sender.key,
            to,
            webhook_id,
            _resolve_sender_to_name,
            effective_fee
        );
    }

    Ok(())
}

/// Process claim recipient share
fn process_claim_recipient_share(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let recipient = next_account_info(account_iter)?;
    let recipient_claim = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let recipient_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;

    if !recipient.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (mailer_pda, _) = assert_mailer_account(_program_id, mailer_account)?;
    let (claim_pda, _) =
        Pubkey::find_program_address(&[b"claim", &[PDA_VERSION], recipient.key.as_ref()], _program_id);
    if recipient_claim.key != &claim_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    // Load claim state
    let mut claim_data = recipient_claim.try_borrow_mut_data()?;
    let mut claim_state: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_data[8..])?;

    if claim_state.recipient != *recipient.key {
        return Err(MailerError::InvalidRecipient.into());
    }

    if claim_state.amount == 0 {
        return Err(MailerError::NoClaimableAmount.into());
    }

    // Check if claim period has expired
    let current_time = Clock::get()?.unix_timestamp;
    if current_time > claim_state.timestamp + CLAIM_PERIOD {
        return Err(MailerError::ClaimPeriodExpired.into());
    }

    let amount = claim_state.amount;
    claim_state.amount = 0;
    claim_state.timestamp = 0;
    claim_state.serialize(&mut &mut claim_data[8..])?;

    // Load mailer state for PDA signing
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(recipient_usdc, recipient.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Transfer USDC from mailer to recipient
    invoke_signed(
        &spl_token::instruction::transfer(
            token_program.key,
            mailer_usdc.key,
            recipient_usdc.key,
            mailer_account.key,
            &[],
            amount,
        )?,
        &[
            mailer_usdc.clone(),
            recipient_usdc.clone(),
            mailer_account.clone(),
            token_program.clone(),
        ],
        &[&[b"mailer", &[mailer_state.bump]]],
    )?;

    msg!("Recipient {} claimed {}", recipient.key, amount);
    Ok(())
}

/// Process claim owner share
fn process_claim_owner_share(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let owner_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (mailer_pda, _) = assert_mailer_account(_program_id, mailer_account)?;

    // Load and update mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    if mailer_state.owner_claimable == 0 {
        return Err(MailerError::NoClaimableAmount.into());
    }

    let amount = mailer_state.owner_claimable;
    mailer_state.owner_claimable = 0;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(owner_usdc, owner.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Transfer USDC from mailer to owner
    invoke_signed(
        &spl_token::instruction::transfer(
            token_program.key,
            mailer_usdc.key,
            owner_usdc.key,
            mailer_account.key,
            &[],
            amount,
        )?,
        &[
            mailer_usdc.clone(),
            owner_usdc.clone(),
            mailer_account.clone(),
            token_program.clone(),
        ],
        &[&[b"mailer", &[mailer_state.bump]]],
    )?;

    msg!("Owner {} claimed {}", owner.key, amount);
    Ok(())
}

/// Set send fee (owner only)
fn process_set_fee(_program_id: &Pubkey, accounts: &[AccountInfo], new_fee: u64) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    assert_mailer_account(_program_id, mailer_account)?;

    // Load and update mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    let old_fee = mailer_state.send_fee;
    mailer_state.send_fee = new_fee;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Fee updated from {} to {}", old_fee, new_fee);
    Ok(())
}

/// Delegate to another address
fn process_delegate_to(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    delegate: Option<Pubkey>,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let delegator = next_account_info(account_iter)?;
    let delegation_account = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let delegator_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !delegator.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (mailer_pda, _) = assert_mailer_account(program_id, mailer_account)?;

    // Load mailer state
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    assert_token_program(token_program)?;
    assert_token_account(delegator_usdc, delegator.key, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Verify delegation account PDA
    let (delegation_pda, delegation_bump) =
        Pubkey::find_program_address(&[b"delegation", &[PDA_VERSION], delegator.key.as_ref()], program_id);

    if delegation_account.key != &delegation_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    // Create delegation account if needed
    if delegation_account.lamports() == 0 {
        let rent = Rent::get()?;
        let space = 8 + Delegation::LEN;
        let lamports = rent.minimum_balance(space);

        invoke_signed(
            &system_instruction::create_account(
                delegator.key,
                delegation_account.key,
                lamports,
                space as u64,
                program_id,
            ),
            &[
                delegator.clone(),
                delegation_account.clone(),
                system_program.clone(),
            ],
            &[&[b"delegation", &[PDA_VERSION], delegator.key.as_ref(), &[delegation_bump]]],
        )?;

        // Verify account is rent-exempt
        let account_lamports = delegation_account.lamports();
        if !rent.is_exempt(account_lamports, space) {
            msg!("ERROR: Delegation account not rent-exempt! {} lamports for {} bytes",
                 account_lamports, space);
            return Err(ProgramError::InsufficientFunds);
        }
        msg!("Created rent-exempt delegation account: {} lamports for {} bytes",
             account_lamports, space);

        // Initialize delegation account
        let mut delegation_data = delegation_account.try_borrow_mut_data()?;
        delegation_data[0..8]
            .copy_from_slice(&hash_discriminator("account:Delegation").to_le_bytes());

        let delegation_state = Delegation {
            delegator: *delegator.key,
            delegate: None,
            bump: delegation_bump,
        };

        delegation_state.serialize(&mut &mut delegation_data[8..])?;
        drop(delegation_data);
    }

    // If setting delegation (not clearing), charge fee (unless fee_paused)
    if let Some(delegate_key) = delegate {
        if delegate_key != Pubkey::default() && !mailer_state.fee_paused {
            invoke(
                &spl_token::instruction::transfer(
                    token_program.key,
                    delegator_usdc.key,
                    mailer_usdc.key,
                    delegator.key,
                    &[],
                    mailer_state.delegation_fee,
                )?,
                &[
                    delegator_usdc.clone(),
                    mailer_usdc.clone(),
                    delegator.clone(),
                    token_program.clone(),
                ],
            )?;

            // Mirror EVM behavior: delegation fees become owner-claimable
            let mut mailer_data_mut = mailer_account.try_borrow_mut_data()?;
            let mut mailer_state_mut: MailerState =
                BorshDeserialize::deserialize(&mut &mailer_data_mut[8..])?;
            mailer_state_mut.increase_owner_claimable(mailer_state.delegation_fee)?;
            mailer_state_mut.serialize(&mut &mut mailer_data_mut[8..])?;
            drop(mailer_data_mut);
        }
    }

    // Update delegation
    let mut delegation_data = delegation_account.try_borrow_mut_data()?;
    let mut delegation_state: Delegation =
        BorshDeserialize::deserialize(&mut &delegation_data[8..])?;
    delegation_state.delegate = delegate;
    delegation_state.serialize(&mut &mut delegation_data[8..])?;

    msg!("Delegation set from {} to {:?}", delegator.key, delegate);
    Ok(())
}

/// Reject delegation
fn process_reject_delegation(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let rejector = next_account_info(account_iter)?;
    let delegation_account = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;

    if !rejector.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify mailer state PDA and ensure contract is not paused
    let (_mailer_pda, _) = assert_mailer_account(program_id, mailer_account)?;

    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Load and update delegation state
    let mut delegation_data = delegation_account.try_borrow_mut_data()?;
    let mut delegation_state: Delegation =
        BorshDeserialize::deserialize(&mut &delegation_data[8..])?;

    // Verify the rejector is the current delegate
    if delegation_state.delegate != Some(*rejector.key) {
        return Err(MailerError::NoDelegationToReject.into());
    }

    delegation_state.delegate = None;
    delegation_state.serialize(&mut &mut delegation_data[8..])?;

    msg!("Delegation rejected by {}", rejector.key);
    Ok(())
}

/// Set delegation fee (owner only)
fn process_set_delegation_fee(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    new_fee: u64,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    assert_mailer_account(_program_id, mailer_account)?;

    // Load and update mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    let old_fee = mailer_state.delegation_fee;
    mailer_state.delegation_fee = new_fee;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Delegation fee updated from {} to {}", old_fee, new_fee);
    Ok(())
}

/// Set custom fee percentage for a specific address (owner only)
fn process_set_custom_fee_percentage(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    account: Pubkey,
    percentage: u8,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let fee_discount_account = next_account_info(account_iter)?;
    let _target_account = next_account_info(account_iter)?;
    let payer = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    assert_mailer_account(program_id, mailer_account)?;

    // Load mailer state and verify owner
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Validate percentage
    if percentage > 100 {
        return Err(MailerError::InvalidPercentage.into());
    }

    // Verify fee discount account PDA
    let (discount_pda, bump) =
        Pubkey::find_program_address(&[b"discount", &[PDA_VERSION], account.as_ref()], program_id);

    if fee_discount_account.key != &discount_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    // Create or update fee discount account
    if fee_discount_account.lamports() == 0 {
        let rent = Rent::get()?;
        let space = 8 + FeeDiscount::LEN;
        let lamports = rent.minimum_balance(space);

        invoke_signed(
            &system_instruction::create_account(
                payer.key,
                fee_discount_account.key,
                lamports,
                space as u64,
                program_id,
            ),
            &[
                payer.clone(),
                fee_discount_account.clone(),
                system_program.clone(),
            ],
            &[&[b"discount", &[PDA_VERSION], account.as_ref(), &[bump]]],
        )?;

        // Verify account is rent-exempt
        let account_lamports = fee_discount_account.lamports();
        if !rent.is_exempt(account_lamports, space) {
            msg!("ERROR: Fee discount account not rent-exempt! {} lamports for {} bytes",
                 account_lamports, space);
            return Err(ProgramError::InsufficientFunds);
        }
        msg!("Created rent-exempt fee discount account: {} lamports for {} bytes",
             account_lamports, space);

        // Initialize discount account
        let mut discount_data = fee_discount_account.try_borrow_mut_data()?;
        discount_data[0..8]
            .copy_from_slice(&hash_discriminator("account:FeeDiscount").to_le_bytes());

        let fee_discount = FeeDiscount {
            account,
            discount: 100 - percentage, // Store as discount: 0% fee = 100 discount, 100% fee = 0 discount
            bump,
        };

        fee_discount.serialize(&mut &mut discount_data[8..])?;
    } else {
        // Update existing discount account
        let mut discount_data = fee_discount_account.try_borrow_mut_data()?;
        let mut fee_discount: FeeDiscount =
            BorshDeserialize::deserialize(&mut &discount_data[8..])?;
        fee_discount.discount = 100 - percentage; // Store as discount
        fee_discount.serialize(&mut &mut discount_data[8..])?;
    }

    msg!("Custom fee percentage set for {}: {}%", account, percentage);
    Ok(())
}

/// Clear custom fee percentage for a specific address (owner only)
fn process_clear_custom_fee_percentage(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    account: Pubkey,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let fee_discount_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    assert_mailer_account(program_id, mailer_account)?;

    // Load mailer state and verify owner
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Verify fee discount account PDA
    let (discount_pda, _) =
        Pubkey::find_program_address(&[b"discount", &[PDA_VERSION], account.as_ref()], program_id);

    if fee_discount_account.key != &discount_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    // Clear by setting discount to 0 (no discount = 100% fee = default behavior)
    if fee_discount_account.lamports() > 0 {
        let mut discount_data = fee_discount_account.try_borrow_mut_data()?;
        let mut fee_discount: FeeDiscount =
            BorshDeserialize::deserialize(&mut &discount_data[8..])?;
        fee_discount.discount = 0; // 0 discount = 100% fee = default
        fee_discount.serialize(&mut &mut discount_data[8..])?;
    }

    msg!(
        "Custom fee percentage cleared for {} (reset to 100%)",
        account
    );
    Ok(())
}

fn assert_token_program(token_program: &AccountInfo) -> Result<(), ProgramError> {
    if token_program.key != &spl_token::id() {
        return Err(MailerError::InvalidTokenProgram.into());
    }
    Ok(())
}

fn assert_token_account(
    token_account_info: &AccountInfo,
    expected_owner: &Pubkey,
    expected_mint: &Pubkey,
) -> Result<(), ProgramError> {
    let data = token_account_info.try_borrow_data()?;
    let token_account = TokenAccount::unpack(&data)?;
    drop(data);

    if token_account.owner != *expected_owner {
        return Err(MailerError::InvalidAccountOwner.into());
    }

    if token_account.mint != *expected_mint {
        return Err(MailerError::InvalidMint.into());
    }

    Ok(())
}

fn assert_mailer_account(
    program_id: &Pubkey,
    mailer_account: &AccountInfo,
) -> Result<(Pubkey, u8), ProgramError> {
    let (mailer_pda, bump) = Pubkey::find_program_address(&[b"mailer"], program_id);
    if mailer_account.key != &mailer_pda {
        return Err(MailerError::InvalidPDA.into());
    }
    Ok((mailer_pda, bump))
}

/// Record revenue shares for priority messages
fn record_shares(
    recipient_claim: &AccountInfo,
    mailer_account: &AccountInfo,
    recipient: Pubkey,
    total_amount: u64,
) -> ProgramResult {
    let owner_amount = total_amount / 10; // 10% of total_amount
    let recipient_amount = total_amount - owner_amount;

    // Update recipient's claimable amount and refresh the timestamp to extend the 60-day window
    let mut claim_data = recipient_claim.try_borrow_mut_data()?;
    let mut claim_state: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_data[8..])?;

    claim_state.recipient = recipient;
    claim_state.amount += recipient_amount;
    claim_state.timestamp = Clock::get()?.unix_timestamp;
    claim_state.serialize(&mut &mut claim_data[8..])?;
    drop(claim_data);

    // Update owner's claimable amount
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    mailer_state.increase_owner_claimable(owner_amount)?;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!(
        "Shares recorded: recipient {}, owner {}",
        recipient_amount,
        owner_amount
    );
    Ok(())
}

/// Calculate the effective fee for an account based on custom discount
/// Optimized with early returns for common cases (no discount, full discount)
fn calculate_fee_with_discount(
    program_id: &Pubkey,
    account: &Pubkey,
    accounts: &[AccountInfo],
    base_fee: u64,
) -> Result<u64, ProgramError> {
    // Try to find fee discount account
    let (discount_pda, _) =
        Pubkey::find_program_address(&[b"discount", &[PDA_VERSION], account.as_ref()], program_id);

    // Check if any account in the accounts slice matches the discount PDA
    let discount_account = accounts.iter().find(|acc| acc.key == &discount_pda);

    if let Some(discount_acc) = discount_account {
        // Account exists and has lamports - load the discount
        if discount_acc.lamports() > 0 {
            let discount_data = discount_acc.try_borrow_data()?;
            if discount_data.len() >= 8 + FeeDiscount::LEN {
                let fee_discount: FeeDiscount =
                    BorshDeserialize::deserialize(&mut &discount_data[8..])?;
                let discount = fee_discount.discount;

                // Early return for no discount (most common case - saves computation)
                if discount == 0 {
                    return Ok(base_fee);
                }

                // Early return for full discount (free)
                if discount == 100 {
                    return Ok(0);
                }

                // Apply discount: fee = base_fee * (100 - discount) / 100
                // Examples: discount=50 → 50% fee, discount=25 → 75% fee
                let effective_fee = (base_fee * (100 - discount as u64)) / 100;
                return Ok(effective_fee);
            }
        }
    }

    // No discount account or uninitialized - use full fee (default behavior)
    Ok(base_fee)
}

/// Pause the contract and distribute owner claimable funds
fn process_pause(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let owner_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (mailer_pda, _) = assert_mailer_account(_program_id, mailer_account)?;

    // Load and update mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    // Verify owner
    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Check if already paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Set paused state
    mailer_state.paused = true;

    assert_token_program(token_program)?;

    // Distribute owner claimable funds if any
    if mailer_state.owner_claimable > 0 {
        let amount = mailer_state.owner_claimable;
        mailer_state.owner_claimable = 0;

        assert_token_account(owner_usdc, owner.key, &mailer_state.usdc_mint)?;
        assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

        // Save updated state BEFORE external call (CEI pattern)
        mailer_state.serialize(&mut &mut mailer_data[8..])?;
        drop(mailer_data); // Release borrow before external call

        // Transfer USDC from mailer to owner
        invoke_signed(
            &spl_token::instruction::transfer(
                token_program.key,
                mailer_usdc.key,
                owner_usdc.key,
                &mailer_pda,
                &[],
                amount,
            )?,
            &[
                mailer_usdc.clone(),
                owner_usdc.clone(),
                mailer_account.clone(),
                token_program.clone(),
            ],
            &[&[b"mailer", &[mailer_state.bump]]],
        )?;

        msg!("Distributed owner funds during pause: {}", amount);
    } else {
        // Save updated state even if no distribution
        mailer_state.serialize(&mut &mut mailer_data[8..])?;
    }

    msg!("Contract paused by owner: {}", owner.key);
    Ok(())
}

/// Unpause the contract
fn process_unpause(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    assert_mailer_account(_program_id, mailer_account)?;

    // Load and update mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    // Verify owner
    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Check if not paused
    if !mailer_state.paused {
        return Err(MailerError::ContractNotPaused.into());
    }

    // Set unpaused state
    mailer_state.paused = false;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Contract unpaused by owner: {}", owner.key);
    Ok(())
}

/// Distribute claimable funds when contract is paused
fn process_distribute_claimable_funds(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    recipient: Pubkey,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let _caller = next_account_info(account_iter)?; // Anyone can call
    let mailer_account = next_account_info(account_iter)?;
    let recipient_claim_account = next_account_info(account_iter)?;
    let recipient_usdc = next_account_info(account_iter)?;
    let mailer_usdc = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;

    let (mailer_pda, _) = assert_mailer_account(_program_id, mailer_account)?;

    // Load mailer state to check if paused
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    // Check if contract is paused
    if !mailer_state.paused {
        return Err(MailerError::ContractNotPaused.into());
    }

    // Verify recipient claim PDA
    let (claim_pda, _) = Pubkey::find_program_address(&[b"claim", &[PDA_VERSION], recipient.as_ref()], _program_id);
    if recipient_claim_account.key != &claim_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    assert_token_program(token_program)?;

    // Load and update recipient claim
    let mut claim_data = recipient_claim_account.try_borrow_mut_data()?;
    let mut claim_state: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_data[8..])?;

    if claim_state.amount == 0 {
        return Err(MailerError::NoClaimableAmount.into());
    }

    let amount = claim_state.amount;
    claim_state.amount = 0;
    claim_state.timestamp = 0;

    assert_token_account(recipient_usdc, &recipient, &mailer_state.usdc_mint)?;
    assert_token_account(mailer_usdc, &mailer_pda, &mailer_state.usdc_mint)?;

    // Save updated state BEFORE external call (CEI pattern)
    claim_state.serialize(&mut &mut claim_data[8..])?;
    drop(claim_data); // Release borrow before external call

    // Transfer USDC from mailer to recipient
    invoke_signed(
        &spl_token::instruction::transfer(
            token_program.key,
            mailer_usdc.key,
            recipient_usdc.key,
            &mailer_pda,
            &[],
            amount,
        )?,
        &[
            mailer_usdc.clone(),
            recipient_usdc.clone(),
            mailer_account.clone(),
            token_program.clone(),
        ],
        &[&[b"mailer", &[mailer_state.bump]]],
    )?;

    msg!("Distributed claimable funds to {}: {}", recipient, amount);
    Ok(())
}

/// Claim expired shares and move them under owner control (owner only)
fn process_claim_expired_shares(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    recipient: Pubkey,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;
    let recipient_claim_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (_mailer_pda, _) = assert_mailer_account(program_id, mailer_account)?;

    // Load and verify mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Verify recipient claim PDA
    let (claim_pda, _) = Pubkey::find_program_address(&[b"claim", &[PDA_VERSION], recipient.as_ref()], program_id);
    if recipient_claim_account.key != &claim_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    // Load and validate claim state
    let mut claim_data = recipient_claim_account.try_borrow_mut_data()?;
    let mut claim_state: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_data[8..])?;

    if claim_state.recipient != recipient {
        return Err(MailerError::InvalidRecipient.into());
    }
    if claim_state.amount == 0 {
        return Err(MailerError::NoClaimableAmount.into());
    }

    let current_time = Clock::get()?.unix_timestamp;
    if current_time <= claim_state.timestamp + CLAIM_PERIOD {
        return Err(MailerError::ClaimPeriodNotExpired.into());
    }

    let amount = claim_state.amount;
    claim_state.amount = 0;
    claim_state.timestamp = 0;
    claim_state.serialize(&mut &mut claim_data[8..])?;
    drop(claim_data);

    mailer_state.increase_owner_claimable(amount)?;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Expired shares claimed for {}: {}", recipient, amount);
    Ok(())
}

/// Emergency unpause without fund distribution (owner only)
fn process_emergency_unpause(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    assert_mailer_account(_program_id, mailer_account)?;

    // Load and update mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    // Verify owner
    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    // Check if not paused
    if !mailer_state.paused {
        return Err(MailerError::ContractNotPaused.into());
    }

    // Set unpaused state without fund distribution
    mailer_state.paused = false;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!(
        "Contract emergency unpaused by owner: {} - funds can be claimed manually",
        owner.key
    );
    Ok(())
}

/// Set fee paused state (owner only)
fn process_set_fee_paused(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    fee_paused: bool,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    assert_mailer_account(_program_id, mailer_account)?;

    // Load and update mailer state
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;

    if mailer_state.owner != *owner.key {
        return Err(MailerError::OnlyOwner.into());
    }

    mailer_state.fee_paused = fee_paused;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Fee paused state set to: {}", fee_paused);
    Ok(())
}

/// Simple hash function for account discriminators
fn hash_discriminator(name: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    hasher.finish()
}

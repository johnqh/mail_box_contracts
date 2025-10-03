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
//! - **Revenue Claims**: 30-day claim period for priority message revenue shares
//!
//! ## Program Architecture
//!
//! The program uses Program Derived Addresses (PDAs) for:
//! - Mailer state: `[b"mailer"]`
//! - Recipient claims: `[b"claim", recipient.key()]`
//! - Delegations: `[b"delegation", delegator.key()]`
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
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use thiserror::Error;

// Program ID for the Native Mailer program
solana_program::declare_id!("9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF");

/// Base sending fee in USDC (with 6 decimals): 0.1 USDC
const SEND_FEE: u64 = 100_000;

/// Delegation fee in USDC (with 6 decimals): 10 USDC
const DELEGATION_FEE: u64 = 10_000_000;

/// Claim period for revenue shares: 60 days in seconds
const CLAIM_PERIOD: i64 = 60 * 24 * 60 * 60;

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
    pub bump: u8,
}

impl MailerState {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 1 + 1; // 90 bytes
}

/// Recipient claim account
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
    },

    /// Send message to email address (no wallet address known)
    /// Charges only 10% owner fee since recipient wallet is unknown
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
    /// Accounts:
    /// 0. `[signer]` Sender
    /// 1. `[]` Mailer state account (PDA)
    /// 2. `[writable]` Sender USDC account
    /// 3. `[writable]` Mailer USDC account
    /// 4. `[]` Token program
    SendPreparedToEmail {
        to_email: String,
        mail_id: String,
    },

    /// Claim recipient share
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
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    SetFee { new_fee: u64 },

    /// Delegate to another address
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
    /// Accounts:
    /// 0. `[signer]` Rejector
    /// 1. `[writable]` Delegation account (PDA)
    RejectDelegation,

    /// Set delegation fee (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    SetDelegationFee { new_fee: u64 },
    
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

    /// Emergency unpause without fund distribution (owner only)
    /// Accounts:
    /// 0. `[signer]` Owner
    /// 1. `[writable]` Mailer state account (PDA)
    EmergencyUnpause,
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
    #[error("Contract is paused")]
    ContractPaused,
    #[error("Contract is not paused")]
    ContractNotPaused,
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
        MailerInstruction::Send { to, subject, _body, revenue_share_to_receiver } => {
            process_send(program_id, accounts, to, subject, _body, revenue_share_to_receiver)
        }
        MailerInstruction::SendToEmail { to_email, subject, _body } => {
            process_send_to_email(program_id, accounts, to_email, subject, _body)
        }
        MailerInstruction::SendPreparedToEmail { to_email, mail_id } => {
            process_send_prepared_to_email(program_id, accounts, to_email, mail_id)
        }
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
        MailerInstruction::Pause => {
            process_pause(program_id, accounts)
        }
        MailerInstruction::Unpause => {
            process_unpause(program_id, accounts)
        }
        MailerInstruction::DistributeClaimableFunds { recipient } => {
            process_distribute_claimable_funds(program_id, accounts, recipient)
        }
        MailerInstruction::EmergencyUnpause => {
            process_emergency_unpause(program_id, accounts)
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
        &[owner.clone(), mailer_account.clone(), system_program.clone()],
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
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    if revenue_share_to_receiver {
        // Priority mode: full fee with revenue sharing

        // Create or load recipient claim account
        let (claim_pda, claim_bump) = Pubkey::find_program_address(
            &[b"claim", to.as_ref()],
            program_id
        );

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
                &[sender.clone(), recipient_claim.clone(), system_program.clone()],
                &[&[b"claim", to.as_ref(), &[claim_bump]]],
            )?;

            // Initialize claim account
            let mut claim_data = recipient_claim.try_borrow_mut_data()?;
            claim_data[0..8].copy_from_slice(&hash_discriminator("account:RecipientClaim").to_le_bytes());

            let claim_state = RecipientClaim {
                recipient: to,
                amount: 0,
                timestamp: 0,
                bump: claim_bump,
            };

            claim_state.serialize(&mut &mut claim_data[8..])?;
            drop(claim_data);
        }

        // Transfer full send fee
        invoke(
            &spl_token::instruction::transfer(
                token_program.key,
                sender_usdc.key,
                mailer_usdc.key,
                sender.key,
                &[],
                mailer_state.send_fee,
            )?,
            &[
                sender_usdc.clone(),
                mailer_usdc.clone(),
                sender.clone(),
                token_program.clone(),
            ],
        )?;

        // Record revenue shares
        record_shares(recipient_claim, mailer_account, to, mailer_state.send_fee)?;

        msg!("Priority mail sent from {} to {}: {} (revenue share enabled)", sender.key, to, subject);
    } else {
        // Standard mode: 10% fee only, no revenue sharing

        let owner_fee = mailer_state.send_fee / 10; // 10% of send_fee

        // Transfer only owner fee (10%)
        invoke(
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
        )?;

        // Update owner claimable
        let mut mailer_data = mailer_account.try_borrow_mut_data()?;
        let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
        mailer_state.owner_claimable += owner_fee;
        mailer_state.serialize(&mut &mut mailer_data[8..])?;

        msg!("Standard mail sent from {} to {}: {}", sender.key, to, subject);
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
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Calculate 10% owner fee (no revenue share since no wallet address)
    let owner_fee = (mailer_state.send_fee * 10) / 100;

    // Transfer fee from sender to mailer
    let transfer_ix = spl_token::instruction::transfer(
        token_program.key,
        sender_usdc.key,
        mailer_usdc.key,
        sender.key,
        &[],
        owner_fee,
    )?;

    invoke(
        &transfer_ix,
        &[
            sender_usdc.clone(),
            mailer_usdc.clone(),
            sender.clone(),
            token_program.clone(),
        ],
    )?;

    // Update owner claimable
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    mailer_state.owner_claimable += owner_fee;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Mail sent from {} to email {}: {}", sender.key, to_email, subject);

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
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Calculate 10% owner fee (no revenue share since no wallet address)
    let owner_fee = (mailer_state.send_fee * 10) / 100;

    // Transfer fee from sender to mailer
    let transfer_ix = spl_token::instruction::transfer(
        token_program.key,
        sender_usdc.key,
        mailer_usdc.key,
        sender.key,
        &[],
        owner_fee,
    )?;

    invoke(
        &transfer_ix,
        &[
            sender_usdc.clone(),
            mailer_usdc.clone(),
            sender.clone(),
            token_program.clone(),
        ],
    )?;

    // Update owner claimable
    let mut mailer_data = mailer_account.try_borrow_mut_data()?;
    let mut mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    mailer_state.owner_claimable += owner_fee;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Prepared mail sent from {} to email {} (mailId: {})", sender.key, to_email, mail_id);

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

    // Load mailer state
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    // Check if contract is paused
    if mailer_state.paused {
        return Err(MailerError::ContractPaused.into());
    }

    // Verify delegation account PDA
    let (delegation_pda, delegation_bump) = Pubkey::find_program_address(
        &[b"delegation", delegator.key.as_ref()], 
        program_id
    );

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
            &[&[b"delegation", delegator.key.as_ref(), &[delegation_bump]]],
        )?;

        // Initialize delegation account
        let mut delegation_data = delegation_account.try_borrow_mut_data()?;
        delegation_data[0..8].copy_from_slice(&hash_discriminator("account:Delegation").to_le_bytes());

        let delegation_state = Delegation {
            delegator: *delegator.key,
            delegate: None,
            bump: delegation_bump,
        };

        delegation_state.serialize(&mut &mut delegation_data[8..])?;
        drop(delegation_data);
    }

    // If setting delegation (not clearing), charge fee
    if let Some(delegate_key) = delegate {
        if delegate_key != Pubkey::default() {
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
        }
    }

    // Update delegation
    let mut delegation_data = delegation_account.try_borrow_mut_data()?;
    let mut delegation_state: Delegation = BorshDeserialize::deserialize(&mut &delegation_data[8..])?;
    delegation_state.delegate = delegate;
    delegation_state.serialize(&mut &mut delegation_data[8..])?;

    msg!("Delegation set from {} to {:?}", delegator.key, delegate);
    Ok(())
}

/// Reject delegation
fn process_reject_delegation(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let rejector = next_account_info(account_iter)?;
    let delegation_account = next_account_info(account_iter)?;

    if !rejector.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Load and update delegation state
    let mut delegation_data = delegation_account.try_borrow_mut_data()?;
    let mut delegation_state: Delegation = BorshDeserialize::deserialize(&mut &delegation_data[8..])?;

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

/// Record revenue shares for priority messages
fn record_shares(
    recipient_claim: &AccountInfo,
    mailer_account: &AccountInfo,
    recipient: Pubkey,
    total_amount: u64,
) -> ProgramResult {
    let owner_amount = total_amount / 10; // 10% of total_amount
    let recipient_amount = total_amount - owner_amount;

    // Update recipient's claimable amount
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
    mailer_state.owner_claimable += owner_amount;
    mailer_state.serialize(&mut &mut mailer_data[8..])?;

    msg!("Shares recorded: recipient {}, owner {}", recipient_amount, owner_amount);
    Ok(())
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

    // Distribute owner claimable funds if any
    if mailer_state.owner_claimable > 0 {
        let amount = mailer_state.owner_claimable;
        mailer_state.owner_claimable = 0;

        // Transfer USDC from mailer to owner
        let (mailer_pda, bump) = Pubkey::find_program_address(&[b"mailer"], _program_id);
        invoke_signed(
            &spl_token::instruction::transfer(
                token_program.key,
                mailer_usdc.key,
                owner_usdc.key,
                &mailer_pda,
                &[],
                amount,
            )?,
            &[mailer_usdc.clone(), owner_usdc.clone(), token_program.clone()],
            &[&[b"mailer", &[bump]]],
        )?;

        msg!("Distributed owner funds during pause: {}", amount);
    }

    // Save updated state
    mailer_state.serialize(&mut &mut mailer_data[8..])?;
    
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

/// Emergency unpause without fund distribution (owner only)
fn process_emergency_unpause(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let owner = next_account_info(account_iter)?;
    let mailer_account = next_account_info(account_iter)?;

    if !owner.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

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
    
    msg!("Contract emergency unpaused by owner: {} - funds can be claimed manually", owner.key);
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

    // Load mailer state to check if paused
    let mailer_data = mailer_account.try_borrow_data()?;
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_data[8..])?;
    drop(mailer_data);

    // Check if contract is paused
    if !mailer_state.paused {
        return Err(MailerError::ContractNotPaused.into());
    }

    // Verify recipient claim PDA
    let (claim_pda, _) = Pubkey::find_program_address(&[b"claim", recipient.as_ref()], _program_id);
    if recipient_claim_account.key != &claim_pda {
        return Err(MailerError::InvalidPDA.into());
    }

    // Load and update recipient claim
    let mut claim_data = recipient_claim_account.try_borrow_mut_data()?;
    let mut claim_state: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_data[8..])?;

    if claim_state.amount == 0 {
        return Err(MailerError::NoClaimableAmount.into());
    }

    let amount = claim_state.amount;
    claim_state.amount = 0;
    claim_state.timestamp = 0;

    // Transfer USDC from mailer to recipient
    let (mailer_pda, bump) = Pubkey::find_program_address(&[b"mailer"], _program_id);
    invoke_signed(
        &spl_token::instruction::transfer(
            token_program.key,
            mailer_usdc.key,
            recipient_usdc.key,
            &mailer_pda,
            &[],
            amount,
        )?,
        &[mailer_usdc.clone(), recipient_usdc.clone(), token_program.clone()],
        &[&[b"mailer", &[bump]]],
    )?;

    claim_state.serialize(&mut &mut claim_data[8..])?;
    
    msg!("Distributed claimable funds to {}: {}", recipient, amount);
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

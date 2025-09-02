//! # Mailer Program
//!
//! A Solana program for decentralized messaging with USDC fees and revenue sharing.
//!
//! ## Key Features
//!
//! - **Priority Messages**: Full fee (0.1 USDC) with 90% revenue share back to sender
//! - **Standard Messages**: 10% fee only (0.01 USDC) with no revenue share
//! - **Revenue Claims**: 60-day claim period for priority message revenue shares
//! - **Self-messaging**: All messages are sent to the sender's own address
//!
//! ## Program Architecture
//!
//! The program uses Program Derived Addresses (PDAs) for:
//! - Mailer state: `[b"mailer"]`
//! - Recipient claims: `[b"claim", recipient.key()]`
//!
//! ## Fee Structure
//!
//! - Send Fee: 0.1 USDC (100,000 with 6 decimals)
//! - Priority: Sender pays full fee, gets 90% back as claimable
//! - Standard: Sender pays 10% fee only
//! - Owner gets 10% of all fees
//!
//! ## Usage Examples
//!
//! ```rust
//! // Initialize the program
//! initialize(ctx, usdc_mint_pubkey)?;
//!
//! // Send priority message (with revenue sharing)
//! send_priority(ctx, "Subject".to_string(), "Body".to_string())?;
//!
//! // Claim revenue share within 60 days
//! claim_recipient_share(ctx)?;
//! ```

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;

// Program ID for the Mailer program
declare_id!("9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF");

/// Base sending fee in USDC (with 6 decimals): 0.1 USDC
const SEND_FEE: u64 = 100_000;

/// Claim period for revenue shares: 60 days in seconds
const CLAIM_PERIOD: i64 = 60 * 24 * 60 * 60;

/// Percentage of fee that goes to message sender as revenue share: 90%
const RECIPIENT_SHARE: u64 = 90;

/// Percentage of fee that goes to program owner: 10%
const OWNER_SHARE: u64 = 10;

#[program]
pub mod mailer {
    use super::*;

    /// Initialize the Mailer program with USDC mint and owner
    ///
    /// This instruction creates the main program state account with default fees
    /// and configuration. Only needs to be called once per program deployment.
    ///
    /// # Arguments
    /// * `ctx` - Anchor context with required accounts
    /// * `usdc_mint` - Public key of the USDC token mint (must have 6 decimals)
    ///
    /// # Accounts
    /// * `mailer` - The main program state account (PDA)
    /// * `owner` - Program owner with administrative privileges
    /// * `system_program` - System program for account creation
    ///
    /// # Errors
    /// Returns an error if account initialization fails
    ///
    /// # Example
    /// ```rust
    /// let usdc_mint = Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")?;
    /// initialize(ctx, usdc_mint)?;
    /// ```
    pub fn initialize(ctx: Context<Initialize>, usdc_mint: Pubkey) -> Result<()> {
        let mailer = &mut ctx.accounts.mailer;
        mailer.owner = ctx.accounts.owner.key();
        mailer.usdc_mint = usdc_mint;
        mailer.send_fee = SEND_FEE;
        mailer.owner_claimable = 0;
        mailer.bump = ctx.bumps.mailer;
        Ok(())
    }

    /// Send a priority message with full fee and 90% revenue sharing
    ///
    /// Priority messages cost the full send fee (0.1 USDC) but the sender receives
    /// 90% back as claimable revenue within 60 days. This creates an incentive
    /// system where frequent users can recover most of their costs.
    ///
    /// # Arguments
    /// * `ctx` - Anchor context with required accounts
    /// * `subject` - Message subject line (plain text)
    /// * `body` - Message content (plain text)
    ///
    /// # Accounts
    /// * `recipient_claim` - PDA to store claimable revenue for sender
    /// * `mailer` - Main program state account
    /// * `sender` - User sending the message (signer)
    /// * `sender_usdc_account` - Sender's USDC associated token account
    /// * `mailer_usdc_account` - Program's USDC associated token account
    /// * `token_program` - SPL Token program
    /// * `associated_token_program` - Associated Token program
    /// * `system_program` - System program
    ///
    /// # Errors
    /// * `InsufficientFunds` - If sender doesn't have enough USDC
    /// * `TokenTransferFailed` - If USDC transfer fails
    ///
    /// # Example
    /// ```rust
    /// send_priority(ctx, "Important Update".to_string(), "This is urgent!".to_string())?;
    /// ```
    pub fn send_priority(
        ctx: Context<SendMessage>,
        to: Pubkey,
        subject: String,
        body: String,
    ) -> Result<()> {
        let sender = ctx.accounts.sender.key();
        
        // Transfer full send fee from sender to mailer contract
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_usdc_account.to_account_info(),
                to: ctx.accounts.mailer_usdc_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        );
        let send_fee = ctx.accounts.mailer.send_fee;
        token::transfer(transfer_ctx, send_fee)?;

        // Record shares for revenue sharing
        record_shares(
            &mut ctx.accounts.recipient_claim,
            &mut ctx.accounts.mailer,
            sender,
            send_fee,
        )?;

        emit!(MailSent {
            from: sender,
            to,
            subject,
            body,
        });

        Ok(())
    }

    /// Send a priority message using a pre-prepared mail identifier
    ///
    /// Similar to send_priority but uses a pre-prepared message ID instead of
    /// subject/body. Useful for messages stored off-chain (IPFS, databases, etc.)
    /// with the same fee structure and revenue sharing.
    ///
    /// # Arguments
    /// * `ctx` - Anchor context with required accounts
    /// * `mail_id` - Pre-prepared message identifier (e.g., IPFS hash, UUID)
    ///
    /// # Accounts
    /// Same as send_priority
    ///
    /// # Errors
    /// * `InsufficientFunds` - If sender doesn't have enough USDC
    /// * `TokenTransferFailed` - If USDC transfer fails
    ///
    /// # Example
    /// ```rust
    /// let ipfs_hash = "QmX7Y8Z9...".to_string();
    /// send_priority_prepared(ctx, ipfs_hash)?;
    /// ```
    pub fn send_priority_prepared(
        ctx: Context<SendMessage>,
        to: Pubkey,
        mail_id: String,
    ) -> Result<()> {
        let sender = ctx.accounts.sender.key();
        
        // Transfer full send fee from sender to mailer contract
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_usdc_account.to_account_info(),
                to: ctx.accounts.mailer_usdc_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        );
        let send_fee = ctx.accounts.mailer.send_fee;
        token::transfer(transfer_ctx, send_fee)?;

        // Record shares for revenue sharing
        record_shares(
            &mut ctx.accounts.recipient_claim,
            &mut ctx.accounts.mailer,
            sender,
            send_fee,
        )?;

        emit!(PreparedMailSent {
            from: sender,
            to,
            mail_id,
        });

        Ok(())
    }

    /// Send a standard message with 10% fee only (no revenue sharing)
    ///
    /// Standard messages are more cost-effective, charging only 10% of the base
    /// fee (0.01 USDC) with no revenue share back to the sender. All fee goes
    /// to the program owner.
    ///
    /// # Arguments
    /// * `ctx` - Anchor context with required accounts
    /// * `subject` - Message subject line (plain text)
    /// * `body` - Message content (plain text)
    ///
    /// # Accounts
    /// Same as send_priority (recipient_claim account still required but not used)
    ///
    /// # Errors
    /// * `InsufficientFunds` - If sender doesn't have enough USDC
    /// * `TokenTransferFailed` - If USDC transfer fails
    ///
    /// # Example
    /// ```rust
    /// send(ctx, "Regular Update".to_string(), "Standard message".to_string())?;
    /// ```
    pub fn send(
        ctx: Context<SendMessage>,
        to: Pubkey,
        subject: String,
        body: String,
    ) -> Result<()> {
        let sender = ctx.accounts.sender.key();
        let owner_fee = (ctx.accounts.mailer.send_fee * OWNER_SHARE) / 100;
        
        // Transfer only owner fee (10%) from sender to mailer contract
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_usdc_account.to_account_info(),
                to: ctx.accounts.mailer_usdc_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, owner_fee)?;

        // Only add to owner claimable, no revenue sharing
        ctx.accounts.mailer.owner_claimable += owner_fee;

        emit!(MailSent {
            from: sender,
            to,
            subject,
            body,
        });

        Ok(())
    }

    /// Send a standard message using a pre-prepared mail identifier
    ///
    /// Cost-effective variant of send() using pre-prepared message IDs.
    /// Charges only 10% fee with no revenue sharing.
    ///
    /// # Arguments
    /// * `ctx` - Anchor context with required accounts
    /// * `mail_id` - Pre-prepared message identifier
    ///
    /// # Accounts
    /// Same as send_priority
    ///
    /// # Errors
    /// * `InsufficientFunds` - If sender doesn't have enough USDC
    /// * `TokenTransferFailed` - If USDC transfer fails
    ///
    /// # Example
    /// ```rust
    /// let message_uuid = "msg-12345".to_string();
    /// send_prepared(ctx, message_uuid)?;
    /// ```
    pub fn send_prepared(
        ctx: Context<SendMessage>,
        to: Pubkey,
        mail_id: String,
    ) -> Result<()> {
        let sender = ctx.accounts.sender.key();
        let owner_fee = (ctx.accounts.mailer.send_fee * OWNER_SHARE) / 100;
        
        // Transfer only owner fee (10%) from sender to mailer contract
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_usdc_account.to_account_info(),
                to: ctx.accounts.mailer_usdc_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, owner_fee)?;

        // Only add to owner claimable, no revenue sharing
        ctx.accounts.mailer.owner_claimable += owner_fee;

        emit!(PreparedMailSent {
            from: sender,
            to,
            mail_id,
        });

        Ok(())
    }

    pub fn claim_recipient_share(ctx: Context<ClaimRecipientShare>) -> Result<()> {
        let claim = &mut ctx.accounts.recipient_claim;
        let recipient = ctx.accounts.recipient.key();
        
        require!(claim.amount > 0, MailerError::NoClaimableAmount);
        
        // Check if claim period has expired
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time <= claim.timestamp + CLAIM_PERIOD,
            MailerError::ClaimPeriodExpired
        );

        let amount = claim.amount;
        claim.amount = 0;
        claim.timestamp = 0;

        // Transfer USDC from mailer to recipient
        let bump = ctx.accounts.mailer.bump;
        let seeds = &[b"mailer".as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];
        
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.mailer_usdc_account.to_account_info(),
                to: ctx.accounts.recipient_usdc_account.to_account_info(),
                authority: ctx.accounts.mailer.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, amount)?;

        emit!(RecipientClaimed {
            recipient,
            amount,
        });

        Ok(())
    }

    pub fn claim_owner_share(ctx: Context<ClaimOwnerShare>) -> Result<()> {
        let mailer = &mut ctx.accounts.mailer;
        
        require!(mailer.owner_claimable > 0, MailerError::NoClaimableAmount);

        let amount = mailer.owner_claimable;
        mailer.owner_claimable = 0;

        // Transfer USDC from mailer to owner
        let bump = mailer.bump;
        let seeds = &[b"mailer".as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];
        
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.mailer_usdc_account.to_account_info(),
                to: ctx.accounts.owner_usdc_account.to_account_info(),
                authority: ctx.accounts.mailer.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, amount)?;

        emit!(OwnerClaimed { amount });

        Ok(())
    }

    pub fn claim_expired_shares(ctx: Context<ClaimExpiredShares>) -> Result<()> {
        let recipient_key = ctx.accounts.recipient_claim.recipient;
        let claim = &mut ctx.accounts.recipient_claim;
        
        require!(claim.amount > 0, MailerError::NoClaimableAmount);
        
        // Check if claim period has expired
        let current_time = Clock::get()?.unix_timestamp;
        require!(
            current_time > claim.timestamp + CLAIM_PERIOD,
            MailerError::ClaimPeriodNotExpired
        );

        let amount = claim.amount;
        claim.amount = 0;
        claim.timestamp = 0;

        // Add expired amount to owner claimable
        ctx.accounts.mailer.owner_claimable += amount;

        emit!(ExpiredSharesClaimed {
            recipient: recipient_key,
            amount,
        });

        Ok(())
    }

    pub fn set_fee(ctx: Context<SetFee>, new_fee: u64) -> Result<()> {
        let mailer = &mut ctx.accounts.mailer;
        let old_fee = mailer.send_fee;
        mailer.send_fee = new_fee;

        emit!(FeeUpdated { old_fee, new_fee });

        Ok(())
    }
}

fn record_shares(
    claim: &mut Account<RecipientClaim>,
    mailer: &mut Account<MailerState>,
    recipient: Pubkey,
    total_amount: u64,
) -> Result<()> {
    // Calculate owner amount first for precision
    let owner_amount = (total_amount * OWNER_SHARE) / 100;
    let recipient_amount = total_amount - owner_amount;

    // Update recipient's claimable amount and set timestamp only if not already set
    claim.recipient = recipient;
    claim.amount += recipient_amount;
    if claim.timestamp == 0 {
        claim.timestamp = Clock::get()?.unix_timestamp;
    }

    // Update owner's claimable amount
    mailer.owner_claimable += owner_amount;

    emit!(SharesRecorded {
        recipient,
        recipient_amount,
        owner_amount,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + MailerState::INIT_SPACE,
        seeds = [b"mailer"],
        bump
    )]
    pub mailer: Account<'info, MailerState>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(
        init_if_needed,
        payer = sender,
        space = 8 + RecipientClaim::INIT_SPACE,
        seeds = [b"claim", sender.key().as_ref()],
        bump
    )]
    pub recipient_claim: Account<'info, RecipientClaim>,
    
    #[account(seeds = [b"mailer"], bump = mailer.bump)]
    pub mailer: Account<'info, MailerState>,
    
    #[account(mut)]
    pub sender: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = mailer.usdc_mint,
        associated_token::authority = sender
    )]
    pub sender_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = mailer.usdc_mint,
        associated_token::authority = mailer
    )]
    pub mailer_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRecipientShare<'info> {
    #[account(
        mut,
        seeds = [b"claim", recipient.key().as_ref()],
        bump,
        has_one = recipient @ MailerError::InvalidRecipient
    )]
    pub recipient_claim: Account<'info, RecipientClaim>,
    
    #[account(seeds = [b"mailer"], bump = mailer.bump)]
    pub mailer: Account<'info, MailerState>,
    
    pub recipient: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = mailer.usdc_mint,
        associated_token::authority = recipient
    )]
    pub recipient_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = mailer.usdc_mint,
        associated_token::authority = mailer
    )]
    pub mailer_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimOwnerShare<'info> {
    #[account(
        mut,
        seeds = [b"mailer"],
        bump = mailer.bump,
        has_one = owner @ MailerError::OnlyOwner
    )]
    pub mailer: Account<'info, MailerState>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = mailer.usdc_mint,
        associated_token::authority = owner
    )]
    pub owner_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = mailer.usdc_mint,
        associated_token::authority = mailer
    )]
    pub mailer_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimExpiredShares<'info> {
    #[account(
        mut,
        seeds = [b"claim", recipient_claim.recipient.as_ref()],
        bump
    )]
    pub recipient_claim: Account<'info, RecipientClaim>,
    
    #[account(
        mut,
        seeds = [b"mailer"],
        bump = mailer.bump,
        has_one = owner @ MailerError::OnlyOwner
    )]
    pub mailer: Account<'info, MailerState>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetFee<'info> {
    #[account(
        mut,
        seeds = [b"mailer"],
        bump = mailer.bump,
        has_one = owner @ MailerError::OnlyOwner
    )]
    pub mailer: Account<'info, MailerState>,
    
    pub owner: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct MailerState {
    pub owner: Pubkey,
    pub usdc_mint: Pubkey,
    pub send_fee: u64,
    pub owner_claimable: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RecipientClaim {
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub bump: u8,
}

#[event]
pub struct MailSent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub subject: String,
    pub body: String,
}

#[event]
pub struct PreparedMailSent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub mail_id: String,
}

#[event]
pub struct FeeUpdated {
    pub old_fee: u64,
    pub new_fee: u64,
}

#[event]
pub struct SharesRecorded {
    pub recipient: Pubkey,
    pub recipient_amount: u64,
    pub owner_amount: u64,
}

#[event]
pub struct RecipientClaimed {
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct OwnerClaimed {
    pub amount: u64,
}

#[event]
pub struct ExpiredSharesClaimed {
    pub recipient: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum MailerError {
    #[msg("Only the owner can perform this action")]
    OnlyOwner,
    #[msg("No claimable amount available")]
    NoClaimableAmount,
    #[msg("Claim period has expired")]
    ClaimPeriodExpired,
    #[msg("Claim period has not expired yet")]
    ClaimPeriodNotExpired,
    #[msg("Invalid recipient")]
    InvalidRecipient,
}
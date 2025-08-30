use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;

declare_id!("8EKjCLZjz6LKRxZcQ6LwwF5V8P3TCEgM2CdQg4pZxXHE");

const DELEGATION_FEE: u64 = 10_000_000;    // 10 USDC (6 decimals)

#[program]
pub mod mail_service {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, usdc_mint: Pubkey) -> Result<()> {
        let service = &mut ctx.accounts.mail_service;
        service.owner = ctx.accounts.owner.key();
        service.usdc_mint = usdc_mint;
        service.delegation_fee = DELEGATION_FEE;
        service.bump = ctx.bumps.mail_service;
        Ok(())
    }

    pub fn delegate_to(ctx: Context<DelegateTo>, delegate: Option<Pubkey>) -> Result<()> {
        let delegation = &mut ctx.accounts.delegation;
        let delegator = ctx.accounts.delegator.key();
        
        // If setting delegation (not clearing), charge fee
        if let Some(delegate_key) = delegate {
            if delegate_key != Pubkey::default() {
                // Transfer delegation fee from delegator to service
                let transfer_ctx = CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.delegator_usdc_account.to_account_info(),
                        to: ctx.accounts.service_usdc_account.to_account_info(),
                        authority: ctx.accounts.delegator.to_account_info(),
                    },
                );
                token::transfer(transfer_ctx, ctx.accounts.mail_service.delegation_fee)?;
            }
        }

        // Update delegation
        delegation.delegator = delegator;
        delegation.delegate = delegate;
        delegation.bump = ctx.bumps.delegation;

        emit!(DelegationSet {
            delegator,
            delegate,
        });

        Ok(())
    }

    pub fn reject_delegation(ctx: Context<RejectDelegation>) -> Result<()> {
        let delegation = &mut ctx.accounts.delegation;
        
        // Verify the rejector is the current delegate
        require!(
            delegation.delegate == Some(ctx.accounts.rejector.key()),
            MailServiceError::NoDelegationToReject
        );

        let delegator = delegation.delegator;
        
        // Clear the delegation
        delegation.delegate = None;

        emit!(DelegationSet {
            delegator,
            delegate: None,
        });

        Ok(())
    }

    pub fn set_delegation_fee(ctx: Context<SetFee>, new_fee: u64) -> Result<()> {
        let service = &mut ctx.accounts.mail_service;
        let old_fee = service.delegation_fee;
        service.delegation_fee = new_fee;

        emit!(DelegationFeeUpdated {
            old_fee,
            new_fee,
        });

        Ok(())
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        // Transfer USDC from service to owner
        let bump = ctx.accounts.mail_service.bump;
        let seeds = &[b"mail_service".as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];
        
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.service_usdc_account.to_account_info(),
                to: ctx.accounts.owner_usdc_account.to_account_info(),
                authority: ctx.accounts.mail_service.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + MailServiceState::INIT_SPACE,
        seeds = [b"mail_service"],
        bump
    )]
    pub mail_service: Account<'info, MailServiceState>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DelegateTo<'info> {
    #[account(
        init_if_needed,
        payer = delegator,
        space = 8 + Delegation::INIT_SPACE,
        seeds = [b"delegation", delegator.key().as_ref()],
        bump
    )]
    pub delegation: Account<'info, Delegation>,
    
    #[account(seeds = [b"mail_service"], bump = mail_service.bump)]
    pub mail_service: Account<'info, MailServiceState>,
    
    #[account(mut)]
    pub delegator: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = mail_service.usdc_mint,
        associated_token::authority = delegator
    )]
    pub delegator_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = mail_service.usdc_mint,
        associated_token::authority = mail_service
    )]
    pub service_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RejectDelegation<'info> {
    #[account(
        mut,
        seeds = [b"delegation", delegation.delegator.as_ref()],
        bump = delegation.bump,
        has_one = delegator @ MailServiceError::InvalidDelegator
    )]
    pub delegation: Account<'info, Delegation>,
    
    /// CHECK: This is the original delegator, validated by the delegation account
    pub delegator: UncheckedAccount<'info>,
    
    pub rejector: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetFee<'info> {
    #[account(
        mut,
        seeds = [b"mail_service"],
        bump = mail_service.bump,
        has_one = owner @ MailServiceError::OnlyOwner
    )]
    pub mail_service: Account<'info, MailServiceState>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        seeds = [b"mail_service"],
        bump = mail_service.bump,
        has_one = owner @ MailServiceError::OnlyOwner
    )]
    pub mail_service: Account<'info, MailServiceState>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        associated_token::mint = mail_service.usdc_mint,
        associated_token::authority = mail_service
    )]
    pub service_usdc_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = mail_service.usdc_mint,
        associated_token::authority = owner
    )]
    pub owner_usdc_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct MailServiceState {
    pub owner: Pubkey,
    pub usdc_mint: Pubkey,
    pub delegation_fee: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Delegation {
    pub delegator: Pubkey,
    pub delegate: Option<Pubkey>,
    pub bump: u8,
}

#[event]
pub struct DelegationSet {
    pub delegator: Pubkey,
    pub delegate: Option<Pubkey>,
}

#[event]
pub struct DelegationFeeUpdated {
    pub old_fee: u64,
    pub new_fee: u64,
}

#[error_code]
pub enum MailServiceError {
    #[msg("Only the owner can perform this action")]
    OnlyOwner,
    #[msg("No delegation to reject")]
    NoDelegationToReject,
    #[msg("Invalid delegator")]
    InvalidDelegator,
}
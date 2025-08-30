use anchor_lang::prelude::*;

declare_id!("7KxLzPMHGHLYqHYkX8YYtNjSGRD9mT4rE5hQ6pZvGbPz");

#[program]
pub mod mail_box_factory {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, version: String) -> Result<()> {
        let factory = &mut ctx.accounts.factory;
        factory.owner = ctx.accounts.owner.key();
        factory.version = version;
        factory.deployment_count = 0;
        factory.bump = ctx.bumps.factory;
        Ok(())
    }

    pub fn register_deployment(
        ctx: Context<RegisterDeployment>,
        deployment_type: String,
        program_id: Pubkey,
        network: String,
    ) -> Result<()> {
        let factory = &mut ctx.accounts.factory;
        let deployment = &mut ctx.accounts.deployment;
        
        deployment.deployment_type = deployment_type;
        deployment.program_id = program_id;
        deployment.network = network.clone();
        deployment.deployer = ctx.accounts.owner.key();
        deployment.timestamp = Clock::get()?.unix_timestamp;
        deployment.bump = ctx.bumps.deployment;
        
        factory.deployment_count += 1;

        emit!(DeploymentRegistered {
            deployment_type: deployment.deployment_type.clone(),
            program_id,
            network,
            deployer: deployment.deployer,
            timestamp: deployment.timestamp,
        });

        Ok(())
    }

    pub fn predict_addresses(
        ctx: Context<PredictAddresses>,
        project_name: String,
        version: String,
    ) -> Result<PredictedAddresses> {
        // Generate deterministic seeds for PDA prediction
        let mailer_seeds = [
            project_name.as_bytes(),
            version.as_bytes(),
            b"mailer"
        ];
        
        let mail_service_seeds = [
            project_name.as_bytes(),
            version.as_bytes(),
            b"mail_service"
        ];

        let (mailer_pda, mailer_bump) = Pubkey::find_program_address(
            &mailer_seeds,
            &ctx.accounts.mailer_program.key()
        );

        let (mail_service_pda, mail_service_bump) = Pubkey::find_program_address(
            &mail_service_seeds,
            &ctx.accounts.mail_service_program.key()
        );

        let predicted = PredictedAddresses {
            mailer_address: mailer_pda,
            mailer_bump,
            mail_service_address: mail_service_pda,
            mail_service_bump,
        };

        emit!(AddressesPredicted {
            project_name,
            version,
            mailer_address: mailer_pda,
            mail_service_address: mail_service_pda,
        });

        Ok(predicted)
    }

    pub fn batch_initialize_programs(
        ctx: Context<BatchInitialize>,
        project_name: String,
        version: String,
        usdc_mint: Pubkey,
    ) -> Result<()> {
        // This would coordinate initialization of both Mailer and MailService programs
        // In practice, this would invoke CPIs to initialize both programs
        
        emit!(BatchInitialized {
            project_name,
            version,
            usdc_mint,
            mailer_program: ctx.accounts.mailer_program.key(),
            mail_service_program: ctx.accounts.mail_service_program.key(),
            coordinator: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    pub fn update_version(ctx: Context<UpdateVersion>, new_version: String) -> Result<()> {
        let factory = &mut ctx.accounts.factory;
        let old_version = factory.version.clone();
        factory.version = new_version.clone();

        emit!(VersionUpdated {
            old_version,
            new_version,
        });

        Ok(())
    }

    pub fn set_owner(ctx: Context<SetOwner>, new_owner: Pubkey) -> Result<()> {
        let factory = &mut ctx.accounts.factory;
        let old_owner = factory.owner;
        factory.owner = new_owner;

        emit!(OwnerUpdated {
            old_owner,
            new_owner,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + FactoryState::INIT_SPACE,
        seeds = [b"factory"],
        bump
    )]
    pub factory: Account<'info, FactoryState>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterDeployment<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + DeploymentInfo::INIT_SPACE,
        seeds = [
            b"deployment",
            factory.deployment_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub deployment: Account<'info, DeploymentInfo>,
    
    #[account(
        mut,
        seeds = [b"factory"],
        bump = factory.bump,
        has_one = owner @ FactoryError::OnlyOwner
    )]
    pub factory: Account<'info, FactoryState>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PredictAddresses<'info> {
    /// CHECK: This is the mailer program ID for PDA calculation
    pub mailer_program: UncheckedAccount<'info>,
    
    /// CHECK: This is the mail service program ID for PDA calculation
    pub mail_service_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct BatchInitialize<'info> {
    #[account(
        seeds = [b"factory"],
        bump = factory.bump,
        has_one = owner @ FactoryError::OnlyOwner
    )]
    pub factory: Account<'info, FactoryState>,
    
    pub owner: Signer<'info>,
    
    /// CHECK: This is the mailer program to initialize
    pub mailer_program: UncheckedAccount<'info>,
    
    /// CHECK: This is the mail service program to initialize
    pub mail_service_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateVersion<'info> {
    #[account(
        mut,
        seeds = [b"factory"],
        bump = factory.bump,
        has_one = owner @ FactoryError::OnlyOwner
    )]
    pub factory: Account<'info, FactoryState>,
    
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetOwner<'info> {
    #[account(
        mut,
        seeds = [b"factory"],
        bump = factory.bump,
        has_one = owner @ FactoryError::OnlyOwner
    )]
    pub factory: Account<'info, FactoryState>,
    
    pub owner: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct FactoryState {
    pub owner: Pubkey,
    #[max_len(32)]
    pub version: String,
    pub deployment_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DeploymentInfo {
    #[max_len(32)]
    pub deployment_type: String, // "Mailer" or "MailService"
    pub program_id: Pubkey,
    #[max_len(32)]
    pub network: String, // "mainnet", "devnet", "testnet", "localnet"
    pub deployer: Pubkey,
    pub timestamp: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PredictedAddresses {
    pub mailer_address: Pubkey,
    pub mailer_bump: u8,
    pub mail_service_address: Pubkey,
    pub mail_service_bump: u8,
}

#[event]
pub struct DeploymentRegistered {
    pub deployment_type: String,
    pub program_id: Pubkey,
    pub network: String,
    pub deployer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AddressesPredicted {
    pub project_name: String,
    pub version: String,
    pub mailer_address: Pubkey,
    pub mail_service_address: Pubkey,
}

#[event]
pub struct BatchInitialized {
    pub project_name: String,
    pub version: String,
    pub usdc_mint: Pubkey,
    pub mailer_program: Pubkey,
    pub mail_service_program: Pubkey,
    pub coordinator: Pubkey,
}

#[event]
pub struct VersionUpdated {
    pub old_version: String,
    pub new_version: String,
}

#[event]
pub struct OwnerUpdated {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[error_code]
pub enum FactoryError {
    #[msg("Only the owner can perform this action")]
    OnlyOwner,
    #[msg("Invalid program ID")]
    InvalidProgramId,
    #[msg("Network not supported")]
    NetworkNotSupported,
    #[msg("Version string too long")]
    VersionTooLong,
}
# Solana: Program Owner Pays for Users Pattern

## The Requirement

**Scenario:** You want program owner to pay Mailer fees for all users
- Users shouldn't need USDC
- Users just interact with your program
- Your program (as owner) pays all Mailer fees
- Same as EVM permission system, but without the permission mapping!

## Solution: Program Treasury (PDA-Owned USDC Account)

### Setup Phase (Program Owner)

```rust
// 1. Program defines a PDA for its treasury
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::SIZE,
        seeds = [b"program_state"],
        bump,
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: SystemAccount<'info>,  // PDA that owns USDC account

    #[account(
        init,
        payer = owner,
        associated_token::mint = usdc_mint,
        associated_token::authority = treasury,  // Treasury PDA owns this!
    )]
    pub treasury_usdc: Account<'info, TokenAccount>,  // Program's USDC account

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let program_state = &mut ctx.accounts.program_state;
    program_state.owner = ctx.accounts.owner.key();
    program_state.treasury = ctx.accounts.treasury.key();
    program_state.treasury_bump = ctx.bumps.treasury;

    msg!("Program initialized with treasury: {}", ctx.accounts.treasury.key());
    Ok(())
}
```

```rust
// 2. Owner funds the treasury
#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        has_one = owner,
        seeds = [b"program_state"],
        bump,
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut)]
    pub owner_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_usdc: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"treasury"],
        bump = program_state.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
    // Owner transfers USDC to program treasury
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_usdc.to_account_info(),
                to: ctx.accounts.treasury_usdc.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            }
        ),
        amount,
    )?;

    msg!("Treasury funded with {} USDC", amount);
    Ok(())
}
```

### User Interaction (Any User, No USDC Needed!)

```rust
// User calls this - program pays for Mailer!
#[derive(Accounts)]
pub struct SendNotification<'info> {
    #[account(mut)]
    pub user: Signer<'info>,  // User signs, but doesn't pay!

    #[account(
        seeds = [b"program_state"],
        bump,
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        seeds = [b"treasury"],
        bump = program_state.treasury_bump,
    )]
    /// CHECK: PDA signer for treasury
    pub treasury: UncheckedAccount<'info>,  // Program's PDA

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_usdc: Account<'info, TokenAccount>,  // Program pays from here!

    // Mailer accounts
    /// CHECK: Mailer program
    pub mailer_program: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Mailer state PDA
    pub mailer_state: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Mailer USDC account
    pub mailer_usdc: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: Recipient claim account (created by Mailer if needed)
    pub recipient_claim: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn send_notification(
    ctx: Context<SendNotification>,
    recipient: Pubkey,
    subject: String,
    body: String,
) -> Result<()> {
    // User signed, but program pays!
    msg!("User {} sending notification (program pays)", ctx.accounts.user.key());

    // Prepare PDA seeds for signing
    let treasury_seeds = &[
        b"treasury",
        &[ctx.accounts.program_state.treasury_bump],
    ];
    let signer_seeds = &[&treasury_seeds[..]];

    // CPI to Mailer - Program's treasury is the sender and payer!
    let cpi_accounts = mailer::cpi::accounts::Send {
        sender: ctx.accounts.treasury.to_account_info(),          // Treasury PDA
        sender_usdc: ctx.accounts.treasury_usdc.to_account_info(), // Program's USDC
        recipient_claim: ctx.accounts.recipient_claim.to_account_info(),
        mailer_account: ctx.accounts.mailer_state.to_account_info(),
        mailer_usdc: ctx.accounts.mailer_usdc.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.mailer_program.to_account_info(),
        cpi_accounts,
        signer_seeds,  // Program signs with PDA seeds!
    );

    // Make the call - treasury pays the fee!
    mailer::cpi::send(
        cpi_ctx,
        recipient,
        subject,
        body,
        false,  // Standard mode (10% fee)
        false,  // No name resolution
    )?;

    msg!("Notification sent! Program treasury paid the fee");
    Ok(())
}

#[account]
pub struct ProgramState {
    pub owner: Pubkey,
    pub treasury: Pubkey,
    pub treasury_bump: u8,
}

impl ProgramState {
    pub const SIZE: usize = 32 + 32 + 1;
}
```

## Complete Flow Comparison

### EVM (With Permission System)

```javascript
// Setup (Program Owner):
// 1. Owner approves unlimited USDC to Mailer
await usdc.connect(owner).approve(mailer.address, ethers.MaxUint256);

// 2. Owner grants permission for the contract
await mailer.connect(owner).setPermission(userContract.address);

// 3. Contract is now authorized - wallet pays when contract calls Mailer

// User Interaction:
// User calls contract (doesn't need USDC!)
await userContract.connect(user).sendNotification(recipient, subject, body);

// What happens:
// 1. UserContract calls Mailer
// 2. Mailer checks: permissions[userContract] = ownerWallet ✓
// 3. Mailer does: usdcToken.transferFrom(ownerWallet, mailer, fee)
// 4. Owner's wallet pays!
```

### Solana (With Treasury PDA)

```javascript
// Setup (Program Owner):
const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    program.programId
);

// 1. Initialize program with treasury
await program.methods
    .initialize()
    .accounts({
        owner: ownerWallet.publicKey,
        treasury: treasury,
        usdcMint: USDC_MINT,
        // ...
    })
    .signers([ownerWallet])
    .rpc();

// 2. Fund treasury with USDC
await program.methods
    .fundTreasury(new BN(1000_000000))  // 1000 USDC
    .accounts({
        owner: ownerWallet.publicKey,
        ownerUsdc: ownerUsdcAccount,
        treasuryUsdc: treasuryUsdcAccount,
        // ...
    })
    .signers([ownerWallet])
    .rpc();

// User Interaction:
// User calls program (doesn't need USDC!)
await program.methods
    .sendNotification(recipient, "Alert", "You have a notification")
    .accounts({
        user: userWallet.publicKey,         // User signs
        treasury: treasury,                  // Program's PDA
        treasuryUsdc: treasuryUsdcAccount,  // Program's USDC
        mailerProgram: MAILER_PROGRAM_ID,
        mailerState: mailerState,
        mailerUsdc: mailerUsdcAccount,
        // ...
    })
    .signers([userWallet])  // User signs, but treasury pays!
    .rpc();

// What happens:
// 1. User signs transaction to UserProgram
// 2. UserProgram makes CPI to Mailer
// 3. UserProgram signs CPI with treasury PDA seeds
// 4. Mailer transfers from treasuryUsdc (program's account)
// 5. Program pays, not user!
```

## Key Differences

### EVM Approach
```
Owner Wallet (holds USDC)
    ↓ approve + setPermission
Mailer Contract (permission mapping)
    ↓ transferFrom(ownerWallet, ...)
UserContract triggers spend from owner wallet
```

**Requires:**
- ❌ Unlimited approval (risky!)
- ❌ Permission mapping system
- ❌ Complex security model
- ⚠️ Owner wallet always at risk

### Solana Approach
```
Owner Wallet (holds USDC)
    ↓ transfer to treasury
Treasury PDA (holds USDC)
    ↓ program signs with seeds
UserProgram uses treasury funds
```

**Requires:**
- ✅ One-time transfer to treasury
- ✅ No permission system needed
- ✅ Simple ownership model
- ✅ Clear separation of funds

## Why Solana's Approach Is Better

### 1. **Clear Fund Ownership**
- EVM: Owner wallet holds funds, contract pulls via permissions
- Solana: Treasury PDA holds funds, program controls directly

### 2. **No Approval Risk**
- EVM: Requires unlimited approval on owner wallet (huge risk!)
- Solana: Funds moved to treasury once, no approvals

### 3. **Simpler Security Model**
- EVM: Need permission mapping, approval tracking, revocation logic
- Solana: PDA owns funds, program controls via seeds

### 4. **Better Accounting**
- EVM: Owner's personal wallet mixed with program funds
- Solana: Clear separation - treasury is dedicated program account

### 5. **Gas/Fee Transparency**
- EVM: Hidden in permission lookup
- Solana: Explicit in transaction (treasuryUsdc account listed)

## Real-World Example: DAO Notification System

### DAO wants to pay for all member notifications

```rust
pub fn send_dao_notification(
    ctx: Context<SendDaoNotification>,
    recipient: Pubkey,
    subject: String,
    body: String,
) -> Result<()> {
    // Verify caller is DAO member
    let member_account = &ctx.accounts.member_account;
    require!(member_account.is_active, ErrorCode::NotActiveMember);

    msg!("DAO member {} sending notification (DAO treasury pays)",
         ctx.accounts.member.key());

    // DAO treasury pays via PDA signing
    let dao_seeds = &[
        b"dao_treasury",
        &[ctx.accounts.dao_state.treasury_bump],
    ];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.mailer_program.to_account_info(),
        mailer::cpi::accounts::Send {
            sender: ctx.accounts.dao_treasury.to_account_info(),
            sender_usdc: ctx.accounts.dao_treasury_usdc.to_account_info(),
            // ...
        },
        &[dao_seeds],
    );

    mailer::cpi::send(cpi_ctx, recipient, subject, body, false, false)?;

    msg!("Notification sent! DAO treasury paid the fee");
    Ok(())
}
```

**DAO Setup:**
1. Initialize DAO with treasury PDA
2. Deposit USDC to treasury (from DAO votes/fundraising)
3. Members call DAO program to send notifications
4. DAO treasury automatically pays all fees
5. No permission system, no approvals needed!

## Solana Advantages Summary

| Aspect | EVM Permission System | Solana Treasury PDA |
|--------|----------------------|---------------------|
| **Fund Location** | Owner's personal wallet | Dedicated treasury account |
| **Approval Risk** | Unlimited approval required | No approvals needed |
| **System Complexity** | Permission mapping + approvals | PDA seeds only |
| **Transparency** | Hidden permission lookup | Explicit in tx accounts |
| **Separation** | Mixed funds | Clear separation |
| **Security** | Owner wallet always exposed | Treasury isolated |
| **Revocation** | Must track and revoke | Just stop funding treasury |

## Code Comparison Side-by-Side

### EVM: Permission System (Complex)
```solidity
// Mailer contract needs:
mapping(address => address) public permissions;

function setPermission(address contractAddress) external {
    address previousWallet = permissions[contractAddress];
    if (previousWallet != address(0)) {
        emit PermissionRevoked(contractAddress, previousWallet);
    }
    permissions[contractAddress] = msg.sender;
    emit PermissionGranted(contractAddress, msg.sender);
}

function _getPayer(address sender) internal view returns (address) {
    address permittedWallet = permissions[sender];
    return permittedWallet != address(0) ? permittedWallet : sender;
}

function send(...) external {
    address payer = _getPayer(msg.sender);  // Complex lookup
    usdcToken.transferFrom(payer, address(this), fee);  // Pull from wallet
    // ...
}
```

### Solana: Treasury PDA (Simple)
```rust
// UserProgram just needs:
let treasury_seeds = &[b"treasury", &[bump]];

// In send function:
let cpi_ctx = CpiContext::new_with_signer(
    mailer_program.to_account_info(),
    mailer_accounts,
    &[treasury_seeds],  // Simple PDA signing
);

mailer::cpi::send(cpi_ctx, ...)?;  // Transfer from treasury directly
```

**Solana is much simpler!**

## Conclusion

**For "Program owner pays for users" pattern:**

**EVM needs:**
1. Owner approves unlimited USDC to Mailer (risky!)
2. Permission mapping system in Mailer contract
3. Complex permission grant/revoke logic
4. Owner's personal wallet holds and risks funds

**Solana needs:**
1. Create treasury PDA
2. Transfer USDC to treasury (one time or ongoing)
3. Sign CPIs with PDA seeds
4. Dedicated treasury account (clean separation)

**Result:** Solana achieves the same functionality with:
- ✅ No approval risk
- ✅ No permission system
- ✅ Simpler code
- ✅ Better security
- ✅ Clearer accounting

The EVM permission system is a workaround for EVM's approval pattern limitations. Solana's PDA model makes it unnecessary and provides a cleaner, more secure solution!

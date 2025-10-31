# Solana Cross-Program Invocation (CPI) Patterns

## The Question

**Scenario:**
1. User signs transaction to UserProgram
2. UserProgram calls Mailer
3. Mailer needs to transfer USDC to pay fee
4. **Who pays? How does Mailer get authorized to transfer?**

This is the nested program call problem - and Solana solves it elegantly with **signature propagation**!

## Pattern 1: Signature Propagation (User Pays Directly)

### How It Works

When a program makes a Cross-Program Invocation (CPI), **the signer's signature automatically propagates through the call chain**!

```rust
// UserProgram code
pub fn send_notification(ctx: Context<SendNotification>, recipient: Pubkey) -> Result<()> {
    // User signed the outer transaction
    // Their signature AUTOMATICALLY propagates to the CPI!

    let cpi_accounts = mailer::cpi::accounts::Send {
        sender: ctx.accounts.user.to_account_info(),       // User (still signer!)
        sender_usdc: ctx.accounts.user_usdc.to_account_info(),  // User's USDC
        mailer_usdc: ctx.accounts.mailer_usdc.to_account_info(),
        recipient_claim: ctx.accounts.recipient_claim.to_account_info(),
        mailer_account: ctx.accounts.mailer_state.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.mailer_program.to_account_info(),
        cpi_accounts,
    );

    // Make CPI - user's signature flows through!
    mailer::cpi::send(
        cpi_ctx,
        recipient,
        "Notification".to_string(),
        "You have a new alert".to_string(),
        false,  // Standard mode
        false,  // No name resolution
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct SendNotification<'info> {
    #[account(mut)]
    pub user: Signer<'info>,  // User signs outer transaction

    #[account(mut)]
    pub user_usdc: Account<'info, TokenAccount>,  // User's USDC account

    pub mailer_program: Program<'info, Mailer>,
    // ... other accounts
}
```

### Transaction Flow

```
1. User signs transaction:
   Transaction {
       signer: userWallet ✓
       program: UserProgram
       accounts: [userWallet, userUsdcAccount, mailer, ...]
   }

2. UserProgram executes:
   - User is marked as signer ✓
   - UserProgram makes CPI to Mailer

3. CPI to Mailer:
   invoke(
       &mailer_instruction,
       &[userUsdcAccount, mailerUsdcAccount, userWallet, ...]
   )

   🔑 KEY: userWallet STILL has signer status in the CPI!

4. Mailer executes:
   - Checks: Is sender a signer? ✓ YES (propagated)
   - Makes SPL Token transfer:
       transfer(
           from: userUsdcAccount,
           to: mailerUsdcAccount,
           authority: userWallet,  ← Still has signer authority!
           amount: fee
       )

5. SPL Token program validates:
   - Is authority (userWallet) a signer? ✓ YES
   - Transfer succeeds!
```

### Why This Works

**Solana's signer propagation rule:**
- If account X is a signer in the outer transaction
- And you pass X through a CPI
- X **remains a signer** in the CPI context
- All programs in the chain can validate X's signature

**This is fundamentally different from EVM!** In EVM:
- User signs transaction to Contract A
- Contract A calls Contract B
- Contract B's `msg.sender` is Contract A (not user!)
- User's signature doesn't help Contract B at all
- Contract B needs separate approval from user

### Example: Complete Flow

```rust
// User's perspective:
await userProgram.methods
    .sendNotification(recipientPubkey)
    .accounts({
        user: userWallet.publicKey,           // I sign this
        userUsdc: userUsdcAccount,            // My USDC
        mailerProgram: mailerProgramId,
        mailerUsdc: mailerUsdcAccount,
        // ... all required accounts
    })
    .signers([userWallet])  // I sign once
    .rpc();

// What happens:
// 1. I sign transaction to UserProgram
// 2. UserProgram calls Mailer via CPI
// 3. My signature propagates to Mailer
// 4. Mailer transfers from MY USDC account
// 5. All authorized by my ONE signature
// ✅ No approvals needed!
```

## Pattern 2: Program Pays (PDA Authority)

### How It Works

The program owns a token account via PDA and pays on behalf of users.

```rust
// UserProgram has a PDA that owns USDC
#[derive(Accounts)]
pub struct SendNotification<'info> {
    #[account(mut)]
    pub user: Signer<'info>,  // User signs

    #[account(
        mut,
        seeds = [b"program_authority"],
        bump,
    )]
    pub program_authority: SystemAccount<'info>,  // Program's PDA

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = program_authority,  // PDA owns this
    )]
    pub program_usdc: Account<'info, TokenAccount>,  // Program's USDC

    pub mailer_program: Program<'info, Mailer>,
    // ...
}

pub fn send_notification(ctx: Context<SendNotification>, recipient: Pubkey) -> Result<()> {
    let seeds = &[
        b"program_authority",
        &[ctx.bumps.program_authority],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = mailer::cpi::accounts::Send {
        sender: ctx.accounts.program_authority.to_account_info(),  // PDA is sender
        sender_usdc: ctx.accounts.program_usdc.to_account_info(),  // Program's USDC
        // ...
    };

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.mailer_program.to_account_info(),
        cpi_accounts,
        signer_seeds,  // Program signs with PDA seeds
    );

    // Program pays via PDA signature
    mailer::cpi::send(cpi_ctx, recipient, "Alert".to_string(), "...".to_string(), false, false)?;

    Ok(())
}
```

### Transaction Flow

```
1. User signs transaction to UserProgram

2. UserProgram derives PDA:
   program_authority = PDA(["program_authority"], programId)

3. CPI to Mailer with PDA as signer:
   invoke_signed(
       &mailer_instruction,
       &[programUsdcAccount, mailerUsdcAccount, programAuthority, ...],
       &[&[b"program_authority", &[bump]]]  ← Program signs with seeds
   )

4. Mailer executes:
   - Sender is program_authority (PDA)
   - Makes SPL Token transfer from program_usdc

5. SPL Token validates:
   - Authority (program_authority) signed via seeds ✓
   - Transfer succeeds with program's funds
```

### Use Case

This pattern is useful when:
- Program pools funds from multiple users
- Program charges subscription fees to its account
- Program wants to abstract away gas/fee payments from users
- Users deposit USDC to program, program manages all sends

## Comparison: EVM vs Solana

### EVM - Requires Permission System

```solidity
// User transaction flow:
User signs → UserContract → Mailer

// In Mailer.sol:
function send(...) {
    address payer = _getPayer(msg.sender);  // msg.sender = UserContract!
    // Need permission mapping to find actual wallet
    // Then need that wallet to have approved Mailer
    usdcToken.transferFrom(payer, address(this), fee);
}

// Setup required:
// 1. Wallet approves Mailer
// 2. Wallet sets permission for UserContract
// 3. Now UserContract can trigger spends from wallet
```

### Solana - Signature Propagation

```rust
// User transaction flow:
User signs → UserProgram → Mailer (CPI)

// In Mailer program:
pub fn send(ctx: Context<Send>, ...) -> Result<()> {
    // Sender STILL has signer authority (propagated!)
    require!(ctx.accounts.sender.is_signer, ErrorCode::Unauthorized);

    // Transfer directly - sender's signature works
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.sender_usdc.to_account_info(),
                to: ctx.accounts.mailer_usdc.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),  // Still signer!
            }
        ),
        fee_amount,
    )?;
    Ok(())
}

// Setup required:
// NONE! Just sign the transaction!
```

## Why Solana Doesn't Need Permission System

**The key difference:**

**EVM:**
- `msg.sender` changes at each call level
- User → ContractA: msg.sender = User
- ContractA → ContractB: msg.sender = ContractA ❌
- Signature doesn't propagate
- Need permission system as workaround

**Solana:**
- `is_signer` status propagates through CPIs
- User signs transaction
- Program makes CPI
- User's signer status still valid ✓
- No permission system needed

## Security Implications

### Pattern 1 (User Pays)
✅ User explicitly signs transaction
✅ User sees their USDC account in transaction
✅ Transaction shows exact fee amount
✅ No lingering permissions
✅ One signature authorizes entire flow

### Pattern 2 (Program Pays)
✅ Program controls its own funds
✅ Clear separation (program USDC vs user USDC)
✅ Program can implement its own access control
⚠️ Users must trust program with pooled funds

## Real-World Example: DAO Notification System

### Pattern 1: Members Pay Individually

```rust
// Each DAO member pays for their own sends
pub fn send_dao_message(ctx: Context<SendDaoMessage>, ...) -> Result<()> {
    // Verify caller is DAO member
    require!(is_dao_member(&ctx.accounts.sender), ErrorCode::NotMember);

    // CPI to Mailer - member's signature propagates
    mailer::cpi::send(
        CpiContext::new(
            ctx.accounts.mailer_program.to_account_info(),
            Send {
                sender: ctx.accounts.sender,  // Member is signer
                sender_usdc: ctx.accounts.sender_usdc,  // Member pays
                // ...
            }
        ),
        recipient,
        subject,
        body,
        false,
        false,
    )?;

    Ok(())
}
```

### Pattern 2: DAO Treasury Pays

```rust
// DAO treasury pays for all member sends
pub fn send_dao_message(ctx: Context<SendDaoMessage>, ...) -> Result<()> {
    // Verify caller is DAO member
    require!(is_dao_member(&ctx.accounts.sender), ErrorCode::NotMember);

    let dao_seeds = &[b"dao_treasury", &[ctx.bumps.dao_treasury]];

    // CPI to Mailer - DAO PDA signs and pays
    mailer::cpi::send(
        CpiContext::new_with_signer(
            ctx.accounts.mailer_program.to_account_info(),
            Send {
                sender: ctx.accounts.dao_treasury,  // DAO PDA is signer
                sender_usdc: ctx.accounts.dao_treasury_usdc,  // DAO pays
                // ...
            },
            &[dao_seeds],  // DAO signs with PDA
        ),
        recipient,
        subject,
        body,
        false,
        false,
    )?;

    Ok(())
}
```

## Conclusion

**How Solana programs allow Mailer to transfer:**

1. **Signature Propagation** (Pattern 1):
   - User signs outer transaction
   - Signature propagates through CPI chain
   - Mailer can transfer from user's account using propagated signature
   - No approval needed!

2. **PDA Authority** (Pattern 2):
   - Program owns token account via PDA
   - Program signs for PDA using seeds
   - Mailer transfers from program's account
   - Program manages its own funds

**Key Insight:** Solana's signature propagation through CPIs eliminates the need for EVM's approval + permission pattern. The user's signature flows through the entire call chain, authorizing all operations in one transaction.

This is why Solana's Mailer doesn't need (and shouldn't have) a permission system - the blockchain architecture itself provides a cleaner solution!

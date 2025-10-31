# Solana Security Model: How It Works Without Approvals

## The Core Question

**Without EVM's `approve()` pattern, how does Solana prevent unauthorized token transfers?**

Short answer: **Account ownership + explicit transaction signing**

## EVM Security Model (Approval Pattern)

### How EVM Works

```solidity
// Your tokens live in the token contract's mapping
mapping(address => uint256) balances;

// To let someone spend your tokens:
function approve(address spender, uint256 amount) {
    allowances[msg.sender][spender] = amount;
}

// They can then transfer up to that amount:
function transferFrom(address from, address to, uint256 amount) {
    require(allowances[from][msg.sender] >= amount);
    balances[from] -= amount;
    balances[to] += amount;
    allowances[from][msg.sender] -= amount;
}
```

### EVM Security Properties

✅ **Protections:**
- Can't spend tokens without approval
- Approval limits maximum spend

❌ **Vulnerabilities:**
- **Forgotten approvals**: Unlimited approvals left on compromised contracts
- **Frontrunning attacks**: Changing approval amount can be exploited
- **Implicit permissions**: Approvals sit dormant until used
- **No visibility**: Hard to track all active approvals
- **Phishing**: Users often approve maximum amount (`type(uint256).max`)

### Real Example of EVM Vulnerability

```javascript
// User approves unlimited USDC to "trusted" DeFi protocol
await usdc.approve(protocol, ethers.MaxUint256);

// 6 months later, protocol gets hacked...
// Attacker drains all USDC from all users who ever approved!
// User never signed new transaction - just used old approval
```

## Solana Security Model (No Approvals Needed)

### How Solana Works

In Solana, **you own separate token accounts**, not just an entry in a mapping:

```
Your Wallet Address: 7xKX...Q9Ym
    ↓ owns
Your USDC Token Account: 4pB9...8fHq
    {
        owner: 7xKX...Q9Ym,      ← Only YOU can authorize transfers
        mint: USDC,              ← What token this is
        amount: 1000_000000      ← Balance (1000 USDC)
    }
```

### Security Through Explicit Signing

**Rule: You must sign every transaction that touches your token account**

```rust
// To send a message through Mailer (costs 0.01 USDC):

pub struct Send {
    pub sender: Signer<'info>,           // Must sign! ✓
    pub sender_usdc: Account<'info, TokenAccount>,  // Your token account
    pub mailer_usdc: Account<'info, TokenAccount>,  // Mailer's account
    pub token_program: Program<'info, Token>,
}

// When you call this instruction:
// 1. YOU must sign the transaction
// 2. Transaction explicitly lists YOUR token account
// 3. SPL Token program validates YOU are the owner
// 4. Transfer only happens if validation passes
```

### What About Smart Contracts?

**Contracts use PDAs (Program Derived Addresses) to own token accounts:**

```rust
// Contract derives a PDA it controls
let (contract_pda, bump) = Pubkey::find_program_address(
    &[b"contract"],
    &program_id
);

// Contract creates token account owned by this PDA
let contract_usdc_account = create_token_account(
    owner: contract_pda,  // PDA owns it
    mint: USDC
);

// Contract can sign for this PDA using seeds
invoke_signed(
    &transfer_instruction,
    &accounts,
    &[&[b"contract", &[bump]]]  // Program signs with PDA authority
)?;
```

**The contract "owns" the token account via PDA. Only the program can sign for it.**

## Security Comparison

### Scenario 1: User Sends Message

**EVM:**
```javascript
// Step 1: User approves (one time)
await usdc.approve(mailer, ethers.MaxUint256);  // Unlimited approval!

// Step 2: User sends message
await mailer.send(to, subject, body);
// ⚠️ User only signed this transaction
// ⚠️ But mailer can now spend unlimited USDC (from old approval)
// ⚠️ If mailer gets hacked later, all approved funds at risk
```

**Solana:**
```javascript
// Send message (no prior approval needed)
await program.methods
    .send(to, subject, body)
    .accounts({
        sender: userWallet.publicKey,
        senderUsdc: userUsdcAccount,  // Explicit account reference
        mailerUsdc: mailerUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

// ✅ User signs THIS specific transaction
// ✅ Transaction explicitly states which accounts involved
// ✅ No lingering permissions
// ✅ If program gets hacked tomorrow, user's funds are safe
```

### Scenario 2: Smart Contract Sends Message

**EVM (needs permission system):**
```solidity
// Wallet must pre-approve + set permission
usdc.approve(mailer, 1000 * 10**6);  // Risky!
mailer.setPermission(myContract);     // Risky!

// Now contract can spend wallet's tokens
contract.sendMessage(...);
// ⚠️ Contract calls mailer, which pulls from wallet
// ⚠️ Wallet doesn't sign this specific transaction
// ⚠️ Relies on permission system security
```

**Solana (no permission system needed):**
```rust
// Contract has its own token account with funds
let contract_usdc = PDA_token_account;

// Contract sends using its own funds
program.methods
    .send(to, subject, body)
    .accounts({
        sender: contractPDA,
        senderUsdc: contractUsdcAccount,  // Contract's OWN account
        mailerUsdc: mailerUsdcAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([contractPDA])  // Contract signs (via PDA authority)
    .rpc();

// ✅ Contract spends its OWN funds (not user's)
// ✅ No permission system needed
// ✅ Clear ownership model
```

## Security Properties Comparison

| Property | EVM (Approval) | Solana (No Approval) |
|----------|----------------|----------------------|
| **Authorization Method** | Pre-approve spending limits | Sign each transaction explicitly |
| **Forgotten Permissions** | ❌ Approvals linger forever | ✅ No lingering permissions |
| **Visibility** | ❌ Hard to track approvals | ✅ Clear in each transaction |
| **Phishing Risk** | ❌ Users approve max amounts | ✅ Users see exact amount each time |
| **Frontrunning** | ❌ Approval changes exploitable | ✅ No approval mechanism to exploit |
| **Hacked Contract Risk** | ❌ Can drain all past approvers | ✅ Only affects active signers |
| **Transaction Clarity** | ⚠️ Implicit (via approvals) | ✅ Explicit (accounts listed) |

## Real-World Attack Scenarios

### EVM Approval Attack (Common)

```
1. User approves infinite USDC to DEX in 2023
2. User forgets about approval
3. DEX contract gets exploited in 2024
4. Attacker drains user's USDC
5. User never signed anything in 2024!
```

**Fix:** User must manually revoke approval (if they remember)

### Solana Equivalent (Not Possible)

```
1. User sends message via Mailer in 2023
2. Transaction completes, no lingering permissions
3. Mailer program gets exploited in 2024
4. Attacker cannot touch user's tokens
5. User's token account still owned by user!
```

**Why:** No approval to exploit. Each transaction requires fresh signature.

## Key Insight: Account Ownership Model

### EVM
- **Your tokens** = entry in token contract's mapping
- **Security** = trust the contract to check approvals
- **Spending** = contract pulls from your balance (if approved)

### Solana
- **Your tokens** = you own a token account on-chain
- **Security** = you must sign to authorize any transfer out
- **Spending** = explicit transaction you sign with accounts listed

## Practical Example: Mailer Usage

### EVM - User Flow
```javascript
// One-time setup (risky!)
await usdc.approve(mailer, MAX_UINT);  // ⚠️ Unlimited approval

// Send 100 messages over 2 years
for (let i = 0; i < 100; i++) {
    await mailer.send(...);  // Uses old approval each time
}

// If Mailer gets hacked during those 2 years?
// → Attacker drains all USDC from all users who approved
```

### Solana - User Flow
```javascript
// No setup needed!

// Send 100 messages over 2 years
for (let i = 0; i < 100; i++) {
    await program.methods.send(...)
        .accounts({
            senderUsdc: myUsdcAccount  // Explicit each time
        })
        .signers([myWallet])  // Sign each time
        .rpc();
}

// If Mailer gets hacked during those 2 years?
// → Only affects transactions happening RIGHT NOW (that users sign)
// → Past users safe, future users safe
```

## Why Solana's Model Is More Secure

1. **Explicit Authorization**: Every transaction requires signature
2. **No Forgotten Permissions**: No approvals to forget about
3. **Clear Intent**: User sees exactly which accounts are involved
4. **Time-Limited Risk**: Only at-risk during active transaction
5. **Ownership Model**: You own the account, period
6. **No Phishing Approvals**: Can't trick users into approving max amounts

## The Trade-off

### EVM Advantage
- **Convenience**: Approve once, use many times
- **Gas Efficiency**: One approval for multiple operations

### Solana Advantage
- **Security**: Must sign each transaction explicitly
- **Transparency**: Always clear what's happening
- **No Lingering Risk**: No forgotten approvals to exploit

## Conclusion

Solana's security model without approvals is actually **more secure** because:

1. **No implicit permissions** - each transaction is explicit
2. **No forgotten approvals** - common EVM vulnerability
3. **Clear ownership** - you own your token account
4. **Transaction-scoped risk** - only at risk when actively signing
5. **No approval phishing** - can't trick users into infinite approvals

The EVM permission system in our Mailer contract is a **workaround for EVM's limitations**, not a security feature. Solana doesn't need this workaround because its architecture is inherently more secure through explicit transaction signing and account ownership.

## For Users

**EVM:** "I approved this contract once. It can spend my tokens until I revoke."
- ⚠️ Must track and revoke old approvals
- ⚠️ Risk from compromised contracts you approved years ago

**Solana:** "I'm signing this specific transaction right now with these exact accounts."
- ✅ No tracking needed
- ✅ No risk from past interactions
- ✅ Clear what you're authorizing

Solana's model is: **Sign what you see, each time you interact.**

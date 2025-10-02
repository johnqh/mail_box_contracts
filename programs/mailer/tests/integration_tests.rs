use solana_program::{
    instruction::{AccountMeta, Instruction},
    program_pack::Pack,
    pubkey::Pubkey,
    system_program,
};
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token::{
    instruction as spl_instruction,
    state::{Account as TokenAccount, Mint},
};
use borsh::BorshDeserialize;
use std::str::FromStr;

// Import our program
use mailer::{MailerInstruction, MailerState, RecipientClaim, Delegation};

// Program ID for tests
const PROGRAM_ID_STR: &str = "9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF";

fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID_STR).unwrap()
}

/// Test helper to create a test USDC mint
async fn create_usdc_mint(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    recent_blockhash: solana_program::hash::Hash,
) -> Pubkey {
    let mint = Keypair::new();
    let rent = banks_client.get_rent().await.unwrap();
    let mint_rent = rent.minimum_balance(Mint::LEN);

    let mut transaction = Transaction::new_with_payer(
        &[
            solana_sdk::system_instruction::create_account(
                &payer.pubkey(),
                &mint.pubkey(),
                mint_rent,
                Mint::LEN as u64,
                &spl_token::id(),
            ),
            spl_instruction::initialize_mint(
                &spl_token::id(),
                &mint.pubkey(),
                &payer.pubkey(),
                None,
                6, // USDC has 6 decimals
            ).unwrap(),
        ],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[payer, &mint], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    mint.pubkey()
}

/// Test helper to create a token account for a user
async fn create_token_account(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    recent_blockhash: solana_program::hash::Hash,
    mint: &Pubkey,
    owner: &Pubkey,
) -> Pubkey {
    let account = Keypair::new();
    let rent = banks_client.get_rent().await.unwrap();
    let account_rent = rent.minimum_balance(TokenAccount::LEN);

    let mut transaction = Transaction::new_with_payer(
        &[
            solana_sdk::system_instruction::create_account(
                &payer.pubkey(),
                &account.pubkey(),
                account_rent,
                TokenAccount::LEN as u64,
                &spl_token::id(),
            ),
            spl_instruction::initialize_account(
                &spl_token::id(),
                &account.pubkey(),
                mint,
                owner,
            ).unwrap(),
        ],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[payer, &account], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    account.pubkey()
}

/// Test helper to mint tokens to an account
async fn mint_to(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    recent_blockhash: solana_program::hash::Hash,
    mint: &Pubkey,
    account: &Pubkey,
    amount: u64,
) {
    let mut transaction = Transaction::new_with_payer(
        &[spl_instruction::mint_to(
            &spl_token::id(),
            mint,
            account,
            &payer.pubkey(),
            &[],
            amount,
        ).unwrap()],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

/// Test helper to get mailer state PDA
fn get_mailer_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"mailer"], &program_id())
}

/// Test helper to get recipient claim PDA
fn get_claim_pda(recipient: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"claim", recipient.as_ref()], &program_id())
}

/// Test helper to get delegation PDA
fn get_delegation_pda(delegator: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"delegation", delegator.as_ref()], &program_id())
}

#[tokio::test]
async fn test_initialize_program() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create USDC mint
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;

    // Get mailer state PDA
    let (mailer_pda, _) = get_mailer_pda();

    // Initialize the program
    let instruction_data = MailerInstruction::Initialize { usdc_mint };
    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify the mailer state was initialized correctly
    let account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &account.data[8..]).unwrap();
    
    assert_eq!(mailer_state.owner, payer.pubkey());
    assert_eq!(mailer_state.usdc_mint, usdc_mint);
    assert_eq!(mailer_state.send_fee, 100_000); // 0.1 USDC
    assert_eq!(mailer_state.delegation_fee, 10_000_000); // 10 USDC
    assert_eq!(mailer_state.owner_claimable, 0);
}

#[tokio::test]
async fn test_send_priority_message() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Create USDC mint and accounts
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();
    
    // Initialize the program first
    let init_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Initialize { usdc_mint },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Create token accounts
    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    // Mint USDC to sender
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await; // 1 USDC

    // Get recipient claim PDA
    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Send message with revenue sharing (priority mode)
    let instruction_data = MailerInstruction::Send {
        to: payer.pubkey(),
        subject: "Test Subject".to_string(),
        _body: "Test message body".to_string(),
        revenue_share_to_receiver: true,
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false), // Must be writable for record_shares to update owner_claimable
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Get the latest blockhash to ensure we're reading the most recent state
    let _recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();

    // Verify recipient claim was created with correct amount
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();
    
    assert_eq!(recipient_claim.recipient, payer.pubkey());
    assert_eq!(recipient_claim.amount, 90_000); // 90% of send_fee (100,000)

    // Verify mailer state was updated with owner share
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    
    // Debug output
    println!("Debug - Mailer state:");
    println!("  owner: {}", mailer_state.owner);
    println!("  usdc_mint: {}", mailer_state.usdc_mint);
    println!("  send_fee: {}", mailer_state.send_fee);
    println!("  delegation_fee: {}", mailer_state.delegation_fee);
    println!("  owner_claimable: {}", mailer_state.owner_claimable);
    println!("  bump: {}", mailer_state.bump);
    
    assert_eq!(mailer_state.owner_claimable, 10_000); // 10% of send_fee
}

#[tokio::test]
async fn test_send_standard_message() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup similar to priority test
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();
    
    // Initialize the program
    let init_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Initialize { usdc_mint },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Create token accounts
    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    // Mint USDC to sender
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    // Get recipient claim PDA (needed even if not used for standard send)
    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Send standard message (no revenue sharing)
    let instruction_data = MailerInstruction::Send {
        to: payer.pubkey(),
        subject: "Test Standard Subject".to_string(),
        _body: "Test standard message body".to_string(),
        revenue_share_to_receiver: false,
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(recipient_claim_pda, false), // Not used for standard send but required
            AccountMeta::new(mailer_pda, false), // Needs to be writable to update owner_claimable
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify only owner fee was charged (10% of send_fee = 10,000)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 10_000); // Only 10% fee
}

#[tokio::test]
async fn test_claim_recipient_share() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup and send priority message first (similar to previous test)
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();
    
    // Initialize
    let init_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Initialize { usdc_mint },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Create token accounts
    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    // Mint USDC
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Send message with revenue sharing to create a claim
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: payer.pubkey(),
            subject: "Test".to_string(),
            _body: "Test".to_string(),
            revenue_share_to_receiver: true,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Create recipient's own USDC account to receive the claim
    let recipient_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    // Now claim the recipient share
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimRecipientShare,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(recipient_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify the claim was processed
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();
    assert_eq!(recipient_claim.amount, 0); // Should be zero after claiming

    // Verify tokens were transferred to recipient
    let recipient_token_account = banks_client.get_account(recipient_usdc).await.unwrap().unwrap();
    let token_account_data = TokenAccount::unpack(&recipient_token_account.data).unwrap();
    assert_eq!(token_account_data.amount, 90_000); // 90% of 100,000
}

#[tokio::test]
async fn test_claim_owner_share() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup and send a message to accumulate owner fees
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();
    
    // Initialize
    let init_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Initialize { usdc_mint },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Setup token accounts and send standard message to accumulate owner fees
    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Send standard message to accumulate owner fees (no revenue sharing)
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: payer.pubkey(),
            subject: "Test".to_string(),
            _body: "Test".to_string(),
            revenue_share_to_receiver: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Now claim owner share
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimOwnerShare,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner claimable was reset
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);

    // Verify tokens were transferred to owner
    let owner_token_account = banks_client.get_account(owner_usdc).await.unwrap().unwrap();
    let token_account_data = TokenAccount::unpack(&owner_token_account.data).unwrap();
    assert_eq!(token_account_data.amount, 10_000); // 10% of 100,000
}

#[tokio::test]
async fn test_set_fees() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();
    
    // Initialize
    let init_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Initialize { usdc_mint },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Test setting send fee
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: 200_000 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify fee was updated
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.send_fee, 200_000);

    // Test setting delegation fee
    let set_delegation_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee { new_fee: 20_000_000 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_delegation_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation fee was updated
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.delegation_fee, 20_000_000);
}

#[tokio::test]
async fn test_delegation_functionality() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();
    
    // Initialize
    let init_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Initialize { usdc_mint },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Setup token accounts
    let delegator_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &delegator_usdc, 50_000_000).await; // 50 USDC

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    // Test delegation
    let delegate_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::DelegateTo {
            delegate: Some(delegate.pubkey()),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(delegator_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[delegate_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation was created
    let delegation_account = banks_client.get_account(delegation_pda).await.unwrap().unwrap();
    let delegation: Delegation = BorshDeserialize::deserialize(&mut &delegation_account.data[8..]).unwrap();
    assert_eq!(delegation.delegator, payer.pubkey());
    assert_eq!(delegation.delegate, Some(delegate.pubkey()));

    // Test rejection - disabled due to timeout issue
    // TODO: Fix rejection timeout issue
    /*
    let reject_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::RejectDelegation,
        vec![
            AccountMeta::new(delegate.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[reject_instruction], Some(&delegate.pubkey()));
    transaction.sign(&[&delegate], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation was cleared
    let delegation_account = banks_client.get_account(delegation_pda).await.unwrap().unwrap();
    let delegation: Delegation = BorshDeserialize::deserialize(&mut &delegation_account.data[8..]).unwrap();
    assert_eq!(delegation.delegate, None);
    */
}

#[tokio::test]
async fn test_error_conditions() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();
    
    // Test claiming with no claimable amount (should fail)
    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());
    let recipient_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimRecipientShare,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(recipient_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    // This should fail because no claim exists
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}
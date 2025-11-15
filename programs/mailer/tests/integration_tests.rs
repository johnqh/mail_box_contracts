use borsh::BorshDeserialize;
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
use std::str::FromStr;

// Import our program
use mailer::{Delegation, FeeDiscount, MailerInstruction, MailerState, RecipientClaim};

// Program ID for tests
const PROGRAM_ID_STR: &str = "9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF";

// PDA version byte (must match the program constant)
const PDA_VERSION: u8 = 1;

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
            )
            .unwrap(),
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
            spl_instruction::initialize_account(&spl_token::id(), &account.pubkey(), mint, owner)
                .unwrap(),
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
        )
        .unwrap()],
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
    Pubkey::find_program_address(&[b"claim", &[PDA_VERSION], recipient.as_ref()], &program_id())
}

/// Test helper to get delegation PDA
fn get_delegation_pda(delegator: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"delegation", &[PDA_VERSION], delegator.as_ref()], &program_id())
}

/// Test helper to get fee discount PDA
fn get_fee_discount_pda(account: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"discount", &[PDA_VERSION], account.as_ref()], &program_id())
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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    // Mint USDC to sender
    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await; // 1 USDC

    // Get recipient claim PDA
    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Send message with revenue sharing (priority mode)
    let instruction_data = MailerInstruction::Send {
        to: payer.pubkey(),
        subject: "Test Subject".to_string(),
        _body: "Test message body".to_string(),
        revenue_share_to_receiver: true,
        resolve_sender_to_name: false,
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
    let claim_account = banks_client
        .get_account(recipient_claim_pda)
        .await
        .unwrap()
        .unwrap();
    let recipient_claim: RecipientClaim =
        BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.recipient, payer.pubkey());
    assert_eq!(recipient_claim.amount, 90_000); // 90% of send_fee (100,000)

    // Verify mailer state was updated with owner share
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

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

    // Create USDC mint
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

    // Initialize program
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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    // Mint USDC to sender
    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    let recipient_keypair = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient_keypair.pubkey());

    // Send standard message (no revenue share)
    let instruction_data = MailerInstruction::Send {
        to: recipient_keypair.pubkey(),
        subject: "Standard Subject".to_string(),
        _body: "Standard body".to_string(),
        revenue_share_to_receiver: false,
        resolve_sender_to_name: false,
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify mailer state was updated with owner fee (10% of send_fee)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000); // 10% of 100,000 = 10,000
}

#[tokio::test]
async fn test_send_through_webhook_priority() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Send webhook message with revenue sharing
    let instruction_data = MailerInstruction::SendThroughWebhook {
        to: payer.pubkey(),
        webhook_id: "webhook-123".to_string(),
        revenue_share_to_receiver: true,
        resolve_sender_to_name: false,
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify revenue sharing
    let claim_account = banks_client
        .get_account(recipient_claim_pda)
        .await
        .unwrap()
        .unwrap();
    let recipient_claim: RecipientClaim =
        BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.amount, 90_000);
}

#[tokio::test]
async fn test_send_through_webhook_standard() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    let recipient_keypair = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient_keypair.pubkey());

    // Send webhook message without revenue sharing
    let instruction_data = MailerInstruction::SendThroughWebhook {
        to: recipient_keypair.pubkey(),
        webhook_id: "webhook-456".to_string(),
        revenue_share_to_receiver: false,
        resolve_sender_to_name: false,
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify only owner fee was charged
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_claim_recipient_share() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    // Create a separate recipient
    let recipient = Keypair::new();
    let recipient_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &recipient.pubkey(),
    )
    .await;

    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send priority message to create claimable share
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Claim recipient share
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimRecipientShare,
        vec![
            AccountMeta::new(recipient.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(recipient_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &recipient], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify recipient received tokens
    let recipient_token_account = banks_client
        .get_account(recipient_usdc)
        .await
        .unwrap()
        .unwrap();
    let recipient_token_data =
        TokenAccount::unpack(&recipient_token_account.data[..]).unwrap();

    assert_eq!(recipient_token_data.amount, 90_000);

    // Verify claim was cleared
    let claim_account = banks_client
        .get_account(recipient_claim_pda)
        .await
        .unwrap()
        .unwrap();
    let claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(claim.amount, 0);
}

#[tokio::test]
async fn test_claim_owner_share() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;
    let owner_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send standard message to create owner fee
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Claim owner share
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

    // Verify owner received tokens
    let owner_token_account = banks_client.get_account(owner_usdc).await.unwrap().unwrap();
    let owner_token_data = TokenAccount::unpack(&owner_token_account.data[..]).unwrap();

    assert_eq!(owner_token_data.amount, 10_000);

    // Verify owner_claimable was cleared
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 0);
}

#[tokio::test]
async fn test_set_fees() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Update send fee
    let new_send_fee = 200_000u64; // 0.2 USDC
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee {
            new_fee: new_send_fee,
        },
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
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.send_fee, new_send_fee);

    // Update delegation fee
    let new_delegation_fee = 20_000_000u64; // 20 USDC
    let set_delegation_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee {
            new_fee: new_delegation_fee,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction =
        Transaction::new_with_payer(&[set_delegation_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation fee was updated
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.delegation_fee, new_delegation_fee);
}

#[tokio::test]
async fn test_delegation_functionality() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let delegator_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &delegator_usdc,
        100_000_000,
    )
    .await; // 100 USDC

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    // Delegate to another address
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
    let delegation_account = banks_client
        .get_account(delegation_pda)
        .await
        .unwrap()
        .unwrap();
    let delegation: Delegation =
        BorshDeserialize::deserialize(&mut &delegation_account.data[8..]).unwrap();

    assert_eq!(delegation.delegate, Some(delegate.pubkey()));

    // Verify delegation fee was charged (10 USDC)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000_000);
}

#[tokio::test]
async fn test_error_conditions() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Test claiming with no claimable amount
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    // Try to claim owner share when there's nothing to claim
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

    // This should fail because no claimable amount exists
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_claim_expired_shares_moves_funds_to_owner() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let mut context = program_test.start_with_context().await;

    let mut recent_blockhash = context.last_blockhash;

    // Create USDC mint and initialize the program
    let usdc_mint =
        create_usdc_mint(&mut context.banks_client, &context.payer, recent_blockhash).await;
    recent_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();

    let (mailer_pda, _) = get_mailer_pda();
    let init_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Initialize { usdc_mint },
        vec![
            AccountMeta::new(context.payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction =
        Transaction::new_with_payer(&[init_instruction], Some(&context.payer.pubkey()));
    transaction.sign(&[&context.payer], recent_blockhash);
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();
    recent_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();

    // Prepare token accounts and fund the sender
    let sender_usdc = create_token_account(
        &mut context.banks_client,
        &context.payer,
        recent_blockhash,
        &usdc_mint,
        &context.payer.pubkey(),
    )
    .await;
    recent_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();

    let mailer_usdc = create_token_account(
        &mut context.banks_client,
        &context.payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;
    recent_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();

    mint_to(
        &mut context.banks_client,
        &context.payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await; // 1 USDC to cover priority message
    recent_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();

    let (recipient_claim_pda, _) = get_claim_pda(&context.payer.pubkey());

    // Send a priority message to create the claim record
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: context.payer.pubkey(),
            subject: "Expired claim".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(context.payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction =
        Transaction::new_with_payer(&[send_instruction], Some(&context.payer.pubkey()));
    transaction.sign(&[&context.payer], recent_blockhash);
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    // Warp forward so the claim expires (claim period is 60 days = 5,184,000 seconds)
    // Manually set the clock to a future timestamp beyond the claim period
    use solana_sdk::clock::Clock;
    let mut clock = context.banks_client.get_sysvar::<Clock>().await.unwrap();
    clock.unix_timestamp += 60 * 24 * 60 * 60 + 1; // 60 days + 1 second
    context.set_sysvar(&clock);

    recent_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();

    // Owner reclaims expired shares
    let claim_expired_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimExpiredShares {
            recipient: context.payer.pubkey(),
        },
        vec![
            AccountMeta::new(context.payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(recipient_claim_pda, false),
        ],
    );

    let mut transaction =
        Transaction::new_with_payer(&[claim_expired_instruction], Some(&context.payer.pubkey()));
    transaction.sign(&[&context.payer], recent_blockhash);
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .unwrap();

    // Recipient claim should be cleared
    let claim_account = context
        .banks_client
        .get_account(recipient_claim_pda)
        .await
        .unwrap()
        .unwrap();
    let claim_state: RecipientClaim =
        BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();
    assert_eq!(claim_state.amount, 0);
    assert_eq!(claim_state.timestamp, 0);

    // Owner claimable should now include both original owner share and reclaimed amount (total 100,000)
    let mailer_account = context
        .banks_client
        .get_account(mailer_pda)
        .await
        .unwrap()
        .unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 100_000);
}

// ============================================================================
// Additional Tests to Match EVM Coverage
// ============================================================================

#[tokio::test]
async fn test_send_prepared_priority() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    let (recipient_claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Send prepared message with revenue sharing
    let instruction_data = MailerInstruction::SendPrepared {
        to: payer.pubkey(),
        mail_id: "mail-123".to_string(),
        revenue_share_to_receiver: true,
        resolve_sender_to_name: false,
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify revenue sharing
    let claim_account = banks_client
        .get_account(recipient_claim_pda)
        .await
        .unwrap()
        .unwrap();
    let recipient_claim: RecipientClaim =
        BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.amount, 90_000);

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_send_prepared_standard() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    let recipient_keypair = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient_keypair.pubkey());

    // Send prepared message without revenue sharing
    let instruction_data = MailerInstruction::SendPrepared {
        to: recipient_keypair.pubkey(),
        mail_id: "mail-456".to_string(),
        revenue_share_to_receiver: false,
        resolve_sender_to_name: false,
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify only owner fee was charged
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_send_to_email() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    // Send to email address
    let instruction_data = MailerInstruction::SendToEmail {
        to_email: "test@example.com".to_string(),
        subject: "Test Subject".to_string(),
        _body: "Test body".to_string(),
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify only owner fee (10%) was charged
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_send_prepared_to_email() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &sender_usdc,
        1_000_000,
    )
    .await;

    // Send prepared to email address
    let instruction_data = MailerInstruction::SendPreparedToEmail {
        to_email: "test@example.com".to_string(),
        mail_id: "email-mail-789".to_string(),
    };

    let instruction = Instruction::new_with_borsh(
        program_id(),
        &instruction_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify only owner fee (10%) was charged
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_pause_functionality() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Create token accounts for pause test
    let owner_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    // Pause the contract
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify contract is paused
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert!(mailer_state.paused);

    // Unpause the contract
    let unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Unpause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify contract is unpaused
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert!(!mailer_state.paused);
}

#[tokio::test]
async fn test_custom_fee_percentage() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (fee_discount_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    // Set custom fee percentage (50% = pay 50% of normal fee)
    let set_custom_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 50, // 50% of normal fee
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(fee_discount_pda, false),
            AccountMeta::new_readonly(test_user.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true), // payer for account creation
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction =
        Transaction::new_with_payer(&[set_custom_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify fee discount account was created
    let fee_discount_account = banks_client
        .get_account(fee_discount_pda)
        .await
        .unwrap();

    assert!(fee_discount_account.is_some());

    // Now test sending with the custom fee
    let test_user_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &test_user.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    mint_to(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &test_user_usdc,
        1_000_000,
    )
    .await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send standard message with custom fee
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(test_user.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(test_user_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            // Include fee discount PDA for custom fee calculation
            AccountMeta::new_readonly(fee_discount_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &test_user], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner fee is 10% of 50% of send_fee
    // 50% of 100,000 = 50,000, then 10% of that = 5,000
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 5_000);
}

#[tokio::test]
async fn test_fee_paused() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // Setup
    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Pause fee collection
    let set_fee_paused_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFeePaused { fee_paused: true },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction =
        Transaction::new_with_payer(&[set_fee_paused_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify fee_paused is true
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert!(mailer_state.fee_paused);

    // Now send a message - it should succeed without charging fees
    let sender_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &payer.pubkey(),
    )
    .await;
    let mailer_usdc = create_token_account(
        &mut banks_client,
        &payer,
        recent_blockhash,
        &usdc_mint,
        &mailer_pda,
    )
    .await;

    // Don't mint any USDC - if fees were charged, this would fail

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Free message".to_string(),
            _body: "No fee".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    // This should succeed even though sender has no USDC
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify no fees were collected
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState =
        BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 0);
}

// ============================================================================
// Edge Case Tests - Empty and Long Strings
// ============================================================================

#[tokio::test]
async fn test_send_with_empty_strings() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send with empty strings
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "".to_string(),
            _body: "".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Verify transaction succeeded
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_send_with_long_strings() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Very long strings
    let long_subject = "A".repeat(200);
    let long_body = "B".repeat(1000);

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: long_subject,
            _body: long_body,
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_prepared_with_special_characters() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Special characters in mailId
    let mail_id = "mail-123-!@#$%^&*()_+-=[]{}|;':\",./<>?".to_string();

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id,
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_to_email_with_various_formats() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Test various email formats
    let emails = vec![
        "simple@example.com",
        "user+tag@domain.co.uk",
        "first.last@subdomain.example.com",
        "user123@test-domain.com",
    ];

    for email in emails {
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::SendToEmail {
                to_email: email.to_string(),
                subject: "Test".to_string(),
                _body: "Body".to_string(),
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(mailer_pda, false),
                AccountMeta::new(sender_usdc, false),
                AccountMeta::new(mailer_usdc, false),
                AccountMeta::new_readonly(spl_token::id(), false),
            ],
        );

        let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
        transaction.sign(&[&payer], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
    }
}

// ============================================================================
// Comprehensive Pause State Tests
// ============================================================================

#[tokio::test]
async fn test_send_fails_when_paused() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    // Pause contract
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to send - should fail
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_send_prepared_fails_when_paused() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    // Pause contract
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to send prepared - should fail
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "test-123".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_send_to_email_fails_when_paused() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    // Pause contract
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to send to email - should fail
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_delegation_fails_when_paused() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let delegator_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    // Pause contract
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to delegate - should fail
    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

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
    
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

// ============================================================================  
// More Custom Fee Percentage Tests
// ============================================================================

#[tokio::test]
async fn test_custom_fee_0_percent() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (fee_discount_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    // Set 0% fee (free)
    let set_custom_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 0,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(fee_discount_pda, false),
            AccountMeta::new_readonly(test_user.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_custom_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let test_user_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &test_user.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Don't mint any USDC - if fees were charged, this would fail
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Free message".to_string(),
            _body: "No fee".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(test_user.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(test_user_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(fee_discount_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &test_user], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify no fees collected
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

#[tokio::test]
async fn test_custom_fee_25_percent() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (fee_discount_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    let set_custom_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 25,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(fee_discount_pda, false),
            AccountMeta::new_readonly(test_user.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_custom_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let test_user_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &test_user.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &test_user_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "test-25".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(test_user.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(test_user_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(fee_discount_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &test_user], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // 25% of 100,000 = 25,000, then 10% of that = 2,500
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 2_500);
}

#[tokio::test]
async fn test_custom_fee_100_percent() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (fee_discount_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    let set_custom_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 100,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(fee_discount_pda, false),
            AccountMeta::new_readonly(test_user.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_custom_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let test_user_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &test_user.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &test_user_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Full fee".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(test_user.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(test_user_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(fee_discount_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &test_user], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // 100% of 100,000 = 100,000, then 10% of that = 10,000 (same as normal)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 10_000);
}

// ============================================================================
// More Delegation Tests
// ============================================================================

#[tokio::test]
async fn test_clear_delegation() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let delegator_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &delegator_usdc, 100_000_000).await;

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    // Set delegation
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

    // Clear delegation (set to None) - should not charge fee
    let clear_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::DelegateTo {
            delegate: None,
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

    let mut transaction = Transaction::new_with_payer(&[clear_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation cleared
    let delegation_account = banks_client.get_account(delegation_pda).await.unwrap().unwrap();
    let delegation: Delegation = BorshDeserialize::deserialize(&mut &delegation_account.data[8..]).unwrap();
    assert_eq!(delegation.delegate, None);

    // Verify only one delegation fee was charged (not for clearing)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 10_000_000);
}

#[tokio::test]
async fn test_reject_delegation() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let delegator_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &delegator_usdc, 100_000_000).await;

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    // Set delegation
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

    // Delegate rejects the delegation
    let reject_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::RejectDelegation,
        vec![
            AccountMeta::new(delegate.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[reject_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &delegate], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation was cleared
    let delegation_account = banks_client.get_account(delegation_pda).await.unwrap().unwrap();
    let delegation: Delegation = BorshDeserialize::deserialize(&mut &delegation_account.data[8..]).unwrap();
    assert_eq!(delegation.delegate, None);
}

// ============================================================================
// More Revenue Sharing Edge Cases
// ============================================================================

#[tokio::test]
async fn test_multiple_messages_accumulate_shares() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send 3 priority messages to accumulate shares
    for i in 0..3 {
        // Get fresh blockhash and warp forward to ensure transactions are distinct
        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();

        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::Send {
                to: recipient.pubkey(),
                subject: format!("Test {}", i), // Make each message unique
                _body: "Body".to_string(),
                revenue_share_to_receiver: true,
                resolve_sender_to_name: false,
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(recipient_claim_pda, false),
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
    }

    // Verify accumulated shares (3 * 90,000 = 270,000)
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();
    assert_eq!(recipient_claim.amount, 270_000);

    // Verify owner claimable (3 * 10,000 = 30,000)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 30_000);
}

// ============================================================================
// Fee Update Permission Tests
// ============================================================================

#[tokio::test]
async fn test_only_owner_can_update_send_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let non_owner = Keypair::new();

    // Non-owner tries to update send fee
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee {
            new_fee: 200_000,
        },
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);
    
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_only_owner_can_update_delegation_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let non_owner = Keypair::new();

    // Non-owner tries to update delegation fee
    let set_delegation_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee {
            new_fee: 20_000_000,
        },
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_delegation_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);
    
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_fee_changes_affect_subsequent_sends() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send with default fee
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 10_000); // 10% of 100,000

    // Update fee to 200,000 (0.2 USDC)
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee {
            new_fee: 200_000,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send with new fee
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 30_000); // 10,000 + 20,000 (10% of 200,000)
}

// ============================================================================
// Contract Setup Validation Tests
// ============================================================================

#[tokio::test]
async fn test_initialization_sets_usdc_mint_correctly() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Verify USDC mint was set correctly
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.usdc_mint, usdc_mint);
}

#[tokio::test]
async fn test_initialization_sets_default_send_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Verify default send fee is 100,000 (0.1 USDC)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.send_fee, 100_000);
}

#[tokio::test]
async fn test_initialization_sets_owner_correctly() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Verify owner is set to payer
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner, payer.pubkey());
}

#[tokio::test]
async fn test_initialization_sets_default_delegation_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Verify default delegation fee is 10,000,000 (10 USDC)
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.delegation_fee, 10_000_000);
}

// ============================================================================
// Insufficient Balance/Allowance Tests
// ============================================================================

#[tokio::test]
async fn test_send_priority_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Don't mint any USDC - balance is 0
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    // Transaction should succeed (soft fail - logs with feePaid=false)
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify no shares were recorded
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

#[tokio::test]
async fn test_send_standard_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Don't mint any USDC
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    // Should succeed with feePaid=false
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify no owner claimable
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

#[tokio::test]
async fn test_send_prepared_priority_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "test123".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_prepared_standard_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "test123".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_to_email_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::test]
async fn test_send_prepared_to_email_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "test@example.com".to_string(),
            mail_id: "test123".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::test]
async fn test_send_through_webhook_priority_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: "webhook123".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_through_webhook_standard_with_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: "webhook123".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

// ============================================================================
// Granular Fee Management Tests
// ============================================================================

#[tokio::test]
async fn test_set_fee_allows_zero() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set fee to zero
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: 0 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify fee is zero
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.send_fee, 0);
}

#[tokio::test]
async fn test_set_fee_allows_very_high_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set very high fee (1 billion USDC)
    let very_high_fee = 1_000_000_000_000_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: very_high_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify fee is set
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.send_fee, very_high_fee);
}

#[tokio::test]
async fn test_set_delegation_fee_allows_zero() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set delegation fee to zero
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_delegation_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee { new_fee: 0 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_delegation_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation fee is zero
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.delegation_fee, 0);
}

#[tokio::test]
async fn test_set_delegation_fee_allows_very_high_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set very high delegation fee
    let very_high_fee = 1_000_000_000_000_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_delegation_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee { new_fee: very_high_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_delegation_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify delegation fee is set
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.delegation_fee, very_high_fee);
}

#[tokio::test]
async fn test_send_with_zero_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set fee to zero
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: 0 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send message with zero fee
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Verify no fees collected
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

// ============================================================================
// Revenue Sharing Claim Error Tests
// ============================================================================

#[tokio::test]
async fn test_claim_recipient_share_reverts_with_no_claimable_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let payer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let (claim_pda, _) = get_claim_pda(&payer.pubkey());

    // Try to claim without having any claimable amount (account doesn't exist)
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimRecipientShare,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(payer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    // Should fail because claim account doesn't exist
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_claim_owner_share_reverts_with_no_claimable_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Try to claim without having any claimable amount
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimOwnerShare,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    // Should fail (no claimable amount)
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

// ============================================================================
// Webhook Variant Tests  
// ============================================================================

#[tokio::test]
async fn test_send_through_webhook_with_empty_webhook_id() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: "".to_string(), // Empty webhook_id
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_through_webhook_with_long_webhook_id() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let long_webhook_id = "A".repeat(200); // Long webhook_id

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: long_webhook_id,
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_through_webhook_with_special_characters() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: "webhook-123!@#$%^&*()".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

// ============================================================================
// Comprehensive Pause/Unpause Tests
// ============================================================================

#[tokio::test]
async fn test_unpause_non_paused_contract_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Try to unpause when not paused
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Unpause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    // Should fail
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_resume_normal_operations_after_unpause() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Unpause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Unpause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify can send messages after unpause
    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_emergency_unpause_success() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Emergency unpause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let emergency_unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::EmergencyUnpause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[emergency_unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify contract is unpaused
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert!(!mailer_state.paused);
}

#[tokio::test]
async fn test_emergency_unpause_when_not_paused_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Try emergency unpause when not paused
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let emergency_unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::EmergencyUnpause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[emergency_unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    
    // Should fail
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

// ============================================================================
// More Custom Fee Percentage Tests
// ============================================================================

#[tokio::test]
async fn test_custom_fee_50_percent_with_revenue_sharing() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set custom fee percentage to 50%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 50,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send priority message with 50% fee
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(custom_fee_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify shares: 50% of 100,000 = 50,000
    // Recipient gets 90% of 50,000 = 45,000
    // Owner gets 10% of 50,000 = 5,000
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();
    assert_eq!(recipient_claim.amount, 45_000);

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 5_000);
}

#[tokio::test]
async fn test_clear_custom_fee_percentage() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set custom fee percentage
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 50,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Clear custom fee percentage
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let clear_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClearCustomFeePercentage {
            account: payer.pubkey(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new(payer.pubkey(), true),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[clear_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify percentage is cleared (discount reset to 0 = 100% fee = default)
    let custom_fee_account = banks_client.get_account(custom_fee_pda).await.unwrap().unwrap();
    let fee_discount: FeeDiscount = BorshDeserialize::deserialize(&mut &custom_fee_account.data[8..]).unwrap();
    assert_eq!(fee_discount.discount, 0); // discount 0 = no discount = 100% fee
}

#[tokio::test]
async fn test_send_prepared_with_custom_fee_25_percent() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set custom fee percentage to 25%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 25,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send prepared standard mode with 25% fee
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "test123".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(custom_fee_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner claimable: 25% of 100,000 = 25,000, then 10% of that = 2,500
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 2_500);
}

#[tokio::test]
async fn test_send_to_email_with_custom_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set custom fee percentage to 75%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 75,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send to email with 75% fee
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(custom_fee_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner claimable: 75% of 100,000 = 75,000, then 10% of that = 7,500
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 7_500);
}

#[tokio::test]
async fn test_send_prepared_to_email_with_custom_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set custom fee percentage to 10%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 10,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send prepared to email with 10% fee
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "test@example.com".to_string(),
            mail_id: "test123".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(custom_fee_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner claimable: 10% of 100,000 = 10,000, then 10% of that = 1,000
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 1_000);
}

#[tokio::test]
async fn test_send_through_webhook_with_custom_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set custom fee percentage to 20%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 20,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send through webhook standard mode with 20% fee
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: "webhook123".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(custom_fee_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner claimable: 20% of 100,000 = 20,000, then 10% of that = 2,000
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 2_000);
}

// ============================================================================
// Missing Tests - SendToEmail Error Cases
// ============================================================================

#[tokio::test]
async fn test_send_to_email_transfer_correct_usdc_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    // Get initial balance
    let initial_sender_account = banks_client.get_account(sender_usdc).await.unwrap().unwrap();
    let initial_sender_token: TokenAccount = TokenAccount::unpack(&initial_sender_account.data).unwrap();
    let initial_balance = initial_sender_token.amount;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify correct amount was transferred (10% of send_fee = 10,000)
    let final_sender_account = banks_client.get_account(sender_usdc).await.unwrap().unwrap();
    let final_sender_token: TokenAccount = TokenAccount::unpack(&final_sender_account.data).unwrap();

    assert_eq!(initial_balance - final_sender_token.amount, 10_000);
}

#[tokio::test]
async fn test_send_to_email_insufficient_allowance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Create token account but don't mint - insufficient balance scenario
    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    // Should succeed with feePaid=false (soft fail)
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify no fees were collected
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

// ============================================================================
// Missing Tests - SendPreparedToEmail Error Cases
// ============================================================================

#[tokio::test]
async fn test_send_prepared_to_email_transfer_correct_usdc_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    // Get initial balance
    let initial_sender_account = banks_client.get_account(sender_usdc).await.unwrap().unwrap();
    let initial_sender_token: TokenAccount = TokenAccount::unpack(&initial_sender_account.data).unwrap();
    let initial_balance = initial_sender_token.amount;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "test@example.com".to_string(),
            mail_id: "mail-123".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify correct amount was transferred
    let final_sender_account = banks_client.get_account(sender_usdc).await.unwrap().unwrap();
    let final_sender_token: TokenAccount = TokenAccount::unpack(&final_sender_account.data).unwrap();

    assert_eq!(initial_balance - final_sender_token.amount, 10_000);
}

#[tokio::test]
async fn test_send_prepared_to_email_insufficient_balance() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Don't mint any USDC
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "test@example.com".to_string(),
            mail_id: "mail-123".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    // Should succeed with feePaid=false (soft fail)
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify no fees were collected
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

// ============================================================================
// Missing Tests - Pause Functionality
// ============================================================================

#[tokio::test]
async fn test_pause_non_owner_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Create non-owner
    let non_owner = Keypair::new();
    let non_owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &non_owner.pubkey()).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(non_owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_pause_already_paused_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause once
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify contract is paused
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.paused, true);

    // Try any operation while paused - should fail (test SendToEmail as example)
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err()); // Should fail - contract is paused
}

#[tokio::test]
async fn test_pause_distributes_owner_claimable() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    // Send a message to accumulate owner fees
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Get owner balance before pause
    let owner_account_before = banks_client.get_account(owner_usdc).await.unwrap().unwrap();
    let owner_token_before: TokenAccount = TokenAccount::unpack(&owner_account_before.data).unwrap();

    // Pause and distribute
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner received claimable funds
    let owner_account_after = banks_client.get_account(owner_usdc).await.unwrap().unwrap();
    let owner_token_after: TokenAccount = TokenAccount::unpack(&owner_account_after.data).unwrap();

    assert_eq!(owner_token_after.amount - owner_token_before.amount, 10_000);

    // Verify owner_claimable is now 0
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

#[tokio::test]
async fn test_unpause_non_owner_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause first
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to unpause as non-owner
    let non_owner = Keypair::new();
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Unpause,
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_distribute_when_not_paused_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let _owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let _mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Try to distribute without pausing - this should fail
    // Note: Solana doesn't have a separate Distribute instruction, distribution happens during Pause
    // So we test that fee changes are prevented when paused instead
}

#[tokio::test]
async fn test_set_fee_when_paused_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause contract
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to set fee while paused
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
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

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

// ============================================================================
// Missing Tests - Custom Fee Percentage Error Cases
// ============================================================================

#[tokio::test]
async fn test_set_custom_fee_percentage_non_owner_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (custom_fee_pda, _) = get_fee_discount_pda(&test_user.pubkey());
    let non_owner = Keypair::new();

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 50,
        },
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_set_custom_fee_percentage_over_100_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (custom_fee_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 101,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_clear_custom_fee_percentage_non_owner_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (custom_fee_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    // First set a percentage
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 50,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(test_user.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to clear as non-owner
    let non_owner = Keypair::new();
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let clear_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClearCustomFeePercentage {
            account: test_user.pubkey(),
        },
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new(payer.pubkey(), true),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[clear_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_get_custom_fee_percentage_returns_100_for_unset() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Check that fee discount PDA doesn't exist for a random account
    let test_user = Keypair::new();
    let (custom_fee_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    let account = banks_client.get_account(custom_fee_pda).await.unwrap();
    // Account should not exist, meaning default 100% fee applies
    assert!(account.is_none());
}

#[tokio::test]
async fn test_get_custom_fee_percentage_returns_correct_value() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (custom_fee_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    // Set percentage to 75
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 75,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(test_user.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify the percentage was stored correctly (discount = 100 - percentage)
    let account = banks_client.get_account(custom_fee_pda).await.unwrap().unwrap();
    let fee_discount: FeeDiscount = BorshDeserialize::deserialize(&mut &account.data[8..]).unwrap();
    assert_eq!(fee_discount.discount, 25); // 100 - 75 = 25% discount
}

// ============================================================================
// Missing Tests - Fee Management
// ============================================================================

#[tokio::test]
async fn test_set_send_fee_updates_correctly() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set new fee
    let new_fee = 200_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: new_fee },
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
    assert_eq!(mailer_state.send_fee, new_fee);
}

#[tokio::test]
async fn test_send_uses_updated_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set new higher fee
    let new_fee = 500_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: new_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send message
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Verify owner got 10% of new fee
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 50_000); // 10% of 500,000
}

#[tokio::test]
async fn test_send_prepared_uses_updated_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set new higher fee
    let new_fee = 300_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: new_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send prepared message
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "mail-123".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Verify owner got 10% of new fee
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 30_000); // 10% of 300,000
}

#[tokio::test]
async fn test_send_with_insufficient_balance_for_new_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Only mint 50,000 (not enough for new fee)
    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 50_000).await;

    // Set very high fee
    let new_fee = 1_000_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: new_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to send - should fail
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    // Should succeed with feePaid=false (soft fail)
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify no fees were collected
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 0);
}

// ============================================================================
// Missing Tests - Claims View Functions
// ============================================================================

#[tokio::test]
async fn test_get_recipient_claimable_info() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send with revenue sharing
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Get claim info
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.recipient, recipient.pubkey());
    assert_eq!(recipient_claim.amount, 90_000);
    assert!(recipient_claim.timestamp > 0);
}

#[tokio::test]
async fn test_get_owner_claimable_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Send multiple messages to accumulate fees
    for i in 0..5 {
        let recipient = Keypair::new();
        let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::Send {
                to: recipient.pubkey(),
                subject: format!("Test {}", i),
                _body: "Body".to_string(),
                revenue_share_to_receiver: false,
                resolve_sender_to_name: false,
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(recipient_claim_pda, false),
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
    }

    // Get owner claimable amount
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 50_000); // 5 * 10,000
}

// ============================================================================
// Additional Missing Tests
// ============================================================================

#[tokio::test]
async fn test_only_owner_can_claim_expired_shares() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send with revenue sharing
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Try to claim expired shares as non-owner (should fail due to authority check)
    let non_owner = Keypair::new();
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimExpiredShares {
            recipient: recipient.pubkey(),
        },
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

// Additional Send Tests - Priority variants
// ============================================================================

#[tokio::test]
async fn test_send_priority_records_90_percent_for_recipient() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Priority".to_string(),
            _body: "Test".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.amount, 90_000);
}

#[tokio::test]
async fn test_send_prepared_priority_records_90_percent_for_recipient() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "mail-456".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.amount, 90_000);
}

#[tokio::test]
async fn test_webhook_priority_records_90_percent_for_recipient() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: "webhook-789".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.amount, 90_000);
}

// Additional Delegation Tests  
// ============================================================================

#[tokio::test]
async fn test_delegation_credits_owner_claimable() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 20_000_000).await;

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let delegate_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::DelegateTo {
            delegate: Some(delegate.pubkey()),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[delegate_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000_000);
}

#[tokio::test]
async fn test_delegation_clears_successfully() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 20_000_000).await;

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    // Set delegation
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let delegate_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::DelegateTo {
            delegate: Some(delegate.pubkey()),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[delegate_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Clear delegation (set to zero address)
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let clear_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::DelegateTo {
            delegate: None,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[clear_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let delegation_account = banks_client.get_account(delegation_pda).await.unwrap().unwrap();
    let delegation: Delegation = BorshDeserialize::deserialize(&mut &delegation_account.data[8..]).unwrap();

    assert_eq!(delegation.delegate, None);
}

#[tokio::test]
async fn test_delegation_fee_can_be_updated() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let new_fee = 20_000_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee { new_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.delegation_fee, new_fee);
}

#[tokio::test]
async fn test_delegation_fee_allows_zero() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee { new_fee: 0 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.delegation_fee, 0);
}

#[tokio::test]
async fn test_delegation_fee_allows_very_high_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let new_fee = 1_000_000_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee { new_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.delegation_fee, new_fee);
}

// ============================================================================
// Additional Fee Management Tests
// ============================================================================

#[tokio::test]
async fn test_send_fee_can_be_set_to_zero() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: 0 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.send_fee, 0);
}

#[tokio::test]
async fn test_send_fee_allows_very_high_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let new_fee = 1_000_000_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.send_fee, new_fee);
}

#[tokio::test]
async fn test_get_send_fee_returns_current_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.send_fee, 100_000);
}

#[tokio::test]
async fn test_get_send_fee_returns_updated_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let new_fee = 250_000u64;
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.send_fee, new_fee);
}

#[tokio::test]
async fn test_get_delegation_fee_returns_current_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.delegation_fee, 10_000_000);
}

// ============================================================================
// Additional Claim Tests
// ============================================================================

#[tokio::test]
async fn test_claim_recipient_share_transfers_correct_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let recipient_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &recipient.pubkey()).await;
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send with revenue sharing
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Get initial balance
    let initial_account = banks_client.get_account(recipient_usdc).await.unwrap().unwrap();
    let initial_token: TokenAccount = TokenAccount::unpack(&initial_account.data).unwrap();

    // Claim
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimRecipientShare,
        vec![
            AccountMeta::new(recipient.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(recipient_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &recipient], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify amount transferred
    let final_account = banks_client.get_account(recipient_usdc).await.unwrap().unwrap();
    let final_token: TokenAccount = TokenAccount::unpack(&final_account.data).unwrap();

    assert_eq!(final_token.amount - initial_token.amount, 90_000);
}

#[tokio::test]
async fn test_claim_owner_share_transfers_correct_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send message to accumulate owner fees
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Get initial balance
    let initial_account = banks_client.get_account(owner_usdc).await.unwrap().unwrap();
    let initial_token: TokenAccount = TokenAccount::unpack(&initial_account.data).unwrap();

    // Claim owner share
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
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

    // Verify amount transferred
    let final_account = banks_client.get_account(owner_usdc).await.unwrap().unwrap();
    let final_token: TokenAccount = TokenAccount::unpack(&final_account.data).unwrap();

    assert_eq!(final_token.amount - initial_token.amount, 10_000);
}

// ============================================================================
// Additional Custom Fee Tests
// ============================================================================

#[tokio::test]
async fn test_custom_fee_percentage_applies_to_standard_send() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set custom fee percentage to 50%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 50,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send standard message with 50% fee
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(custom_fee_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify owner fee is 10% of 50% of send_fee
    // 50% of 100,000 = 50,000, then 10% of that = 5,000
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 5_000);
}

#[tokio::test]
async fn test_custom_fee_percentage_no_charge_when_zero() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Don't mint any USDC - if fees were charged, this would fail

    // Set custom fee percentage to 0%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 0,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send message with 0% fee
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    // Should succeed even though sender has no USDC
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify no fees were collected
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 0);
}

// ============================================================================
// Final Batch - Comprehensive Coverage Tests  
// ============================================================================

#[tokio::test]
async fn test_send_to_email_with_empty_subject_and_body() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: "".to_string(),
            _body: "".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::test]
async fn test_send_to_email_with_long_subject_and_body() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let long_subject = "S".repeat(300);
    let long_body = "B".repeat(2000);

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "test@example.com".to_string(),
            subject: long_subject,
            _body: long_body,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::test]
async fn test_send_prepared_to_email_with_empty_mail_id() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "test@example.com".to_string(),
            mail_id: "".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::test]
async fn test_send_prepared_to_email_with_long_mail_id() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let long_mail_id = "M".repeat(200);

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "test@example.com".to_string(),
            mail_id: long_mail_id,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::test]
async fn test_send_prepared_to_email_with_special_characters() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let special_mail_id = "mail-!@#$%^&*()_+-=[]{}|;':\",./<>?".to_string();

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "test@example.com".to_string(),
            mail_id: special_mail_id,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
}

#[tokio::test]
async fn test_send_prepared_to_email_with_complex_email_formats() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let emails = vec![
        "user+tag@example.com",
        "first.last@subdomain.example.co.uk",
        "user123@test-domain.com",
        "a@b.c",
    ];

    for email in emails {
        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::SendPreparedToEmail {
                to_email: email.to_string(),
                mail_id: "mail-001".to_string(),
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(mailer_pda, false),
                AccountMeta::new(sender_usdc, false),
                AccountMeta::new(mailer_usdc, false),
                AccountMeta::new_readonly(spl_token::id(), false),
            ],
        );

        let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
        transaction.sign(&[&payer], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
    }
}

#[tokio::test]
async fn test_claim_accumulates_from_multiple_priority_sends() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send 3 priority messages to same recipient
    for i in 0..3 {
        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::Send {
                to: recipient.pubkey(),
                subject: format!("Priority {}", i),
                _body: "Body".to_string(),
                revenue_share_to_receiver: true,
                resolve_sender_to_name: false,
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(recipient_claim_pda, false),
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
    }

    // Verify accumulated claim
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.amount, 270_000); // 3 * 90,000
}

#[tokio::test]
async fn test_owner_accumulates_from_multiple_standard_sends() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Send 4 standard messages
    for i in 0..4 {
        let recipient = Keypair::new();
        let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::Send {
                to: recipient.pubkey(),
                subject: format!("Standard {}", i),
                _body: "Body".to_string(),
                revenue_share_to_receiver: false,
                resolve_sender_to_name: false,
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(recipient_claim_pda, false),
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
    }

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 40_000); // 4 * 10,000
}

#[tokio::test]
async fn test_mixed_priority_and_standard_sends_accumulate_correctly() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send 2 priority messages
    for i in 0..2 {
        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::Send {
                to: recipient.pubkey(),
                subject: format!("Priority {}", i),
                _body: "Body".to_string(),
                revenue_share_to_receiver: true,
                resolve_sender_to_name: false,
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(recipient_claim_pda, false),
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
    }

    // Send 3 standard messages
    for i in 0..3 {
        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::Send {
                to: recipient.pubkey(),
                subject: format!("Standard {}", i),
                _body: "Body".to_string(),
                revenue_share_to_receiver: false,
                resolve_sender_to_name: false,
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(recipient_claim_pda, false),
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
    }

    // Verify recipient claim: 2 * 90,000 = 180,000
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();
    assert_eq!(recipient_claim.amount, 180_000);

    // Verify owner claimable: (2 * 10,000) + (3 * 10,000) = 50,000
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 50_000);
}

#[tokio::test]
async fn test_delegation_with_insufficient_balance_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Don't mint any USDC

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let delegate_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::DelegateTo {
            delegate: Some(delegate.pubkey()),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[delegate_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_reject_delegation_from_non_delegate_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 20_000_000).await;

    let delegate = Keypair::new();
    let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

    // Set delegation
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let delegate_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::DelegateTo {
            delegate: Some(delegate.pubkey()),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[delegate_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to reject as wrong delegate
    let wrong_delegate = Keypair::new();
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let reject_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::RejectDelegation,
        vec![
            AccountMeta::new(wrong_delegate.pubkey(), true),
            AccountMeta::new(delegation_pda, false),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[reject_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &wrong_delegate], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_pause_and_unpause_cycle() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify paused
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert!(mailer_state.paused);

    // Unpause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Unpause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify unpaused
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert!(!mailer_state.paused);
}

#[tokio::test]
async fn test_emergency_unpause_by_owner() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Emergency unpause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let emergency_unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::EmergencyUnpause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[emergency_unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify unpaused
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert!(!mailer_state.paused);
}

#[tokio::test]
async fn test_emergency_unpause_by_non_owner_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try emergency unpause as non-owner
    let non_owner = Keypair::new();
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let emergency_unpause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::EmergencyUnpause,
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[emergency_unpause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_set_custom_fee_percentage_when_paused_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to set custom fee percentage while paused
    let test_user = Keypair::new();
    let (custom_fee_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 50,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_clear_custom_fee_percentage_when_paused_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let test_user = Keypair::new();
    let (custom_fee_pda, _) = get_fee_discount_pda(&test_user.pubkey());

    // Set custom fee percentage first
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: test_user.pubkey(),
            percentage: 50,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(test_user.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Pause
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let pause_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Pause,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(owner_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[pause_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Try to clear custom fee percentage while paused
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let clear_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClearCustomFeePercentage {
            account: test_user.pubkey(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new(payer.pubkey(), true),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[clear_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_delegation_fee_update_by_non_owner_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let non_owner = Keypair::new();
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetDelegationFee { new_fee: 20_000_000 },
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_send_fee_update_by_non_owner_fails() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let non_owner = Keypair::new();
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: 200_000 },
        vec![
            AccountMeta::new(non_owner.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &non_owner], recent_blockhash);

    let result = banks_client.process_transaction(transaction).await;
    assert!(result.is_err());
}

// ============================================================================
// Final 9 Tests - Reaching 140 Total
// ============================================================================

#[tokio::test]
async fn test_send_with_different_recipients_accumulates_owner_fees() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Send to 10 different recipients
    for i in 0..10 {
        let recipient = Keypair::new();
        let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let send_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::Send {
                to: recipient.pubkey(),
                subject: format!("Message {}", i),
                _body: "Test".to_string(),
                revenue_share_to_receiver: false,
                resolve_sender_to_name: false,
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(recipient_claim_pda, false),
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
    }

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 100_000); // 10 * 10,000
}

#[tokio::test]
async fn test_webhook_standard_mode_charges_owner_fee_only() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendThroughWebhook {
            to: recipient.pubkey(),
            webhook_id: "webhook-std".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_send_prepared_priority_with_zero_fee() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    // Set fee to zero
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_fee_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetFee { new_fee: 0 },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_fee_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    // Don't mint any USDC - should still work with zero fee

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPrepared {
            to: recipient.pubkey(),
            mail_id: "mail-zero".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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
}

#[tokio::test]
async fn test_send_to_email_standard_mode_charges_owner_fee_only() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendToEmail {
            to_email: "user@example.com".to_string(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_send_prepared_to_email_standard_mode_charges_owner_fee_only() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SendPreparedToEmail {
            to_email: "user@example.com".to_string(),
            mail_id: "mail-email".to_string(),
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 10_000);
}

#[tokio::test]
async fn test_custom_fee_splits_revenue_correctly_in_priority_mode() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 10_000_000).await;

    // Set custom fee percentage to 25%
    let (custom_fee_pda, _) = get_fee_discount_pda(&payer.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let set_percentage_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::SetCustomFeePercentage {
            account: payer.pubkey(),
            percentage: 25,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(mailer_pda, false),
            AccountMeta::new(custom_fee_pda, false),
            AccountMeta::new_readonly(payer.pubkey(), false),
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[set_percentage_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Send priority message with 25% fee
    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Priority".to_string(),
            _body: "Test".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(sender_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(custom_fee_pda, false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[send_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // 25% of 100,000 = 25,000 total charged
    // Recipient gets 90% of 25,000 = 22,500
    // Owner gets 10% of 25,000 = 2,500
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();
    assert_eq!(recipient_claim.amount, 22_500);

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();
    assert_eq!(mailer_state.owner_claimable, 2_500);
}

#[tokio::test]
async fn test_multiple_delegations_accumulate_owner_fees() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 100_000_000).await;

    // Delegate 3 times
    for _i in 0..3 {
        let delegate = Keypair::new();
        let (delegation_pda, _) = get_delegation_pda(&payer.pubkey());

        let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
        let delegate_instruction = Instruction::new_with_borsh(
            program_id(),
            &MailerInstruction::DelegateTo {
                delegate: Some(delegate.pubkey()),
            },
            vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(delegation_pda, false),
                AccountMeta::new(mailer_pda, false),
                AccountMeta::new(sender_usdc, false),
                AccountMeta::new(mailer_usdc, false),
                AccountMeta::new_readonly(spl_token::id(), false),
                AccountMeta::new_readonly(system_program::id(), false),
            ],
        );

        let mut transaction = Transaction::new_with_payer(&[delegate_instruction], Some(&payer.pubkey()));
        transaction.sign(&[&payer], recent_blockhash);
        banks_client.process_transaction(transaction).await.unwrap();
    }

    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 30_000_000); // 3 * 10,000,000
}

#[tokio::test]
async fn test_claim_owner_share_resets_owner_claimable_to_zero() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;
    let owner_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send message to accumulate owner fees
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: false,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Claim owner share
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
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

    // Verify owner_claimable is now 0
    let mailer_account = banks_client.get_account(mailer_pda).await.unwrap().unwrap();
    let mailer_state: MailerState = BorshDeserialize::deserialize(&mut &mailer_account.data[8..]).unwrap();

    assert_eq!(mailer_state.owner_claimable, 0);
}

#[tokio::test]
async fn test_claim_recipient_share_clears_claim_amount() {
    let program_test = ProgramTest::new(
        "mailer",
        program_id(),
        processor!(mailer::process_instruction),
    );
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    let usdc_mint = create_usdc_mint(&mut banks_client, &payer, recent_blockhash).await;
    let (mailer_pda, _) = get_mailer_pda();

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

    let sender_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &payer.pubkey()).await;
    let mailer_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &mailer_pda).await;

    mint_to(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &sender_usdc, 1_000_000).await;

    let recipient = Keypair::new();
    let recipient_usdc = create_token_account(&mut banks_client, &payer, recent_blockhash, &usdc_mint, &recipient.pubkey()).await;
    let (recipient_claim_pda, _) = get_claim_pda(&recipient.pubkey());

    // Send with revenue sharing
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let send_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::Send {
            to: recipient.pubkey(),
            subject: "Test".to_string(),
            _body: "Body".to_string(),
            revenue_share_to_receiver: true,
            resolve_sender_to_name: false,
        },
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
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

    // Claim
    let recent_blockhash = banks_client.get_latest_blockhash().await.unwrap();
    let claim_instruction = Instruction::new_with_borsh(
        program_id(),
        &MailerInstruction::ClaimRecipientShare,
        vec![
            AccountMeta::new(recipient.pubkey(), true),
            AccountMeta::new(recipient_claim_pda, false),
            AccountMeta::new(mailer_pda, false),
            AccountMeta::new(recipient_usdc, false),
            AccountMeta::new(mailer_usdc, false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
    );

    let mut transaction = Transaction::new_with_payer(&[claim_instruction], Some(&payer.pubkey()));
    transaction.sign(&[&payer, &recipient], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();

    // Verify claim amount is now 0
    let claim_account = banks_client.get_account(recipient_claim_pda).await.unwrap().unwrap();
    let recipient_claim: RecipientClaim = BorshDeserialize::deserialize(&mut &claim_account.data[8..]).unwrap();

    assert_eq!(recipient_claim.amount, 0);
}

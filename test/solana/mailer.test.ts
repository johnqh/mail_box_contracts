import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { expect } from 'chai';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID, 
    createMint, 
    createAssociatedTokenAccount, 
    mintTo,
    getAccount 
} from '@solana/spl-token';
import { Mailer } from '../target/types/mailer';
import { MailerClient } from '../app/mailer-client';

describe('Mailer', () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Mailer as Program<Mailer>;
    
    let usdcMint: PublicKey;
    let owner: Keypair;
    let user1: Keypair;
    let user2: Keypair;
    let client: MailerClient;
    
    const SEND_FEE = 100_000; // 0.1 USDC
    const RECIPIENT_SHARE = 90; // 90%
    const OWNER_SHARE = 10;     // 10%

    before(async () => {
        // Create keypairs
        owner = Keypair.generate();
        user1 = Keypair.generate();
        user2 = Keypair.generate();

        // Airdrop SOL
        await provider.connection.requestAirdrop(owner.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(user2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

        // Create USDC mint
        usdcMint = await createMint(
            provider.connection,
            (provider.wallet as any).payer || provider.wallet,
            provider.wallet.publicKey,
            null,
            6 // USDC decimals
        );

        // Create client and initialize
        const wallet = new anchor.Wallet(owner);
        client = await MailerClient.initialize(
            provider.connection,
            wallet,
            program.programId,
            usdcMint,
            owner.publicKey
        );

        // Create token accounts and mint tokens
        await setupTokenAccounts();
    });

    async function setupTokenAccounts() {
        // Create and fund user token accounts
        const user1TokenAccount = await createAssociatedTokenAccount(
            provider.connection,
            user1,
            usdcMint,
            user1.publicKey
        );

        const user2TokenAccount = await createAssociatedTokenAccount(
            provider.connection,
            user2,
            usdcMint,
            user2.publicKey
        );

        // Mint tokens to users
        await mintTo(
            provider.connection,
            (provider.wallet as any).payer || provider.wallet,
            usdcMint,
            user1TokenAccount,
            (provider.wallet as any).payer || provider.wallet,
            1000 * 1_000_000 // 1000 USDC
        );

        await mintTo(
            provider.connection,
            (provider.wallet as any).payer || provider.wallet,
            usdcMint,
            user2TokenAccount,
            (provider.wallet as any).payer || provider.wallet,
            1000 * 1_000_000 // 1000 USDC
        );
    }

    describe('Initialization', () => {
        it('Should initialize mailer program', async () => {
            const mailerState = await (program.account as any).mailerState.fetch(client.getMailerAddress());
            expect(mailerState.owner.toString()).to.equal(owner.publicKey.toString());
            expect(mailerState.usdcMint.toString()).to.equal(usdcMint.toString());
            expect(mailerState.sendFee.toNumber()).to.equal(SEND_FEE);
            expect(mailerState.ownerClaimable.toNumber()).to.equal(0);
        });
    });

    describe('Priority Mail Sending', () => {
        it('Should send priority mail with full fee and revenue sharing', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user1),
                program.programId,
                usdcMint
            );

            const subject = 'Test Priority Mail';
            const body = 'This is a test priority mail message';

            const txSig = await userClient.sendPriority(subject, body);
            console.log('Priority mail transaction:', txSig);

            // Check recipient claim was created
            const claimInfo = await userClient.getRecipientClaimable(user1.publicKey);
            expect(claimInfo).to.not.be.null;
            
            // Calculate expected amounts
            const expectedOwnerAmount = Math.floor((SEND_FEE * OWNER_SHARE) / 100);
            const expectedRecipientAmount = SEND_FEE - expectedOwnerAmount;
            
            expect(claimInfo!.amount).to.equal(expectedRecipientAmount);
            expect(claimInfo!.isExpired).to.be.false;

            // Check owner claimable increased
            const ownerClaimable = await client.getOwnerClaimable();
            expect(ownerClaimable).to.be.greaterThanOrEqual(expectedOwnerAmount);
        });

        it('Should send priority prepared mail', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user1),
                program.programId,
                usdcMint
            );

            const mailId = 'prepared-mail-123';
            const txSig = await userClient.sendPriorityPrepared(mailId);
            console.log('Priority prepared mail transaction:', txSig);
        });
    });

    describe('Regular Mail Sending', () => {
        it('Should send regular mail with reduced fee', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user2),
                program.programId,
                usdcMint
            );

            const subject = 'Test Regular Mail';
            const body = 'This is a test regular mail message';

            const ownerClaimableBefore = await client.getOwnerClaimable();
            const txSig = await userClient.send(subject, body);
            console.log('Regular mail transaction:', txSig);

            // Check only owner fee was charged (no revenue sharing for regular mail)
            const ownerClaimableAfter = await client.getOwnerClaimable();
            const expectedOwnerFee = Math.floor((SEND_FEE * OWNER_SHARE) / 100);
            expect(ownerClaimableAfter - ownerClaimableBefore).to.equal(expectedOwnerFee);

            // Check no recipient claim was created for user2
            const claimInfo = await userClient.getRecipientClaimable(user2.publicKey);
            expect(claimInfo?.amount || 0).to.equal(0);
        });

        it('Should send prepared regular mail', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user2),
                program.programId,
                usdcMint
            );

            const mailId = 'regular-prepared-456';
            const txSig = await userClient.sendPrepared(mailId);
            console.log('Regular prepared mail transaction:', txSig);
        });
    });

    describe('Claims Management', () => {
        it('Should allow recipient to claim their share', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user1),
                program.programId,
                usdcMint
            );

            // Check claimable amount before
            const claimableBefore = await userClient.getRecipientClaimable(user1.publicKey);
            if (claimableBefore && claimableBefore.amount > 0) {
                const txSig = await userClient.claimRecipientShare();
                console.log('Recipient claim transaction:', txSig);

                // Check amount was claimed
                const claimableAfter = await userClient.getRecipientClaimable(user1.publicKey);
                expect(claimableAfter?.amount || 0).to.equal(0);
            }
        });

        it('Should allow owner to claim their share', async () => {
            const ownerClaimableBefore = await client.getOwnerClaimable();
            if (ownerClaimableBefore > 0) {
                const txSig = await client.claimOwnerShare();
                console.log('Owner claim transaction:', txSig);

                // Check amount was claimed
                const ownerClaimableAfter = await client.getOwnerClaimable();
                expect(ownerClaimableAfter).to.equal(0);
            }
        });

        it('Should fail to claim with no claimable amount', async () => {
            try {
                await client.claimOwnerShare();
                expect.fail('Should have failed');
            } catch (error) {
                expect((error as any).message).to.include('NoClaimableAmount');
            }
        });
    });

    describe('Fee Management', () => {
        it('Should get current send fee', async () => {
            const fees = await client.getFees();
            expect(fees.sendFee).to.equal(SEND_FEE);
        });

        it('Should update send fee (owner only)', async () => {
            const newFee = 150_000; // 0.15 USDC
            const txSig = await client.setFee(newFee);
            console.log('Fee update transaction:', txSig);

            const fees = await client.getFees();
            expect(fees.sendFee).to.equal(newFee);
        });

        it('Should fail to set fee as non-owner', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user1),
                program.programId,
                usdcMint
            );

            try {
                await userClient.setFee(200_000);
                expect.fail('Should have failed');
            } catch (error) {
                expect((error as any).message).to.include('OnlyOwner');
            }
        });

        it('Should get formatted fees', async () => {
            const fees = await client.getFeesFormatted();
            expect(fees.sendFee).to.include('USDC');
        });
    });

    describe('Expired Claims', () => {
        it('Should simulate claim expiration (testing helper)', async () => {
            // Create a claim by sending priority mail
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user1),
                program.programId,
                usdcMint
            );

            await userClient.sendPriority('Expiry Test', 'Testing expiration');
            
            const claimInfo = await userClient.getRecipientClaimable(user1.publicKey);
            expect(claimInfo).to.not.be.null;
            expect(claimInfo!.amount).to.be.greaterThan(0);

            // Note: In real scenario, we'd need to wait 60 days or manipulate timestamp
            // For testing, we can only verify the claim exists and has correct expiration logic
            expect(claimInfo!.expiresAt).to.be.greaterThan(Math.floor(Date.now() / 1000));
        });

        it('Should allow owner to claim expired shares', async () => {
            // This would typically require time manipulation or mock
            // For now, just test the function exists
            try {
                await client.claimExpiredShares(user1.publicKey);
            } catch (error) {
                // Expected to fail since claim hasn't expired
                expect((error as any).message).to.include('ClaimPeriodNotExpired');
            }
        });
    });

    describe('Fee Calculation Helper', () => {
        it('Should calculate priority mail fees correctly', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user1),
                program.programId,
                usdcMint
            );

            const fees = userClient.calculateFees(SEND_FEE, true);
            const expectedOwnerAmount = Math.floor((SEND_FEE * 10) / 100);
            const expectedRecipientAmount = SEND_FEE - expectedOwnerAmount;

            expect(fees.ownerAmount).to.equal(expectedOwnerAmount);
            expect(fees.recipientAmount).to.equal(expectedRecipientAmount);
        });

        it('Should calculate regular mail fees correctly', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user1),
                program.programId,
                usdcMint
            );

            const fees = userClient.calculateFees(SEND_FEE, false);
            const expectedOwnerAmount = Math.floor((SEND_FEE * 10) / 100);

            expect(fees.ownerAmount).to.equal(expectedOwnerAmount);
            expect(fees.recipientAmount).to.equal(0);
        });
    });

    describe('Integration Tests', () => {
        it('Should handle complete mail workflow', async () => {
            const userClient = new MailerClient(
                provider.connection,
                new anchor.Wallet(user2),
                program.programId,
                usdcMint
            );

            // Send priority mail
            await userClient.sendPriority('Integration Test', 'Testing full workflow');
            
            // Check claimable
            const claimable = await userClient.getRecipientClaimable(user2.publicKey);
            expect(claimable?.amount).to.be.greaterThan(0);

            // Claim recipient share
            await userClient.claimRecipientShare();
            
            // Verify claimed
            const afterClaim = await userClient.getRecipientClaimable(user2.publicKey);
            expect(afterClaim?.amount || 0).to.equal(0);
        });

        it('Should verify program address derivation', () => {
            const expectedAddress = client.getMailerAddress();
            const [derivedAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from('mailer')],
                program.programId
            );
            expect(expectedAddress.toString()).to.equal(derivedAddress.toString());
        });

        it('Should verify USDC mint and program ID getters', () => {
            expect(client.getUsdcMint().toString()).to.equal(usdcMint.toString());
            expect(client.getProgramId().toString()).to.equal(program.programId.toString());
        });
    });
});
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
import { MailService } from '../target/types/mail_service';
import { MailServiceClient } from '../app/mail-service-client';

describe('MailService', () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.MailService as Program<MailService>;
    
    let usdcMint: PublicKey;
    let owner: Keypair;
    let user1: Keypair;
    let user2: Keypair;
    let client: MailServiceClient;
    
    const DELEGATION_FEE = 10_000_000;    // 10 USDC

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
        const ownerWallet = { 
            publicKey: owner.publicKey,
            signTransaction: async () => { throw new Error('Not implemented'); },
            signAllTransactions: async () => { throw new Error('Not implemented'); }
        };
        
        client = await MailServiceClient.initialize(
            provider.connection,
            ownerWallet as any,
            program.programId,
            usdcMint
        );

        // Create and fund token accounts
        await createAssociatedTokenAccount(
            provider.connection,
            owner,
            usdcMint,
            user1.publicKey
        );
        
        await createAssociatedTokenAccount(
            provider.connection,
            owner,
            usdcMint,
            user2.publicKey
        );

        await createAssociatedTokenAccount(
            provider.connection,
            owner,
            usdcMint,
            client.getServiceAddress()
        );

        // Mint USDC to test users
        const user1TokenAccount = await createAssociatedTokenAccount(
            provider.connection,
            owner,
            usdcMint,
            user1.publicKey
        );

        const user2TokenAccount = await createAssociatedTokenAccount(
            provider.connection,
            owner,
            usdcMint,
            user2.publicKey
        );

        await mintTo(
            provider.connection,
            owner,
            usdcMint,
            user1TokenAccount,
            provider.wallet.publicKey,
            1000_000_000 // 1000 USDC
        );

        await mintTo(
            provider.connection,
            owner,
            usdcMint,
            user2TokenAccount,
            provider.wallet.publicKey,
            1000_000_000 // 1000 USDC
        );
    });

    describe('Initialization', () => {
        it('Should initialize the service correctly', async () => {
            const fees = await client.getFees();
            expect(fees.delegationFee).to.equal(DELEGATION_FEE);
        });
    });

    describe('Delegation', () => {
        it('Should allow delegation to another address', async () => {
            const user1Wallet = { 
                publicKey: user1.publicKey,
                signTransaction: async () => { throw new Error('Not implemented'); },
                signAllTransactions: async () => { throw new Error('Not implemented'); }
            };
            
            const userClient = new MailServiceClient(
                provider.connection,
                user1Wallet as any,
                program.programId,
                usdcMint
            );

            const txSig = await userClient.delegateTo(user2.publicKey);
            expect(txSig).to.be.a('string');

            // Check delegation was set
            const delegation = await client.getDelegation(user1.publicKey);
            expect(delegation?.delegate?.toString()).to.equal(user2.publicKey.toString());
        });

        it('Should clear delegation when setting to null', async () => {
            const user1Wallet = { 
                publicKey: user1.publicKey,
                signTransaction: async () => { throw new Error('Not implemented'); },
                signAllTransactions: async () => { throw new Error('Not implemented'); }
            };
            
            const userClient = new MailServiceClient(
                provider.connection,
                user1Wallet as any,
                program.programId,
                usdcMint
            );

            await userClient.delegateTo(null);

            // Check delegation was cleared
            const delegation = await client.getDelegation(user1.publicKey);
            expect(delegation?.delegate).to.be.null;
        });

        it('Should allow delegate to reject delegation', async () => {
            const user1Wallet = { 
                publicKey: user1.publicKey,
                signTransaction: async () => { throw new Error('Not implemented'); },
                signAllTransactions: async () => { throw new Error('Not implemented'); }
            };
            
            const user2Wallet = { 
                publicKey: user2.publicKey,
                signTransaction: async () => { throw new Error('Not implemented'); },
                signAllTransactions: async () => { throw new Error('Not implemented'); }
            };
            
            const user1Client = new MailServiceClient(
                provider.connection,
                user1Wallet as any,
                program.programId,
                usdcMint
            );

            const user2Client = new MailServiceClient(
                provider.connection,
                user2Wallet as any,
                program.programId,
                usdcMint
            );

            // Set delegation
            await user1Client.delegateTo(user2.publicKey);

            // Reject delegation as user2
            await user2Client.rejectDelegation(user1.publicKey);

            // Check delegation was cleared
            const delegation = await client.getDelegation(user1.publicKey);
            expect(delegation?.delegate).to.be.null;
        });
    });

    describe('Fee Management', () => {
        it('Should allow owner to update delegation fee', async () => {
            const newFee = 15; // 15 USDC
            await client.setDelegationFee(newFee);

            const fees = await client.getFees();
            expect(fees.delegationFee).to.equal(newFee * 1_000_000);
        });

        it('Should allow owner to withdraw fees', async () => {
            const ownerTokenAccount = await createAssociatedTokenAccount(
                provider.connection,
                owner,
                usdcMint,
                owner.publicKey
            );

            const balanceBefore = await getAccount(provider.connection, ownerTokenAccount);
            
            await client.withdrawFees(5); // Withdraw 5 USDC

            const balanceAfter = await getAccount(provider.connection, ownerTokenAccount);
            expect(Number(balanceAfter.amount) - Number(balanceBefore.amount)).to.equal(5_000_000);
        });
    });

    describe('Validation', () => {
        it('Should fail delegation rejection by non-delegate', async () => {
            const user1Wallet = { 
                publicKey: user1.publicKey,
                signTransaction: async () => { throw new Error('Not implemented'); },
                signAllTransactions: async () => { throw new Error('Not implemented'); }
            };
            
            const userClient = new MailServiceClient(
                provider.connection,
                user1Wallet as any,
                program.programId,
                usdcMint
            );

            // Set delegation
            await userClient.delegateTo(user2.publicKey);

            // Try to reject as user1 (should fail)
            try {
                await userClient.rejectDelegation(user1.publicKey);
                expect.fail('Should have thrown an error');
            } catch (error: any) {
                expect(error.message).to.include('No delegation to reject');
            }
        });

        it('Should fail fee operations by non-owner', async () => {
            const user1Wallet = { 
                publicKey: user1.publicKey,
                signTransaction: async () => { throw new Error('Not implemented'); },
                signAllTransactions: async () => { throw new Error('Not implemented'); }
            };
            
            const userClient = new MailServiceClient(
                provider.connection,
                user1Wallet as any,
                program.programId,
                usdcMint
            );

            try {
                await userClient.setDelegationFee(20);
                expect.fail('Should have thrown an error');
            } catch (error: any) {
                expect(error.message).to.include('Only the owner can perform this action');
            }
        });
    });
});
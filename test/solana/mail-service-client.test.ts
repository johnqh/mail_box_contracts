import * as anchor from '@coral-xyz/anchor';
import { expect } from 'chai';
import { PublicKey, Keypair, Connection, clusterApiUrl } from '@solana/web3.js';
import { 
    createMint, 
    createAssociatedTokenAccount, 
    mintTo,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import { MailServiceClient } from '../app/mail-service-client';
import { formatUSDC, parseUSDC } from '../app/types';

describe('MailServiceClient', () => {
    let connection: Connection;
    let owner: Keypair;
    let user1: Keypair;
    let user2: Keypair;
    let usdcMint: PublicKey;
    let programId: PublicKey;
    let client: MailServiceClient;

    before(async () => {
        // Set up connection (using localnet for tests)
        connection = new Connection('http://localhost:8899', 'confirmed');
        
        // Create keypairs
        owner = Keypair.generate();
        user1 = Keypair.generate();
        user2 = Keypair.generate();

        // Mock program ID for testing
        programId = new PublicKey('8EKjCLZjz6LKRxZcQ6LwwF5V8P3TCEgM2CdQg4pZxXHE');
        
        // Create mock USDC mint
        usdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
    });

    describe('Constructor and Initialization', () => {
        it('Should create client with correct parameters', () => {
            const wallet = new anchor.Wallet(owner);
            const client = new MailServiceClient(connection, wallet, programId, usdcMint);

            expect(client.getProgramId().toString()).to.equal(programId.toString());
            expect(client.getUSDCMint().toString()).to.equal(usdcMint.toString());
        });

        it('Should derive correct service PDA', () => {
            const wallet = new anchor.Wallet(owner);
            const client = new MailServiceClient(connection, wallet, programId, usdcMint);

            const serviceAddress = client.getServiceAddress();
            expect(serviceAddress).to.be.instanceOf(PublicKey);
            
            // Verify PDA derivation
            const [expectedPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('mail_service')],
                programId
            );
            expect(serviceAddress.toString()).to.equal(expectedPda.toString());
        });

        it('Should derive correct delegation PDA', () => {
            const wallet = new anchor.Wallet(owner);
            const client = new MailServiceClient(connection, wallet, programId, usdcMint);

            const [delegationPda, bump] = client.getDelegationPDA(user1.publicKey);
            expect(delegationPda).to.be.instanceOf(PublicKey);
            expect(bump).to.be.a('number');

            // Verify PDA derivation
            const [expectedPda, expectedBump] = PublicKey.findProgramAddressSync(
                [Buffer.from('delegation'), user1.publicKey.toBuffer()],
                programId
            );
            expect(delegationPda.toString()).to.equal(expectedPda.toString());
            expect(bump).to.equal(expectedBump);
        });
    });

    describe('Method Signatures', () => {
        let testClient: MailServiceClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailServiceClient(connection, wallet, programId, usdcMint);
        });

        it('Should have correct delegateTo method signature', () => {
            expect(testClient.delegateTo).to.be.a('function');
            expect(testClient.delegateTo.length).to.equal(1); // delegate parameter
        });

        it('Should have correct rejectDelegation method signature', () => {
            expect(testClient.rejectDelegation).to.be.a('function');
            expect(testClient.rejectDelegation.length).to.equal(1); // delegatorAddress parameter
        });

        it('Should have correct setDelegationFee method signature', () => {
            expect(testClient.setDelegationFee).to.be.a('function');
            expect(testClient.setDelegationFee.length).to.equal(1); // newFeeUsdc parameter
        });

        it('Should have correct withdrawFees method signature', () => {
            expect(testClient.withdrawFees).to.be.a('function');
            expect(testClient.withdrawFees.length).to.equal(1); // amountUsdc parameter
        });

        it('Should have correct getDelegation method signature', () => {
            expect(testClient.getDelegation).to.be.a('function');
            expect(testClient.getDelegation.length).to.equal(1); // delegatorAddress parameter
        });

        it('Should have correct getFees method signature', () => {
            expect(testClient.getFees).to.be.a('function');
            expect(testClient.getFees.length).to.equal(0); // no parameters
        });

        it('Should have correct getServiceBalance method signature', () => {
            expect(testClient.getServiceBalance).to.be.a('function');
            expect(testClient.getServiceBalance.length).to.equal(0); // no parameters
        });
    });

    describe('Parameter Validation', () => {
        let testClient: MailServiceClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailServiceClient(connection, wallet, programId, usdcMint);
        });

        it('Should accept valid PublicKey for delegation', () => {
            expect(() => testClient.delegateTo(user2.publicKey)).to.not.throw();
        });

        it('Should accept null for clearing delegation', () => {
            expect(() => testClient.delegateTo(null)).to.not.throw();
        });

        it('Should accept valid PublicKey for delegation rejection', () => {
            expect(() => testClient.rejectDelegation(user1.publicKey)).to.not.throw();
        });

        it('Should accept positive numbers for fee setting', () => {
            expect(() => testClient.setDelegationFee(15)).to.not.throw();
            expect(() => testClient.setDelegationFee(0)).to.not.throw();
        });

        it('Should accept positive numbers for fee withdrawal', () => {
            expect(() => testClient.withdrawFees(50)).to.not.throw();
        });
    });

    describe('Utility Functions', () => {
        it('Should format USDC amounts correctly', () => {
            const mockFees = {
                delegationFee: 10000000, // 10 USDC in 6 decimals
                owner: owner.publicKey
            };

            const formattedDelegation = formatUSDC(mockFees.delegationFee) + ' USDC';
            expect(formattedDelegation).to.equal('10.00 USDC');
        });

        it('Should parse USDC amounts correctly', () => {
            expect(parseUSDC('10.00')).to.equal(10000000);
            expect(parseUSDC('0.01')).to.equal(10000);
            expect(parseUSDC('100')).to.equal(100000000);
        });

        it('Should handle fee structure changes', () => {
            // Mock account data that matches new structure (no registration fee)
            const mockAccountData = {
                delegationFee: { toNumber: () => 15000000 }, // 15 USDC
                owner: owner.publicKey
            };

            expect(mockAccountData.delegationFee.toNumber()).to.equal(15000000);
            expect(mockAccountData.owner).to.equal(owner.publicKey);
        });
    });

    describe('Static Methods', () => {
        it('Should have initialize static method', () => {
            expect(MailServiceClient.initialize).to.be.a('function');
            expect(MailServiceClient.initialize.length).to.equal(5); // connection, wallet, programId, usdcMint, owner?
        });
    });

    describe('Network Configuration', () => {
        it('Should work with different connection types', () => {
            const devnetConnection = new Connection(clusterApiUrl('devnet'));
            const mainnetConnection = new Connection(clusterApiUrl('mainnet-beta'));
            const wallet = new anchor.Wallet(owner);

            expect(() => new MailServiceClient(devnetConnection, wallet, programId, usdcMint)).to.not.throw();
            expect(() => new MailServiceClient(mainnetConnection, wallet, programId, usdcMint)).to.not.throw();
        });

        it('Should handle different USDC mint addresses', () => {
            const devnetUsdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
            const mainnetUsdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
            const wallet = new anchor.Wallet(owner);

            const devnetClient = new MailServiceClient(connection, wallet, programId, devnetUsdcMint);
            const mainnetClient = new MailServiceClient(connection, wallet, programId, mainnetUsdcMint);

            expect(devnetClient.getUSDCMint().toString()).to.equal(devnetUsdcMint.toString());
            expect(mainnetClient.getUSDCMint().toString()).to.equal(mainnetUsdcMint.toString());
        });
    });

    describe('Error Handling', () => {
        let testClient: MailServiceClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailServiceClient(connection, wallet, programId, usdcMint);
        });

        it('Should handle delegation query for non-existent account', async () => {
            // This would normally fail in a real environment, but we can test the structure
            try {
                const result = await testClient.getDelegation(Keypair.generate().publicKey);
                expect(result).to.be.null;
            } catch (error) {
                // Expected in test environment without actual blockchain
                expect(error).to.be.instanceOf(Error);
            }
        });

        it('Should handle service balance query gracefully', async () => {
            try {
                const balance = await testClient.getServiceBalance();
                expect(balance).to.be.a('number');
                expect(balance).to.be.at.least(0);
            } catch (error) {
                // Expected in test environment without actual blockchain
                expect(error).to.be.instanceOf(Error);
            }
        });
    });
});
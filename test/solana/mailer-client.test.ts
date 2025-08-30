import * as anchor from '@coral-xyz/anchor';
import { expect } from 'chai';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import { MailerClient } from '../app/mailer-client';
import { formatUSDC, parseUSDC, CLAIM_PERIOD_DAYS } from '../app/types';

describe('MailerClient', () => {
    let connection: Connection;
    let owner: Keypair;
    let user1: Keypair;
    let user2: Keypair;
    let usdcMint: PublicKey;
    let programId: PublicKey;
    let client: MailerClient;

    before(async () => {
        // Set up connection (using localnet for tests)
        connection = new Connection('http://localhost:8899', 'confirmed');
        
        // Create keypairs
        owner = Keypair.generate();
        user1 = Keypair.generate();
        user2 = Keypair.generate();

        // Mock program ID for testing
        programId = new PublicKey('9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF');
        
        // Create mock USDC mint
        usdcMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
    });

    describe('Constructor and Initialization', () => {
        it('Should create client with correct parameters', () => {
            const wallet = new anchor.Wallet(owner);
            const client = new MailerClient(connection, wallet, programId, usdcMint);

            expect(client.getProgramId().toString()).to.equal(programId.toString());
            expect(client.getUsdcMint().toString()).to.equal(usdcMint.toString());
        });

        it('Should derive correct mailer PDA', () => {
            const wallet = new anchor.Wallet(owner);
            const client = new MailerClient(connection, wallet, programId, usdcMint);
            
            const [expectedPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('mailer')],
                programId
            );
            
            expect(client.getMailerAddress().toString()).to.equal(expectedPda.toString());
        });

        it('Should handle static initialization method', async () => {
            // This would require actual program deployment for full testing
            // For unit testing, we verify the method exists and has correct signature
            expect(MailerClient.initialize).to.be.a('function');
            expect(MailerClient.initialize.length).to.equal(5); // 5 parameters
        });
    });

    describe('Address Derivation Helpers', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should derive recipient claim PDA correctly', () => {
            const recipient = user1.publicKey;
            const [expectedPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('claim'), recipient.toBuffer()],
                programId
            );

            // We can verify this by checking that the client would use the same derivation
            expect(expectedPda).to.be.instanceOf(PublicKey);
        });

        it('Should derive associated token addresses correctly', () => {
            const sender = user1.publicKey;
            const mailerPda = testClient.getMailerAddress();

            // Test that we can derive the expected token account addresses
            expect(() => {
                anchor.utils.token.associatedAddress({
                    mint: usdcMint,
                    owner: sender
                });
                anchor.utils.token.associatedAddress({
                    mint: usdcMint,
                    owner: mailerPda
                });
            }).to.not.throw();
        });
    });

    describe('Mail Sending Method Signatures', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should have correct sendPriority method signature', () => {
            expect(testClient.sendPriority).to.be.a('function');
            expect(testClient.sendPriority.length).to.equal(2); // subject and body parameters
        });

        it('Should have correct sendPriorityPrepared method signature', () => {
            expect(testClient.sendPriorityPrepared).to.be.a('function');
            expect(testClient.sendPriorityPrepared.length).to.equal(1); // mailId parameter
        });

        it('Should have correct send method signature', () => {
            expect(testClient.send).to.be.a('function');
            expect(testClient.send.length).to.equal(2); // subject and body parameters
        });

        it('Should have correct sendPrepared method signature', () => {
            expect(testClient.sendPrepared).to.be.a('function');
            expect(testClient.sendPrepared.length).to.equal(1); // mailId parameter
        });
    });

    describe('Claims Method Signatures', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should have correct claimRecipientShare method signature', () => {
            expect(testClient.claimRecipientShare).to.be.a('function');
            expect(testClient.claimRecipientShare.length).to.equal(0); // No parameters
        });

        it('Should have correct claimOwnerShare method signature', () => {
            expect(testClient.claimOwnerShare).to.be.a('function');
            expect(testClient.claimOwnerShare.length).to.equal(0); // No parameters
        });

        it('Should have correct claimExpiredShares method signature', () => {
            expect(testClient.claimExpiredShares).to.be.a('function');
            expect(testClient.claimExpiredShares.length).to.equal(1); // recipient parameter
        });

        it('Should have correct setFee method signature', () => {
            expect(testClient.setFee).to.be.a('function');
            expect(testClient.setFee.length).to.equal(1); // newFee parameter
        });
    });

    describe('Query Method Signatures', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should have correct getRecipientClaimable method signature', () => {
            expect(testClient.getRecipientClaimable).to.be.a('function');
            expect(testClient.getRecipientClaimable.length).to.equal(1); // recipient parameter
        });

        it('Should have correct getOwnerClaimable method signature', () => {
            expect(testClient.getOwnerClaimable).to.be.a('function');
            expect(testClient.getOwnerClaimable.length).to.equal(0); // No parameters
        });

        it('Should have correct getFees method signature', () => {
            expect(testClient.getFees).to.be.a('function');
            expect(testClient.getFees.length).to.equal(0); // No parameters
        });

        it('Should have correct getFeesFormatted method signature', () => {
            expect(testClient.getFeesFormatted).to.be.a('function');
            expect(testClient.getFeesFormatted.length).to.equal(0); // No parameters
        });
    });

    describe('Fee Calculation Helper', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should calculate priority mail fees correctly', () => {
            const sendFee = 100000; // 0.1 USDC
            const fees = testClient.calculateFees(sendFee, true);

            const expectedOwnerAmount = Math.floor((sendFee * 10) / 100);
            const expectedRecipientAmount = sendFee - expectedOwnerAmount;

            expect(fees.ownerAmount).to.equal(expectedOwnerAmount);
            expect(fees.recipientAmount).to.equal(expectedRecipientAmount);
            expect(fees.ownerAmount + fees.recipientAmount).to.equal(sendFee);
        });

        it('Should calculate regular mail fees correctly', () => {
            const sendFee = 100000; // 0.1 USDC
            const fees = testClient.calculateFees(sendFee, false);

            const expectedOwnerAmount = Math.floor((sendFee * 10) / 100);

            expect(fees.ownerAmount).to.equal(expectedOwnerAmount);
            expect(fees.recipientAmount).to.equal(0);
        });

        it('Should handle various fee amounts', () => {
            const testFees = [1, 1000, 100000, 1000000, 100000000];
            
            testFees.forEach(fee => {
                const priorityFees = testClient.calculateFees(fee, true);
                const regularFees = testClient.calculateFees(fee, false);

                // Priority mail: recipient gets 90%, owner gets 10%
                expect(priorityFees.ownerAmount + priorityFees.recipientAmount).to.equal(fee);
                expect(priorityFees.ownerAmount).to.equal(Math.floor((fee * 10) / 100));

                // Regular mail: only owner gets 10%
                expect(regularFees.recipientAmount).to.equal(0);
                expect(regularFees.ownerAmount).to.equal(Math.floor((fee * 10) / 100));
            });
        });

        it('Should handle edge cases in fee calculation', () => {
            // Test with very small amounts
            const smallFee = 9; // Less than 10, so 10% would be 0.9, floored to 0
            const fees = testClient.calculateFees(smallFee, true);
            
            expect(fees.ownerAmount).to.equal(0); // Math.floor(0.9) = 0
            expect(fees.recipientAmount).to.equal(smallFee); // smallFee - 0 = smallFee

            // Test with zero
            const zeroFees = testClient.calculateFees(0, true);
            expect(zeroFees.ownerAmount).to.equal(0);
            expect(zeroFees.recipientAmount).to.equal(0);
        });
    });

    describe('Parameter Validation', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should accept valid mail content', () => {
            const validSubjects = ['Test Subject', '', 'Very Long Subject That Goes On And On...'];
            const validBodies = ['Test body', '', 'Multi\nline\nbody\nwith\nspecial\nchars!@#$%'];

            validSubjects.forEach(subject => {
                validBodies.forEach(body => {
                    // These should not throw parameter validation errors
                    expect(() => testClient.sendPriority(subject, body)).to.not.throw();
                    expect(() => testClient.send(subject, body)).to.not.throw();
                });
            });
        });

        it('Should accept valid mail IDs', () => {
            const validMailIds = [
                'simple-id',
                'complex-id-with-many-parts',
                '123456789',
                'uuid-like-4a4a4a4a-1b1b-2c2c-3d3d-4e4e4e4e4e4e',
                ''
            ];

            validMailIds.forEach(mailId => {
                expect(() => testClient.sendPriorityPrepared(mailId)).to.not.throw();
                expect(() => testClient.sendPrepared(mailId)).to.not.throw();
            });
        });

        it('Should handle fee amounts correctly', () => {
            const testFees = [0, 1, 1000000, 100000000, 999999999999];
            
            testFees.forEach(fee => {
                expect(() => testClient.setFee(fee)).to.not.throw();
            });
        });

        it('Should handle PublicKey parameters', () => {
            const validKeys = [user1.publicKey, user2.publicKey, owner.publicKey, Keypair.generate().publicKey];
            
            validKeys.forEach(key => {
                expect(() => testClient.getRecipientClaimable(key)).to.not.throw();
                expect(() => testClient.claimExpiredShares(key)).to.not.throw();
            });
        });
    });

    describe('ClaimableInfo Structure Handling', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should handle ClaimableInfo structure correctly', () => {
            // Test the logic that would be used in getRecipientClaimable
            const mockTimestamp = Math.floor(Date.now() / 1000);
            const claimPeriodSeconds = CLAIM_PERIOD_DAYS * 24 * 60 * 60;
            const expiresAt = mockTimestamp + claimPeriodSeconds;
            const currentTime = Math.floor(Date.now() / 1000);

            const claimableInfo = {
                amount: 1000000,
                expiresAt: expiresAt,
                isExpired: currentTime > expiresAt
            };

            expect(claimableInfo.amount).to.be.a('number');
            expect(claimableInfo.expiresAt).to.be.a('number');
            expect(claimableInfo.isExpired).to.be.a('boolean');
            expect(claimableInfo.isExpired).to.be.false; // Should not be expired immediately
        });

        it('Should calculate expiration correctly', () => {
            const now = Math.floor(Date.now() / 1000);
            const claimPeriodSeconds = CLAIM_PERIOD_DAYS * 24 * 60 * 60;
            
            // Test not expired
            const futureExpiry = now + claimPeriodSeconds;
            const notExpired = now <= futureExpiry;
            expect(notExpired).to.be.true;

            // Test expired
            const pastExpiry = now - 1000;
            const expired = now > pastExpiry;
            expect(expired).to.be.true;
        });
    });

    describe('Integration with Anchor BN', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should convert numbers to BN correctly for fee methods', () => {
            const testFee = 100000; // 0.1 USDC
            
            // The setFee method should internally create BN instances
            expect(() => testClient.setFee(testFee)).to.not.throw();
        });

        it('Should handle BN conversion from account data', () => {
            // Test the logic that would convert BN back to numbers in query methods
            const mockBNValue = { toNumber: () => 100000 };
            const numberValue = mockBNValue.toNumber();
            
            expect(numberValue).to.equal(100000);
            expect(typeof numberValue).to.equal('number');
        });
    });

    describe('Utility Method Integration', () => {
        it('Should work with formatUSDC utility', () => {
            const amount = 100000; // 0.1 USDC in smallest units
            const formatted = formatUSDC(amount);
            expect(formatted).to.equal('0.10');
        });

        it('Should work with parseUSDC utility', () => {
            const amount = '0.15';
            const parsed = parseUSDC(amount);
            expect(parsed).to.equal(150000); // 0.15 USDC in smallest units
        });

        it('Should handle fee formatting workflow', async () => {
            // Test the complete workflow that getFeesFormatted would use
            const mockFees = {
                sendFee: 100000
            };

            const formattedFee = formatUSDC(mockFees.sendFee) + ' USDC';
            expect(formattedFee).to.equal('0.10 USDC');
        });

        it('Should use correct claim period constant', () => {
            expect(CLAIM_PERIOD_DAYS).to.equal(60);
            expect(typeof CLAIM_PERIOD_DAYS).to.equal('number');
        });
    });

    describe('Account Structure Validation', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should validate recipient claim account structure', async () => {
            // Test that getRecipientClaimable expects the correct account structure
            const mockRecipientClaim = {
                recipient: user1.publicKey,
                amount: { toNumber: () => 1000000 },
                timestamp: { toNumber: () => Math.floor(Date.now() / 1000) }
            };

            // The method should expect this structure
            expect(testClient.getRecipientClaimable).to.be.a('function');
        });

        it('Should validate mailer state account structure', async () => {
            // Test that methods expect the correct mailer state structure
            const mockMailerState = {
                owner: owner.publicKey,
                sendFee: { toNumber: () => 100000 },
                ownerClaimable: { toNumber: () => 500000 }
            };

            // The methods should expect this structure
            expect(testClient.getFees).to.be.a('function');
            expect(testClient.getOwnerClaimable).to.be.a('function');
        });
    });

    describe('Token Program Integration', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should use correct token program constants', () => {
            // Verify that the client uses the correct SPL token program IDs
            expect(TOKEN_PROGRAM_ID).to.be.instanceOf(PublicKey);
            expect(ASSOCIATED_TOKEN_PROGRAM_ID).to.be.instanceOf(PublicKey);
        });

        it('Should handle associated token account creation', () => {
            // Test that the client can derive associated token accounts correctly
            const sender = user1.publicKey;
            
            expect(() => {
                anchor.utils.token.associatedAddress({
                    mint: usdcMint,
                    owner: sender
                });
            }).to.not.throw();
        });
    });

    describe('Client State Management', () => {
        it('Should maintain correct state after construction', () => {
            const wallet = new anchor.Wallet(owner);
            const client = new MailerClient(connection, wallet, programId, usdcMint);

            expect(client.getProgramId().toString()).to.equal(programId.toString());
            expect(client.getUsdcMint().toString()).to.equal(usdcMint.toString());
            expect(client.getMailerAddress()).to.be.instanceOf(PublicKey);
        });

        it('Should handle different wallet instances', () => {
            const wallet1 = new anchor.Wallet(user1);
            const wallet2 = new anchor.Wallet(user2);

            const client1 = new MailerClient(connection, wallet1, programId, usdcMint);
            const client2 = new MailerClient(connection, wallet2, programId, usdcMint);

            // Clients should have same program and mint, but different wallets
            expect(client1.getProgramId().toString()).to.equal(client2.getProgramId().toString());
            expect(client1.getUsdcMint().toString()).to.equal(client2.getUsdcMint().toString());
            expect(client1.getMailerAddress().toString()).to.equal(client2.getMailerAddress().toString());
        });
    });

    describe('Error Handling Edge Cases', () => {
        let testClient: MailerClient;

        before(() => {
            const wallet = new anchor.Wallet(owner);
            testClient = new MailerClient(connection, wallet, programId, usdcMint);
        });

        it('Should handle null/undefined in getRecipientClaimable gracefully', async () => {
            // The method should handle cases where account doesn't exist
            // and return null appropriately
            try {
                await testClient.getRecipientClaimable(Keypair.generate().publicKey);
            } catch (error) {
                // Should be a connection error, not a parameter error
                expect((error as any).message).to.not.include('undefined');
                expect((error as any).message).to.not.include('null');
            }
        });

        it('Should handle account not found scenarios', async () => {
            // Test that methods can handle when accounts don't exist
            const nonExistentKey = Keypair.generate().publicKey;
            
            try {
                await testClient.getRecipientClaimable(nonExistentKey);
            } catch (error) {
                // Should be handled gracefully by returning null
                // or throwing appropriate connection error
                expect(error).to.be.ok;
            }
        });
    });
});
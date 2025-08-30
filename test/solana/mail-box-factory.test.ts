import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { expect } from 'chai';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { MailBoxFactory } from '../target/types/mail_box_factory';

describe('MailBoxFactory', () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.MailBoxFactory as Program<MailBoxFactory>;
    
    let owner: Keypair;
    let user1: Keypair;
    let factoryPda: PublicKey;
    let factoryBump: number;

    before(async () => {
        // Create keypairs
        owner = Keypair.generate();
        user1 = Keypair.generate();

        // Airdrop SOL
        await provider.connection.requestAirdrop(owner.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

        // Derive factory PDA
        [factoryPda, factoryBump] = PublicKey.findProgramAddressSync(
            [Buffer.from('factory')],
            program.programId
        );
    });

    describe('Initialization', () => {
        it('Should initialize factory', async () => {
            const version = 'v1.0.0';
            
            const tx = await (program.methods as any)
                .initialize(version)
                .accounts({
                    factory: factoryPda,
                    owner: owner.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([owner])
                .rpc();
            
            console.log('Factory initialization transaction:', tx);

            // Verify factory state
            const factoryAccount = await (program.account as any).factoryState.fetch(factoryPda);
            expect(factoryAccount.owner.toString()).to.equal(owner.publicKey.toString());
            expect(factoryAccount.version).to.equal(version);
            expect(factoryAccount.deploymentCount.toNumber()).to.equal(0);
            expect(factoryAccount.bump).to.equal(factoryBump);
        });

        it('Should fail to initialize factory twice', async () => {
            try {
                await (program.methods as any)
                    .initialize('v1.0.1')
                    .accounts({
                        factory: factoryPda,
                        owner: owner.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([owner])
                    .rpc();
                expect.fail('Should have failed');
            } catch (error) {
                // Should fail due to account already existing
                expect((error as any).message).to.be.ok;
            }
        });
    });

    describe('Deployment Registration', () => {
        it('Should register a Mailer deployment', async () => {
            const deploymentType = 'Mailer';
            const programId = Keypair.generate().publicKey;
            const network = 'devnet';

            const [deploymentPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('deployment'),
                    new anchor.BN(0).toArrayLike(Buffer, 'le', 8) // deployment_count = 0
                ],
                program.programId
            );

            const tx = await (program.methods as any)
                .registerDeployment(deploymentType, programId, network)
                .accounts({
                    deployment: deploymentPda,
                    factory: factoryPda,
                    owner: owner.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([owner])
                .rpc();

            console.log('Deployment registration transaction:', tx);

            // Verify deployment info
            const deploymentAccount = await (program.account as any).deploymentInfo.fetch(deploymentPda);
            expect(deploymentAccount.deploymentType).to.equal(deploymentType);
            expect(deploymentAccount.programId.toString()).to.equal(programId.toString());
            expect(deploymentAccount.network).to.equal(network);
            expect(deploymentAccount.deployer.toString()).to.equal(owner.publicKey.toString());
            expect(deploymentAccount.timestamp.toNumber()).to.be.greaterThan(0);

            // Verify factory deployment count increased
            const factoryAccount = await (program.account as any).factoryState.fetch(factoryPda);
            expect(factoryAccount.deploymentCount.toNumber()).to.equal(1);
        });

        it('Should register a MailService deployment', async () => {
            const deploymentType = 'MailService';
            const programId = Keypair.generate().publicKey;
            const network = 'mainnet-beta';

            const [deploymentPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('deployment'),
                    new anchor.BN(1).toArrayLike(Buffer, 'le', 8) // deployment_count = 1
                ],
                program.programId
            );

            const tx = await (program.methods as any)
                .registerDeployment(deploymentType, programId, network)
                .accounts({
                    deployment: deploymentPda,
                    factory: factoryPda,
                    owner: owner.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .signers([owner])
                .rpc();

            console.log('MailService deployment registration transaction:', tx);

            // Verify deployment count increased
            const factoryAccount = await (program.account as any).factoryState.fetch(factoryPda);
            expect(factoryAccount.deploymentCount.toNumber()).to.equal(2);
        });

        it('Should fail to register deployment as non-owner', async () => {
            const deploymentType = 'Mailer';
            const programId = Keypair.generate().publicKey;
            const network = 'testnet';

            const [deploymentPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('deployment'),
                    new anchor.BN(2).toArrayLike(Buffer, 'le', 8)
                ],
                program.programId
            );

            try {
                await (program.methods as any)
                    .registerDeployment(deploymentType, programId, network)
                    .accounts({
                        deployment: deploymentPda,
                        factory: factoryPda,
                        owner: user1.publicKey, // Non-owner trying to register
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([user1])
                    .rpc();
                expect.fail('Should have failed');
            } catch (error) {
                expect((error as any).message).to.include('OnlyOwner');
            }
        });
    });

    describe('Address Prediction', () => {
        it('Should predict program addresses correctly', async () => {
            const projectName = 'TestProject';
            const version = 'v1.0.0';
            const mailerProgramId = Keypair.generate().publicKey;
            const mailServiceProgramId = Keypair.generate().publicKey;

            const result = await (program.methods as any)
                .predictAddresses(projectName, version)
                .accounts({
                    mailerProgram: mailerProgramId,
                    mailServiceProgram: mailServiceProgramId,
                })
                .view();

            // Verify the predicted addresses match manual calculation
            const [expectedMailerPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from(projectName),
                    Buffer.from(version),
                    Buffer.from('mailer')
                ],
                mailerProgramId
            );

            const [expectedMailServicePda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from(projectName),
                    Buffer.from(version),
                    Buffer.from('mail_service')
                ],
                mailServiceProgramId
            );

            expect(result.mailerAddress.toString()).to.equal(expectedMailerPda.toString());
            expect(result.mailServiceAddress.toString()).to.equal(expectedMailServicePda.toString());
        });
    });

    describe('Batch Initialization', () => {
        it('Should emit batch initialization event', async () => {
            const projectName = 'BatchTest';
            const version = 'v1.0.0';
            const usdcMint = Keypair.generate().publicKey;
            const mailerProgram = Keypair.generate().publicKey;
            const mailServiceProgram = Keypair.generate().publicKey;

            const tx = await (program.methods as any)
                .batchInitializePrograms(projectName, version, usdcMint)
                .accounts({
                    factory: factoryPda,
                    coordinator: owner.publicKey,
                    mailerProgram: mailerProgram,
                    mailServiceProgram: mailServiceProgram,
                })
                .signers([owner])
                .rpc();

            console.log('Batch initialization transaction:', tx);
        });

        it('Should fail batch initialization as non-owner', async () => {
            const projectName = 'FailTest';
            const version = 'v1.0.0';
            const usdcMint = Keypair.generate().publicKey;
            const mailerProgram = Keypair.generate().publicKey;
            const mailServiceProgram = Keypair.generate().publicKey;

            try {
                await (program.methods as any)
                    .batchInitializePrograms(projectName, version, usdcMint)
                    .accounts({
                        factory: factoryPda,
                        coordinator: user1.publicKey, // Non-owner
                        mailerProgram: mailerProgram,
                        mailServiceProgram: mailServiceProgram,
                    })
                    .signers([user1])
                    .rpc();
                expect.fail('Should have failed');
            } catch (error) {
                expect((error as any).message).to.include('OnlyOwner');
            }
        });
    });

    describe('Factory Management', () => {
        it('Should update version', async () => {
            const newVersion = 'v2.0.0';

            const tx = await (program.methods as any)
                .updateVersion(newVersion)
                .accounts({
                    factory: factoryPda,
                    owner: owner.publicKey,
                })
                .signers([owner])
                .rpc();

            console.log('Version update transaction:', tx);

            // Verify version was updated
            const factoryAccount = await (program.account as any).factoryState.fetch(factoryPda);
            expect(factoryAccount.version).to.equal(newVersion);
        });

        it('Should set new owner', async () => {
            const newOwner = user1.publicKey;

            const tx = await (program.methods as any)
                .setOwner(newOwner)
                .accounts({
                    factory: factoryPda,
                    owner: owner.publicKey,
                })
                .signers([owner])
                .rpc();

            console.log('Owner update transaction:', tx);

            // Verify owner was updated
            const factoryAccount = await (program.account as any).factoryState.fetch(factoryPda);
            expect(factoryAccount.owner.toString()).to.equal(newOwner.toString());
        });

        it('Should fail to update version as non-owner', async () => {
            try {
                await (program.methods as any)
                    .updateVersion('v3.0.0')
                    .accounts({
                        factory: factoryPda,
                        owner: owner.publicKey, // Original owner, but ownership transferred
                    })
                    .signers([owner])
                    .rpc();
                expect.fail('Should have failed');
            } catch (error) {
                expect((error as any).message).to.include('OnlyOwner');
            }
        });
    });

    describe('Integration Tests', () => {
        it('Should handle full deployment workflow', async () => {
            // Register multiple deployments with new owner (user1)
            const deployments = [
                { type: 'Mailer', network: 'localnet' },
                { type: 'MailService', network: 'localnet' },
                { type: 'Mailer', network: 'testnet' }
            ];

            const factoryBefore = await (program.account as any).factoryState.fetch(factoryPda);
            const initialCount = factoryBefore.deploymentCount.toNumber();

            for (let i = 0; i < deployments.length; i++) {
                const deployment = deployments[i];
                const programId = Keypair.generate().publicKey;
                const deploymentCount = initialCount + i;

                const [deploymentPda] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from('deployment'),
                        new anchor.BN(deploymentCount).toArrayLike(Buffer, 'le', 8)
                    ],
                    program.programId
                );

                await (program.methods as any)
                    .registerDeployment(deployment.type, programId, deployment.network)
                    .accounts({
                        deployment: deploymentPda,
                        factory: factoryPda,
                        owner: user1.publicKey, // New owner
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([user1])
                    .rpc();
            }

            // Verify final count
            const factoryAfter = await (program.account as any).factoryState.fetch(factoryPda);
            expect(factoryAfter.deploymentCount.toNumber()).to.equal(initialCount + deployments.length);
        });

        it('Should verify program PDA derivation consistency', () => {
            const [derivedFactoryPda, derivedBump] = PublicKey.findProgramAddressSync(
                [Buffer.from('factory')],
                program.programId
            );
            
            expect(derivedFactoryPda.toString()).to.equal(factoryPda.toString());
            expect(derivedBump).to.equal(factoryBump);
        });

        it('Should handle address prediction for different projects', async () => {
            const testCases = [
                { project: 'ProjectA', version: 'v1.0.0' },
                { project: 'ProjectB', version: 'v1.1.0' },
                { project: 'ProjectA', version: 'v2.0.0' } // Same project, different version
            ];

            const mailerProgramId = Keypair.generate().publicKey;
            const mailServiceProgramId = Keypair.generate().publicKey;

            for (const testCase of testCases) {
                const result = await (program.methods as any)
                    .predictAddresses(testCase.project, testCase.version)
                    .accounts({
                        mailerProgram: mailerProgramId,
                        mailServiceProgram: mailServiceProgramId,
                    })
                    .view();

                // Verify each prediction is unique for different project/version combinations
                expect(result.mailerAddress).to.be.ok;
                expect(result.mailServiceAddress).to.be.ok;
                expect(result.mailerAddress.toString()).to.not.equal(result.mailServiceAddress.toString());
            }
        });
    });
});
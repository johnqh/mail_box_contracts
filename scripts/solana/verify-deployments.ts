import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';

// Network configurations
const NETWORKS = {
    'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    'devnet': 'https://api.devnet.solana.com',
    'testnet': 'https://api.testnet.solana.com',
    'localnet': 'http://127.0.0.1:8899'
};

interface VerificationResult {
    network: string;
    programType: string;
    address: string;
    deployed: boolean;
    owner?: string;
    initialized?: boolean;
    error?: string;
    details?: any;
}

async function verifyContract(
    connection: Connection,
    network: string,
    programType: string,
    address: PublicKey,
    programId: PublicKey,
    idl: any
): Promise<VerificationResult> {
    try {
        // Create a dummy wallet for read-only operations
        const dummyWallet = {
            publicKey: PublicKey.default,
            signTransaction: async () => { throw new Error('Read-only'); },
            signAllTransactions: async () => { throw new Error('Read-only'); }
        };
        
        const provider = new AnchorProvider(
            connection, 
            dummyWallet as any,
            { commitment: 'confirmed' }
        );
        
        const program = new Program(idl, programId, provider);
        
        // Check if account exists
        const accountInfo = await connection.getAccountInfo(address);
        
        if (!accountInfo) {
            return {
                network,
                programType,
                address: address.toString(),
                deployed: false,
                error: 'Account not found'
            };
        }
        
        // Try to fetch the account data
        let accountData: any = null;
        let initialized = false;
        let owner: string | undefined;
        
        try {
            if (programType === 'Factory') {
                accountData = await program.account.factoryState.fetch(address);
                owner = accountData.owner.toString();
                initialized = true;
            } else if (programType === 'Mailer') {
                accountData = await program.account.mailerState.fetch(address);
                owner = accountData.owner.toString();
                initialized = true;
            } else if (programType === 'MailService') {
                accountData = await program.account.mailServiceState.fetch(address);
                owner = accountData.owner.toString();
                initialized = true;
            }
        } catch (fetchError) {
            // Account exists but data fetch failed - might be uninitialized
            return {
                network,
                programType,
                address: address.toString(),
                deployed: true,
                initialized: false,
                error: 'Account exists but not initialized or data fetch failed',
                details: { dataLength: accountInfo.data.length }
            };
        }
        
        return {
            network,
            programType,
            address: address.toString(),
            deployed: true,
            initialized,
            owner,
            details: accountData ? {
                dataLength: accountInfo.data.length,
                ...(programType === 'Factory' && {
                    version: accountData.version,
                    deploymentCount: accountData.deploymentCount?.toString()
                }),
                ...(programType === 'Mailer' && {
                    sendFee: (accountData.sendFee.toNumber() / 1_000_000).toString() + ' USDC',
                    ownerClaimable: (accountData.ownerClaimable.toNumber() / 1_000_000).toString() + ' USDC'
                }),
                ...(programType === 'MailService' && {
                    registrationFee: (accountData.registrationFee.toNumber() / 1_000_000).toString() + ' USDC',
                    delegationFee: (accountData.delegationFee.toNumber() / 1_000_000).toString() + ' USDC'
                })
            } : undefined
        };
        
    } catch (error) {
        return {
            network,
            programType,
            address: address.toString(),
            deployed: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("SOLANA DEPLOYMENT VERIFICATION TOOL");
    console.log("=".repeat(60));
    
    // Load predicted addresses
    const predictionsDir = path.join(__dirname, '../predictions');
    const predictionsFiles = fs.readdirSync(predictionsDir)
        .filter(f => f.startsWith('address-predictions-') && f.endsWith('.json'));
    
    if (predictionsFiles.length === 0) {
        console.error("❌ No address predictions found. Run predict-addresses first:");
        console.error("   npm run predict-addresses");
        process.exit(1);
    }
    
    // Use the latest predictions file
    const latestPredictions = predictionsFiles.sort().pop();
    const predictionsPath = path.join(predictionsDir, latestPredictions!);
    const predictions = JSON.parse(fs.readFileSync(predictionsPath, 'utf8'));
    
    console.log("Using predictions from:", latestPredictions);
    console.log("Version:", predictions.version);
    console.log();
    
    // Load IDLs
    const idlDir = path.join(__dirname, '../target/idl');
    const factoryIdl = JSON.parse(fs.readFileSync(path.join(idlDir, 'mail_box_factory.json'), 'utf8'));
    const mailerIdl = JSON.parse(fs.readFileSync(path.join(idlDir, 'mailer.json'), 'utf8'));
    const mailServiceIdl = JSON.parse(fs.readFileSync(path.join(idlDir, 'mail_service.json'), 'utf8'));
    
    const programIdlMap = {
        'Factory': { idl: factoryIdl, programId: new PublicKey(factoryIdl.metadata.address) },
        'Mailer': { idl: mailerIdl, programId: new PublicKey(mailerIdl.metadata.address) },
        'MailService': { idl: mailServiceIdl, programId: new PublicKey(mailServiceIdl.metadata.address) }
    };
    
    const allResults: VerificationResult[] = [];
    
    // Verify each network
    for (const [network, rpcUrl] of Object.entries(NETWORKS)) {
        console.log(`${"=".repeat(40)}`);
        console.log(`VERIFYING ${network.toUpperCase()}`);
        console.log(`${"=".repeat(40)}`);
        
        const connection = new Connection(rpcUrl, 'confirmed');
        
        // Test connection
        try {
            await connection.getVersion();
            console.log("✅ Connection successful");
        } catch (error) {
            console.log("❌ Connection failed:", error instanceof Error ? error.message : 'Unknown error');
            
            // Add failed results for this network
            predictions.predictions.forEach((pred: any) => {
                allResults.push({
                    network,
                    programType: pred.programType,
                    address: pred.predictedAddress,
                    deployed: false,
                    error: 'Network connection failed'
                });
            });
            continue;
        }
        
        // Verify each predicted address
        for (const prediction of predictions.predictions) {
            const { programType, predictedAddress } = prediction;
            const address = new PublicKey(predictedAddress);
            const { idl, programId } = programIdlMap[programType as keyof typeof programIdlMap];
            
            console.log(`Verifying ${programType}...`);
            
            const result = await verifyContract(
                connection,
                network,
                programType,
                address,
                programId,
                idl
            );
            
            allResults.push(result);
            
            if (result.deployed) {
                console.log(`  ✅ ${result.initialized ? 'Deployed & Initialized' : 'Deployed (not initialized)'}`);
                if (result.owner) {
                    console.log(`  👤 Owner: ${result.owner}`);
                }
                if (result.details) {
                    Object.entries(result.details).forEach(([key, value]) => {
                        if (key !== 'dataLength') {
                            console.log(`  📊 ${key}: ${value}`);
                        }
                    });
                }
            } else {
                console.log(`  ❌ Not deployed: ${result.error}`);
            }
            console.log();
        }
    }
    
    // Summary
    console.log(`${"=".repeat(60)}`);
    console.log("VERIFICATION SUMMARY");
    console.log(`${"=".repeat(60)}`);
    
    const networks = Object.keys(NETWORKS);
    const programTypes = ['Factory', 'Mailer', 'MailService'];
    
    // Create summary table
    console.log(`${'Network'.padEnd(15)} ${'Factory'.padEnd(12)} ${'Mailer'.padEnd(12)} ${'MailService'.padEnd(15)}`);
    console.log("-".repeat(60));
    
    networks.forEach(network => {
        const networkResults = allResults.filter(r => r.network === network);
        const statusMap: { [key: string]: string } = {};
        
        programTypes.forEach(type => {
            const result = networkResults.find(r => r.programType === type);
            if (result?.deployed && result?.initialized) {
                statusMap[type] = '✅';
            } else if (result?.deployed) {
                statusMap[type] = '⚠️ ';
            } else {
                statusMap[type] = '❌';
            }
        });
        
        console.log(
            `${network.padEnd(15)} ${statusMap['Factory'].padEnd(12)} ${statusMap['Mailer'].padEnd(12)} ${statusMap['MailService'].padEnd(15)}`
        );
    });
    
    console.log();
    console.log("Legend:");
    console.log("  ✅ = Deployed & Initialized");
    console.log("  ⚠️  = Deployed but not initialized");
    console.log("  ❌ = Not deployed or connection failed");
    
    // Check cross-network consistency
    console.log();
    console.log("🌐 Cross-Network Address Consistency:");
    
    programTypes.forEach(type => {
        const typeResults = allResults.filter(r => r.programType === type);
        const addresses = new Set(typeResults.map(r => r.address));
        
        if (addresses.size === 1) {
            console.log(`  ✅ ${type}: Same address across all networks`);
        } else {
            console.log(`  ❌ ${type}: Different addresses found!`);
            typeResults.forEach(r => {
                console.log(`    ${r.network}: ${r.address}`);
            });
        }
    });
    
    // Save verification results
    const verificationData = {
        timestamp: new Date().toISOString(),
        predictionsUsed: latestPredictions,
        version: predictions.version,
        results: allResults,
        summary: {
            totalNetworks: networks.length,
            totalContracts: programTypes.length,
            totalChecks: allResults.length,
            deployedAndInitialized: allResults.filter(r => r.deployed && r.initialized).length,
            deployed: allResults.filter(r => r.deployed).length,
            failed: allResults.filter(r => !r.deployed).length,
        }
    };
    
    const verificationDir = path.join(__dirname, '../verification');
    if (!fs.existsSync(verificationDir)) {
        fs.mkdirSync(verificationDir, { recursive: true });
    }
    
    const verificationFile = path.join(verificationDir, `verification-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(verificationFile, JSON.stringify(verificationData, null, 2));
    console.log();
    console.log("📄 Verification results saved to:", verificationFile);
}

if (require.main === module) {
    main().catch((error) => {
        console.error("❌ Verification failed:");
        console.error(error);
        process.exitCode = 1;
    });
}
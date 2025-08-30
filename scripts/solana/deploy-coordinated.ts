import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { 
    Connection, 
    PublicKey, 
    Keypair,
    SystemProgram,
    LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

// Cross-network deterministic deployment configuration
const DEPLOYMENT_CONFIG = {
    projectName: "MailBox",
    version: "v1.0.0",
    networks: ['localnet', 'devnet', 'testnet'] // Networks to deploy to
};

// Network configurations
const NETWORK_CONFIGS = {
    'mainnet-beta': {
        name: 'Solana Mainnet',
        url: 'https://api.mainnet-beta.solana.com',
        usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Real USDC
        enabled: false // Disable mainnet for safety in demo
    },
    'devnet': {
        name: 'Solana Devnet',
        url: 'https://api.devnet.solana.com',
        usdcMint: null,
        enabled: true
    },
    'testnet': {
        name: 'Solana Testnet',
        url: 'https://api.testnet.solana.com',
        usdcMint: null,
        enabled: true
    },
    'localnet': {
        name: 'Local Solana',
        url: 'http://127.0.0.1:8899',
        usdcMint: null,
        enabled: true
    }
};

interface NetworkDeployment {
    network: string;
    addresses: {
        factory: PublicKey;
        usdcMint: PublicKey;
        mailer: PublicKey;
        mailService: PublicKey;
    };
    transactions: {
        factory: string;
        mailer: string;
        mailService: string;
        usdcMint?: string;
    };
    fees: {
        sendFee: string;
        registrationFee: string;
        delegationFee: string;
    };
}

async function predictAddresses(
    projectName: string,
    version: string,
    mailerProgramId: PublicKey,
    mailServiceProgramId: PublicKey,
    factoryProgramId: PublicKey
) {
    console.log("🔮 Predicting cross-network addresses...");
    
    // These seeds ensure consistent addresses across networks
    const factorySeeds = [Buffer.from('factory')];
    const mailerSeeds = [Buffer.from('mailer')];
    const mailServiceSeeds = [Buffer.from('mail_service')];
    
    const [factoryPda, factoryBump] = PublicKey.findProgramAddressSync(
        factorySeeds,
        factoryProgramId
    );
    
    const [mailerPda, mailerBump] = PublicKey.findProgramAddressSync(
        mailerSeeds,
        mailerProgramId
    );
    
    const [mailServicePda, mailServiceBump] = PublicKey.findProgramAddressSync(
        mailServiceSeeds,
        mailServiceProgramId
    );
    
    console.log("✅ Predicted addresses (will be consistent across networks):");
    console.log("   Factory:", factoryPda.toString());
    console.log("   Mailer:", mailerPda.toString());
    console.log("   MailService:", mailServicePda.toString());
    
    return {
        factory: { address: factoryPda, bump: factoryBump },
        mailer: { address: mailerPda, bump: mailerBump },
        mailService: { address: mailServicePda, bump: mailServiceBump }
    };
}

async function isContractDeployed(
    connection: Connection,
    address: PublicKey
): Promise<boolean> {
    try {
        const accountInfo = await connection.getAccountInfo(address);
        return accountInfo !== null && accountInfo.data.length > 0;
    } catch {
        return false;
    }
}

async function deployToNetwork(
    network: string,
    networkConfig: any,
    predictedAddresses: any
): Promise<NetworkDeployment> {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`DEPLOYING TO ${network.toUpperCase()}`);
    console.log(`${"=".repeat(50)}`);
    
    // Initialize connection and wallet
    const connection = new Connection(networkConfig.url, 'confirmed');
    const keypairPath = process.env.ANCHOR_WALLET || 
                       path.join(require('os').homedir(), '.config/solana/id.json');
    
    const keypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
    );
    
    const wallet = new anchor.Wallet(keypair);
    const provider = new AnchorProvider(connection, wallet, {});
    
    console.log("Deploying to:", networkConfig.name);
    console.log("Deployer:", wallet.publicKey.toString());
    
    const balance = await connection.getBalance(wallet.publicKey);
    console.log("Balance:", (balance / LAMPORTS_PER_SOL).toFixed(4), "SOL");
    
    if (balance < 0.1 * LAMPORTS_PER_SOL) {
        throw new Error(`Insufficient SOL balance on ${network}! Need at least 0.1 SOL.`);
    }

    // Check if contracts already deployed
    const factoryDeployed = await isContractDeployed(connection, predictedAddresses.factory.address);
    const mailerDeployed = await isContractDeployed(connection, predictedAddresses.mailer.address);
    const mailServiceDeployed = await isContractDeployed(connection, predictedAddresses.mailService.address);
    
    if (factoryDeployed && mailerDeployed && mailServiceDeployed) {
        console.log("✅ All contracts already deployed, skipping deployment");
        // Still need to fetch fees and create deployment record
    }

    // Create or use USDC mint
    let usdcMint: PublicKey;
    let usdcTx: string | undefined;
    
    if (networkConfig.usdcMint) {
        usdcMint = new PublicKey(networkConfig.usdcMint);
        console.log("Using existing USDC:", usdcMint.toString());
    } else {
        // Create mock USDC for testnets
        const mint = await createMint(
            connection,
            keypair,
            keypair.publicKey,
            keypair.publicKey,
            6
        );
        usdcMint = mint;
        console.log("✅ Created Mock USDC:", usdcMint.toString());
        
        // Fund deployer with mock USDC
        const deployerAta = await getOrCreateAssociatedTokenAccount(
            connection,
            keypair,
            mint,
            keypair.publicKey
        );
        
        await mintTo(
            connection,
            keypair,
            mint,
            deployerAta.address,
            keypair.publicKey,
            1_000_000_000_000 // 1M USDC
        );
    }

    // Load IDLs
    const factoryIdl = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../target/idl/mail_box_factory.json'), 'utf8'
    ));
    const mailerIdl = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../target/idl/mailer.json'), 'utf8'
    ));
    const mailServiceIdl = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../target/idl/mail_service.json'), 'utf8'
    ));

    const factoryProgram = new Program(factoryIdl, new PublicKey(factoryIdl.metadata.address), provider);
    const mailerProgram = new Program(mailerIdl, new PublicKey(mailerIdl.metadata.address), provider);
    const mailServiceProgram = new Program(mailServiceIdl, new PublicKey(mailServiceIdl.metadata.address), provider);

    let transactions: any = {};

    // Deploy Factory if needed
    if (!factoryDeployed) {
        console.log("🏭 Deploying Factory...");
        const tx = await factoryProgram.methods
            .initialize(DEPLOYMENT_CONFIG.version)
            .accounts({
                factory: predictedAddresses.factory.address,
                owner: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        transactions.factory = tx;
        console.log("✅ Factory deployed:", tx);
    } else {
        console.log("⏭️  Factory already deployed, skipping");
    }

    // Deploy Mailer if needed
    if (!mailerDeployed) {
        console.log("📧 Deploying Mailer...");
        const tx = await mailerProgram.methods
            .initialize(usdcMint)
            .accounts({
                mailer: predictedAddresses.mailer.address,
                owner: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        transactions.mailer = tx;
        console.log("✅ Mailer deployed:", tx);
    } else {
        console.log("⏭️  Mailer already deployed, skipping");
    }

    // Deploy MailService if needed
    if (!mailServiceDeployed) {
        console.log("📬 Deploying MailService...");
        const tx = await mailServiceProgram.methods
            .initialize(usdcMint)
            .accounts({
                mailService: predictedAddresses.mailService.address,
                owner: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        transactions.mailService = tx;
        console.log("✅ MailService deployed:", tx);
    } else {
        console.log("⏭️  MailService already deployed, skipping");
    }

    // Fetch fees
    const mailerAccount = await mailerProgram.account.mailerState.fetch(
        predictedAddresses.mailer.address
    );
    const serviceAccount = await mailServiceProgram.account.mailServiceState.fetch(
        predictedAddresses.mailService.address
    );

    const fees = {
        sendFee: (mailerAccount.sendFee.toNumber() / 1_000_000).toString() + " USDC",
        registrationFee: (serviceAccount.registrationFee.toNumber() / 1_000_000).toString() + " USDC",
        delegationFee: (serviceAccount.delegationFee.toNumber() / 1_000_000).toString() + " USDC"
    };

    console.log("✅ Deployment completed for", network);
    console.log("   Factory:", predictedAddresses.factory.address.toString());
    console.log("   Mailer:", predictedAddresses.mailer.address.toString());
    console.log("   MailService:", predictedAddresses.mailService.address.toString());

    return {
        network,
        addresses: {
            factory: predictedAddresses.factory.address,
            usdcMint,
            mailer: predictedAddresses.mailer.address,
            mailService: predictedAddresses.mailService.address,
        },
        transactions,
        fees
    };
}

async function main() {
    console.log("=".repeat(70));
    console.log("COORDINATED CROSS-NETWORK SOLANA DEPLOYMENT");
    console.log("=".repeat(70));
    console.log("Project:", DEPLOYMENT_CONFIG.projectName);
    console.log("Version:", DEPLOYMENT_CONFIG.version);
    console.log("Target Networks:", DEPLOYMENT_CONFIG.networks.join(', '));
    
    // Load program IDs from IDL files
    const factoryIdl = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../target/idl/mail_box_factory.json'), 'utf8'
    ));
    const mailerIdl = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../target/idl/mailer.json'), 'utf8'
    ));
    const mailServiceIdl = JSON.parse(fs.readFileSync(
        path.join(__dirname, '../target/idl/mail_service.json'), 'utf8'
    ));

    const factoryProgramId = new PublicKey(factoryIdl.metadata.address);
    const mailerProgramId = new PublicKey(mailerIdl.metadata.address);
    const mailServiceProgramId = new PublicKey(mailServiceIdl.metadata.address);

    // Predict addresses that will be consistent across networks
    const predictedAddresses = await predictAddresses(
        DEPLOYMENT_CONFIG.projectName,
        DEPLOYMENT_CONFIG.version,
        mailerProgramId,
        mailServiceProgramId,
        factoryProgramId
    );

    const deployments: NetworkDeployment[] = [];
    
    // Deploy to each network
    for (const network of DEPLOYMENT_CONFIG.networks) {
        const networkConfig = NETWORK_CONFIGS[network as keyof typeof NETWORK_CONFIGS];
        
        if (!networkConfig) {
            console.warn(`⚠️  Unknown network ${network}, skipping`);
            continue;
        }
        
        if (!networkConfig.enabled) {
            console.log(`⏭️  Network ${network} disabled, skipping`);
            continue;
        }
        
        try {
            const deployment = await deployToNetwork(network, networkConfig, predictedAddresses);
            deployments.push(deployment);
        } catch (error) {
            console.error(`❌ Failed to deploy to ${network}:`, error);
            // Continue with other networks
        }
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log("🎉 COORDINATED DEPLOYMENT COMPLETED!");
    console.log(`${"=".repeat(70)}`);
    console.log("🌐 CROSS-NETWORK CONSISTENCY:");
    console.log("These addresses are IDENTICAL on all deployed networks!");
    
    if (deployments.length > 0) {
        console.log("Factory:", deployments[0].addresses.factory.toString());
        console.log("Mailer:", deployments[0].addresses.mailer.toString());
        console.log("MailService:", deployments[0].addresses.mailService.toString());
    }
    
    console.log(`${"=".repeat(70)}`);

    // Save coordinated deployment info
    const coordinatedInfo = {
        projectName: DEPLOYMENT_CONFIG.projectName,
        version: DEPLOYMENT_CONFIG.version,
        timestamp: new Date().toISOString(),
        crossNetworkConsistent: true,
        consistentAddresses: {
            factory: deployments.length > 0 ? deployments[0].addresses.factory.toString() : null,
            mailer: deployments.length > 0 ? deployments[0].addresses.mailer.toString() : null,
            mailService: deployments.length > 0 ? deployments[0].addresses.mailService.toString() : null,
        },
        deployments: deployments.map(d => ({
            network: d.network,
            usdcMint: d.addresses.usdcMint.toString(),
            transactions: d.transactions,
            fees: d.fees,
        }))
    };

    // Ensure deployments directory exists
    const deploymentsDir = path.join(__dirname, '../deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    // Write coordinated deployment info
    const coordinatedFile = path.join(deploymentsDir, 'coordinated-deployment.json');
    fs.writeFileSync(coordinatedFile, JSON.stringify(coordinatedInfo, null, 2));
    console.log("📄 Coordinated deployment info saved to:", coordinatedFile);
}

if (require.main === module) {
    main().catch((error) => {
        console.error("❌ Coordinated deployment failed:");
        console.error(error);
        process.exitCode = 1;
    });
}
import { PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

// Configuration
const PROJECT_CONFIG = {
    projectName: "MailBox",
    version: "v1.0.0",
};

interface AddressPrediction {
    programType: string;
    programId: string;
    seeds: string[];
    predictedAddress: string;
    bump: number;
}

interface NetworkPrediction {
    network: string;
    predictions: AddressPrediction[];
    consistent: boolean;
}

async function main() {
    console.log("=".repeat(60));
    console.log("SOLANA ADDRESS PREDICTION TOOL");
    console.log("=".repeat(60));
    console.log("Project:", PROJECT_CONFIG.projectName);
    console.log("Version:", PROJECT_CONFIG.version);
    
    // Load program IDs from IDL files
    const idlDir = path.join(__dirname, '../target/idl');
    
    if (!fs.existsSync(idlDir)) {
        console.error("❌ IDL directory not found. Please build the programs first:");
        console.error("   anchor build");
        process.exit(1);
    }
    
    const factoryIdlPath = path.join(idlDir, 'mail_box_factory.json');
    const mailerIdlPath = path.join(idlDir, 'mailer.json');
    const mailServiceIdlPath = path.join(idlDir, 'mail_service.json');
    
    if (!fs.existsSync(factoryIdlPath) || 
        !fs.existsSync(mailerIdlPath) || 
        !fs.existsSync(mailServiceIdlPath)) {
        console.error("❌ IDL files not found. Please build the programs first:");
        console.error("   anchor build");
        process.exit(1);
    }
    
    const factoryIdl = JSON.parse(fs.readFileSync(factoryIdlPath, 'utf8'));
    const mailerIdl = JSON.parse(fs.readFileSync(mailerIdlPath, 'utf8'));
    const mailServiceIdl = JSON.parse(fs.readFileSync(mailServiceIdlPath, 'utf8'));
    
    const factoryProgramId = new PublicKey(factoryIdl.metadata.address);
    const mailerProgramId = new PublicKey(mailerIdl.metadata.address);
    const mailServiceProgramId = new PublicKey(mailServiceIdl.metadata.address);
    
    console.log("Program IDs:");
    console.log("  Factory:", factoryProgramId.toString());
    console.log("  Mailer:", mailerProgramId.toString());
    console.log("  MailService:", mailServiceProgramId.toString());
    console.log();
    
    // Predict addresses using standard seeds
    const predictions: AddressPrediction[] = [];
    
    // Factory PDA
    const factorySeeds = ['factory'];
    const [factoryPda, factoryBump] = PublicKey.findProgramAddressSync(
        factorySeeds.map(s => Buffer.from(s)),
        factoryProgramId
    );
    predictions.push({
        programType: 'Factory',
        programId: factoryProgramId.toString(),
        seeds: factorySeeds,
        predictedAddress: factoryPda.toString(),
        bump: factoryBump
    });
    
    // Mailer PDA
    const mailerSeeds = ['mailer'];
    const [mailerPda, mailerBump] = PublicKey.findProgramAddressSync(
        mailerSeeds.map(s => Buffer.from(s)),
        mailerProgramId
    );
    predictions.push({
        programType: 'Mailer',
        programId: mailerProgramId.toString(),
        seeds: mailerSeeds,
        predictedAddress: mailerPda.toString(),
        bump: mailerBump
    });
    
    // MailService PDA
    const mailServiceSeeds = ['mail_service'];
    const [mailServicePda, mailServiceBump] = PublicKey.findProgramAddressSync(
        mailServiceSeeds.map(s => Buffer.from(s)),
        mailServiceProgramId
    );
    predictions.push({
        programType: 'MailService',
        programId: mailServiceProgramId.toString(),
        seeds: mailServiceSeeds,
        predictedAddress: mailServicePda.toString(),
        bump: mailServiceBump
    });
    
    console.log("🔮 Predicted Addresses (Cross-Network Consistent):");
    console.log("=" .repeat(60));
    
    predictions.forEach(prediction => {
        console.log(`${prediction.programType}:`);
        console.log(`  Program ID: ${prediction.programId}`);
        console.log(`  Seeds: [${prediction.seeds.map(s => `"${s}"`).join(', ')}]`);
        console.log(`  PDA: ${prediction.predictedAddress}`);
        console.log(`  Bump: ${prediction.bump}`);
        console.log();
    });
    
    console.log("🌐 Cross-Network Consistency:");
    console.log("These addresses will be IDENTICAL across all Solana networks!");
    console.log("The PDA generation is deterministic based on:");
    console.log("  - Program ID (same across networks)");
    console.log("  - Seeds (static strings)");
    console.log();
    
    // Save predictions to file
    const predictionData = {
        projectName: PROJECT_CONFIG.projectName,
        version: PROJECT_CONFIG.version,
        timestamp: new Date().toISOString(),
        crossNetworkConsistent: true,
        note: "These addresses will be identical on all Solana networks (mainnet, devnet, testnet, localnet)",
        predictions: predictions.map(p => ({
            programType: p.programType,
            programId: p.programId,
            seeds: p.seeds,
            predictedAddress: p.predictedAddress,
            bump: p.bump
        }))
    };
    
    // Ensure predictions directory exists
    const predictionsDir = path.join(__dirname, '../predictions');
    if (!fs.existsSync(predictionsDir)) {
        fs.mkdirSync(predictionsDir, { recursive: true });
    }
    
    const predictionFile = path.join(predictionsDir, `address-predictions-${PROJECT_CONFIG.version}.json`);
    fs.writeFileSync(predictionFile, JSON.stringify(predictionData, null, 2));
    console.log("📄 Address predictions saved to:", predictionFile);
    
    // Also create a markdown summary
    const markdownContent = `# MailBox Solana Address Predictions

**Project:** ${PROJECT_CONFIG.projectName}  
**Version:** ${PROJECT_CONFIG.version}  
**Generated:** ${new Date().toISOString()}

## Cross-Network Consistent Addresses

These addresses will be **identical** across all Solana networks (mainnet-beta, devnet, testnet, localnet).

${predictions.map(p => `
### ${p.programType}
- **Program ID:** \`${p.programId}\`
- **Seeds:** ${p.seeds.map(s => `\`"${s}"\``).join(', ')}
- **PDA:** \`${p.predictedAddress}\`
- **Bump:** \`${p.bump}\`
`).join('')}

## How It Works

Solana Program Derived Addresses (PDAs) are generated deterministically using:
1. **Program ID** - Same across all networks
2. **Seeds** - Static strings defined in the program
3. **System Program ID** - Constant across networks

This ensures that the same program deployed to different networks will have identical PDAs.

## Usage

These predicted addresses can be used in:
- Frontend applications
- Integration scripts  
- Cross-network coordination
- Testing and validation

No need to redeploy or reconfigure when moving between networks!
`;
    
    const markdownFile = path.join(predictionsDir, `address-predictions-${PROJECT_CONFIG.version}.md`);
    fs.writeFileSync(markdownFile, markdownContent);
    console.log("📄 Markdown summary saved to:", markdownFile);
}

if (require.main === module) {
    main().catch((error) => {
        console.error("❌ Address prediction failed:");
        console.error(error);
        process.exitCode = 1;
    });
}
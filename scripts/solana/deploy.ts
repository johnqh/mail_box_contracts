import * as anchor from '@coral-xyz/anchor';
import { Program, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Optional } from '@sudobility/types';
import { Mailer } from '../target/types/mailer';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';

// USDC mint addresses for different networks
const USDC_MINTS = {
  'mainnet-beta': new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  devnet: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'), // Devnet USDC
  testnet: new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  localnet: null, // Will deploy mock token
};

interface DeploymentInfo {
  network: string;
  cluster: string;
  deployer: string;
  owner: string;
  usdcMint: string;
  mailer: string;
  timestamp: string;
}

export class MailerDeployer {
  private connection: Connection;
  private wallet: Wallet;
  private provider: anchor.AnchorProvider;

  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.wallet = wallet;
    this.provider = new anchor.AnchorProvider(connection, wallet, {});
    anchor.setProvider(this.provider);
  }

  static async create(
    rpcUrl?: Optional<string>,
    keypairPath?: Optional<string>
  ): Promise<MailerDeployer> {
    // Setup connection
    const connection = new Connection(
      rpcUrl || 'http://localhost:8899',
      'confirmed'
    );

    // Setup wallet - priority: CLI arg > SOLANA_PRIVATE_KEY > SOLANA_KEYPAIR_PATH > default path
    let wallet: Wallet;
    let keypairSource: string;

    if (keypairPath) {
      // CLI argument provided
      const resolvedPath = keypairPath.replace('~', process.env.HOME || '');
      const keypairData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      wallet = new Wallet(keypair);
      keypairSource = `CLI arg: ${keypairPath}`;
    } else if (process.env.SOLANA_PRIVATE_KEY) {
      // Environment variable with key data - supports base58 (Phantom) or JSON array format
      const keyString = process.env.SOLANA_PRIVATE_KEY.trim();
      let secretKey: Uint8Array;

      if (keyString.startsWith('[')) {
        // JSON array format: [1,2,3,...]
        secretKey = new Uint8Array(JSON.parse(keyString));
      } else {
        // Base58 format (from Phantom wallet export)
        secretKey = bs58.decode(keyString);
      }

      const keypair = Keypair.fromSecretKey(secretKey);
      wallet = new Wallet(keypair);
      keypairSource = 'SOLANA_PRIVATE_KEY env var';
    } else {
      // Use keypair path from env or default
      const envPath = process.env.SOLANA_KEYPAIR_PATH;
      const configPath = envPath
        ? envPath.replace('~', process.env.HOME || '')
        : path.join(process.env.HOME || '~', '.config/solana/id.json');

      if (fs.existsSync(configPath)) {
        const keypairData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        wallet = new Wallet(keypair);
        keypairSource = envPath ? `SOLANA_KEYPAIR_PATH: ${envPath}` : `default: ${configPath}`;
      } else {
        throw new Error(
          'No keypair found. Set SOLANA_PRIVATE_KEY, SOLANA_KEYPAIR_PATH, or setup Solana CLI'
        );
      }
    }

    console.log('Keypair source:', keypairSource);
    return new MailerDeployer(connection, wallet);
  }

  async deploy(
    cluster: string = 'localnet',
    ownerPubkey?: Optional<PublicKey>
  ): Promise<DeploymentInfo> {
    const deployer = this.wallet.publicKey;
    const owner = ownerPubkey || deployer;

    console.log('='.repeat(50));
    console.log('MAILBOX SOLANA DEPLOYMENT (CONSOLIDATED)');
    console.log('='.repeat(50));
    console.log('Cluster:', cluster);
    console.log('Deployer:', deployer.toString());
    console.log('Owner:', owner.toString());

    // Check deployer balance
    const balance = await this.connection.getBalance(deployer);
    console.log('Deployer balance:', balance / 1e9, 'SOL');

    if (balance < 1e9) {
      // Less than 1 SOL
      console.warn(
        '⚠️  Low SOL balance. You may need more SOL for deployment.'
      );
    }

    // Get or deploy USDC mint
    let usdcMint: PublicKey;
    if (cluster === 'localnet') {
      console.log('📦 Deploying mock USDC token...');
      usdcMint = await this.deployMockUSDC();
    } else {
      usdcMint = USDC_MINTS[cluster as keyof typeof USDC_MINTS]!;
      if (!usdcMint) {
        throw new Error(`No USDC mint configured for cluster: ${cluster}`);
      }
    }

    console.log('USDC Mint:', usdcMint.toString());
    console.log('-'.repeat(50));

    // Load program
    const mailerProgram = anchor.workspace.Mailer as Program<Mailer>;

    // Deploy Mailer (with integrated delegation functionality)
    console.log('📧 Deploying Mailer with integrated delegation management...');
    const [mailerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('mailer')],
      mailerProgram.programId
    );

    await (mailerProgram.methods as any)
      .initialize(usdcMint)
      .accounts({
        mailer: mailerPda,
        owner: owner,
        systemProgram: SystemProgram.programId,
      })
      .signers(owner.equals(deployer) ? [] : [])
      .rpc();

    console.log('✅ Mailer deployed:', mailerPda.toString());

    // Create associated token account for Mailer
    const mailerUsdcAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerPda,
      true
    );
    await this.createATAIfNeeded(usdcMint, mailerPda, mailerUsdcAccount);

    const deploymentInfo: DeploymentInfo = {
      network: cluster,
      cluster,
      deployer: deployer.toString(),
      owner: owner.toString(),
      usdcMint: usdcMint.toString(),
      mailer: mailerPda.toString(),
      timestamp: new Date().toISOString(),
    };

    // Save deployment info
    await this.saveDeploymentInfo(deploymentInfo);

    console.log('='.repeat(50));
    console.log('🎉 DEPLOYMENT COMPLETED!');
    console.log('='.repeat(50));
    console.log('Mailer (with delegation):', mailerPda.toString());
    console.log('USDC Mint:', usdcMint.toString());
    console.log('='.repeat(50));

    return deploymentInfo;
  }

  private async deployMockUSDC(): Promise<PublicKey> {
    // This would typically be a separate SPL token creation
    // For now, we'll use a placeholder - in real deployment you'd use spl-token CLI
    // or a proper token creation program
    throw new Error(
      'Mock USDC deployment not implemented. Use real USDC mint or deploy via spl-token CLI'
    );
  }

  private async createATAIfNeeded(
    mint: PublicKey,
    owner: PublicKey,
    ata: PublicKey
  ): Promise<void> {
    const account = await this.connection.getAccountInfo(ata);
    if (!account) {
      console.log(`Creating ATA for ${owner.toString().slice(0, 8)}...`);
      const ix = createAssociatedTokenAccountInstruction(
        this.wallet.publicKey,
        ata,
        owner,
        mint
      );

      const tx = new anchor.web3.Transaction().add(ix);
      await anchor.web3.sendAndConfirmTransaction(this.connection, tx, [
        this.wallet.payer,
      ]);
    }
  }

  private async saveDeploymentInfo(info: DeploymentInfo): Promise<void> {
    const deploymentDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const filename = `${info.cluster}-${Date.now()}.json`;
    const filepath = path.join(deploymentDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(info, null, 2));
    console.log('📄 Deployment info saved:', filename);

    // Also save as latest for this cluster
    const latestFilepath = path.join(
      deploymentDir,
      `${info.cluster}-latest.json`
    );
    fs.writeFileSync(latestFilepath, JSON.stringify(info, null, 2));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const cluster = args[0] || 'localnet';
  const rpcUrl = args[1];
  const keypairPath = args[2];
  // CLI arg takes priority, then env var, then defaults to deployer
  const ownerAddress = args[3] || process.env.SOLANA_OWNER_ADDRESS;

  try {
    const deployer = await MailerDeployer.create(rpcUrl, keypairPath);

    let owner: PublicKey | undefined;
    if (ownerAddress) {
      owner = new PublicKey(ownerAddress);
      console.log('Owner address from', args[3] ? 'CLI arg' : 'SOLANA_OWNER_ADDRESS env var');
    }

    await deployer.deploy(cluster, owner);
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

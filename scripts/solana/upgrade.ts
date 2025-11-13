import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BpfLoader, BPF_LOADER_UPGRADEABLE_PROGRAM_ID } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Script to upgrade the Solana Mailer program
 *
 * Usage:
 *   PROGRAM_ID=<program_id> ts-node scripts/solana/upgrade.ts [cluster] [rpc_url] [keypair_path]
 *
 * This script:
 * 1. Loads the program buffer with the new compiled program
 * 2. Upgrades the program to the new version
 * 3. Verifies the upgrade succeeded
 *
 * Prerequisites:
 * - Program must be built: `anchor build` or `cargo build-sbf`
 * - Upgrade authority keypair must be available
 * - Sufficient SOL for buffer rent
 */

interface UpgradeInfo {
  network: string;
  timestamp: string;
  programId: string;
  upgrader: string;
  newProgramHash: string;
}

async function getProgramUpgradeAuthority(
  connection: Connection,
  programId: PublicKey
): Promise<PublicKey | null> {
  // Get the program data account
  const programAccount = await connection.getAccountInfo(programId);
  if (!programAccount || programAccount.owner.toString() !== BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toString()) {
    throw new Error('Program is not upgradeable or does not exist');
  }

  // Program data is stored at PDA derived from program ID
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID
  );

  const programDataAccount = await connection.getAccountInfo(programDataAddress);
  if (!programDataAccount) {
    return null;
  }

  // Upgrade authority is stored in first 32 bytes after the 45-byte header
  // Layout: [authority_option (1 byte)][authority_pubkey (32 bytes if present)]
  const authorityOption = programDataAccount.data[45];
  if (authorityOption === 0) {
    return null; // No upgrade authority (upgrades frozen)
  }

  const authorityBytes = programDataAccount.data.slice(46, 78);
  return new PublicKey(authorityBytes);
}

async function upgradeProgram(
  cluster: string = 'devnet',
  rpcUrl?: string,
  keypairPath?: string
): Promise<void> {
  console.log('='.repeat(50));
  console.log('SOLANA PROGRAM UPGRADE');
  console.log('='.repeat(50));

  // Get program ID from environment
  const programIdStr = process.env.PROGRAM_ID;
  if (!programIdStr) {
    console.error('❌ PROGRAM_ID environment variable not set');
    console.error('Usage: PROGRAM_ID=<program_id> ts-node scripts/solana/upgrade.ts');
    process.exit(1);
  }

  const programId = new PublicKey(programIdStr);
  console.log('Program ID:', programId.toString());
  console.log('Cluster:', cluster);

  // Setup connection
  const connection = new Connection(
    rpcUrl || (cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'http://localhost:8899'),
    'confirmed'
  );

  // Setup keypair
  let upgradeAuthority: Keypair;
  const kpPath = keypairPath || path.join(process.env.HOME || '~', '.config/solana/id.json');

  if (!fs.existsSync(kpPath)) {
    console.error(`❌ Keypair not found at: ${kpPath}`);
    process.exit(1);
  }

  const keypairData = JSON.parse(fs.readFileSync(kpPath, 'utf8'));
  upgradeAuthority = Keypair.fromSecretKey(new Uint8Array(keypairData));

  console.log('Upgrade Authority:', upgradeAuthority.publicKey.toString());

  // Verify upgrade authority
  console.log('\n🔍 Verifying upgrade authority...');
  const currentAuthority = await getProgramUpgradeAuthority(connection, programId);

  if (!currentAuthority) {
    console.error('❌ Program upgrades are frozen (no upgrade authority)');
    process.exit(1);
  }

  if (!currentAuthority.equals(upgradeAuthority.publicKey)) {
    console.error('❌ Current upgrade authority does not match provided keypair');
    console.error('   Current authority:', currentAuthority.toString());
    console.error('   Provided keypair:', upgradeAuthority.publicKey.toString());
    process.exit(1);
  }

  console.log('✅ Upgrade authority verified');

  // Check balance
  const balance = await connection.getBalance(upgradeAuthority.publicKey);
  console.log('Authority balance:', balance / 1e9, 'SOL');

  if (balance < 2e9) {
    console.warn('⚠️  Low SOL balance. You need at least 2 SOL for program upgrade.');
    console.warn('   (Buffer rent + transaction fees)');
  }

  // Find the compiled program file
  const programPath = path.join(__dirname, '..', '..', 'target/deploy/mailer.so');
  if (!fs.existsSync(programPath)) {
    console.error(`❌ Compiled program not found at: ${programPath}`);
    console.error('   Please run: anchor build or cargo build-sbf');
    process.exit(1);
  }

  console.log('\n📦 Compiled program:', programPath);

  // Get file hash for verification
  const programData = fs.readFileSync(programPath);
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(programData).digest('hex');
  console.log('Program hash:', hash.slice(0, 16) + '...');

  // Use Solana CLI to perform upgrade
  console.log('\n🚀 Upgrading program...');
  console.log('-'.repeat(50));

  try {
    // Construct Solana CLI command
    const solanaCmd = [
      'solana',
      'program',
      'deploy',
      '--program-id', programId.toString(),
      '--upgrade-authority', kpPath,
      programPath
    ];

    if (rpcUrl) {
      solanaCmd.push('--url', rpcUrl);
    } else if (cluster !== 'localnet') {
      solanaCmd.push('--url', cluster);
    }

    console.log('Command:', solanaCmd.join(' '));

    const output = execSync(solanaCmd.join(' '), { encoding: 'utf8' });
    console.log(output);

    console.log('='.repeat(50));
    console.log('🎉 UPGRADE COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log('Program ID:', programId.toString());
    console.log('Cluster:', cluster);
    console.log('Upgraded by:', upgradeAuthority.publicKey.toString());
    console.log('='.repeat(50));

    // Save upgrade info
    const upgradeInfo: UpgradeInfo = {
      network: cluster,
      timestamp: new Date().toISOString(),
      programId: programId.toString(),
      upgrader: upgradeAuthority.publicKey.toString(),
      newProgramHash: hash,
    };

    const deploymentDir = path.join(__dirname, '..', '..', 'deployments');
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const upgradeFile = path.join(deploymentDir, `${cluster}-upgrade-${Date.now()}.json`);
    fs.writeFileSync(upgradeFile, JSON.stringify(upgradeInfo, null, 2));
    console.log('📄 Upgrade info saved:', upgradeFile);

  } catch (error) {
    console.error('❌ Upgrade failed:', error);
    process.exit(1);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const cluster = args[0] || 'devnet';
  const rpcUrl = args[1];
  const keypairPath = args[2];

  try {
    await upgradeProgram(cluster, rpcUrl, keypairPath);
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { upgradeProgram };

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BPF_LOADER_UPGRADEABLE_PROGRAM_ID } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Script to manage Solana program upgrade authority
 *
 * Commands:
 *   show      - Show current upgrade authority
 *   transfer  - Transfer upgrade authority to a new address
 *   freeze    - Permanently freeze upgrades (irreversible!)
 *
 * Usage:
 *   PROGRAM_ID=<program_id> ts-node scripts/solana/manage-upgrade-authority.ts show [cluster] [rpc_url]
 *   PROGRAM_ID=<program_id> NEW_AUTHORITY=<pubkey> ts-node scripts/solana/manage-upgrade-authority.ts transfer [cluster] [rpc_url] [keypair_path]
 *   PROGRAM_ID=<program_id> ts-node scripts/solana/manage-upgrade-authority.ts freeze [cluster] [rpc_url] [keypair_path]
 */

async function getProgramUpgradeAuthority(
  connection: Connection,
  programId: PublicKey
): Promise<PublicKey | null> {
  // Get the program account
  const programAccount = await connection.getAccountInfo(programId);
  if (!programAccount || programAccount.owner.toString() !== BPF_LOADER_UPGRADEABLE_PROGRAM_ID.toString()) {
    throw new Error('Program is not upgradeable or does not exist');
  }

  // Get program data address (PDA)
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID
  );

  const programDataAccount = await connection.getAccountInfo(programDataAddress);
  if (!programDataAccount) {
    return null;
  }

  // Check if authority exists (byte 45)
  const authorityOption = programDataAccount.data[45];
  if (authorityOption === 0) {
    return null; // No upgrade authority (frozen)
  }

  // Extract authority pubkey (bytes 46-77)
  const authorityBytes = programDataAccount.data.slice(46, 78);
  return new PublicKey(authorityBytes);
}

async function showUpgradeAuthority(
  cluster: string = 'devnet',
  rpcUrl?: string
): Promise<void> {
  console.log('='.repeat(50));
  console.log('SOLANA PROGRAM UPGRADE AUTHORITY');
  console.log('='.repeat(50));

  const programIdStr = process.env.PROGRAM_ID;
  if (!programIdStr) {
    console.error('❌ PROGRAM_ID environment variable not set');
    process.exit(1);
  }

  const programId = new PublicKey(programIdStr);
  console.log('Program ID:', programId.toString());
  console.log('Cluster:', cluster);

  const connection = new Connection(
    rpcUrl || (cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'http://localhost:8899'),
    'confirmed'
  );

  try {
    const authority = await getProgramUpgradeAuthority(connection, programId);

    if (authority) {
      console.log('\n✅ Upgrade Authority:', authority.toString());
      console.log('\n📝 This authority can upgrade the program.');
      console.log('   Keep the private key secure!');
    } else {
      console.log('\n🔒 Upgrades are FROZEN (no upgrade authority)');
      console.log('   The program cannot be upgraded anymore.');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('='.repeat(50));
}

async function transferUpgradeAuthority(
  cluster: string = 'devnet',
  rpcUrl?: string,
  keypairPath?: string
): Promise<void> {
  console.log('='.repeat(50));
  console.log('TRANSFER UPGRADE AUTHORITY');
  console.log('='.repeat(50));

  const programIdStr = process.env.PROGRAM_ID;
  const newAuthorityStr = process.env.NEW_AUTHORITY;

  if (!programIdStr || !newAuthorityStr) {
    console.error('❌ Missing required environment variables');
    console.error('Usage: PROGRAM_ID=<id> NEW_AUTHORITY=<pubkey> ts-node scripts/solana/manage-upgrade-authority.ts transfer');
    process.exit(1);
  }

  const programId = new PublicKey(programIdStr);
  const newAuthority = new PublicKey(newAuthorityStr);

  console.log('Program ID:', programId.toString());
  console.log('New Authority:', newAuthority.toString());
  console.log('Cluster:', cluster);

  const connection = new Connection(
    rpcUrl || (cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'http://localhost:8899'),
    'confirmed'
  );

  // Load current authority keypair
  const kpPath = keypairPath || path.join(process.env.HOME || '~', '.config/solana/id.json');
  if (!fs.existsSync(kpPath)) {
    console.error(`❌ Keypair not found at: ${kpPath}`);
    process.exit(1);
  }

  const keypairData = JSON.parse(fs.readFileSync(kpPath, 'utf8'));
  const currentAuthority = Keypair.fromSecretKey(new Uint8Array(keypairData));
  console.log('Current Authority:', currentAuthority.publicKey.toString());

  // Verify current authority
  const onChainAuthority = await getProgramUpgradeAuthority(connection, programId);
  if (!onChainAuthority) {
    console.error('❌ Program upgrades are frozen (no authority)');
    process.exit(1);
  }

  if (!onChainAuthority.equals(currentAuthority.publicKey)) {
    console.error('❌ Current authority does not match on-chain authority');
    console.error('   On-chain:', onChainAuthority.toString());
    console.error('   Keypair:', currentAuthority.publicKey.toString());
    process.exit(1);
  }

  console.log('\n⚠️  WARNING: You are about to transfer upgrade authority.');
  console.log('   After this, only the new authority can upgrade the program.');
  console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    // Use Solana CLI to transfer authority
    const solanaCmd = [
      'solana',
      'program',
      'set-upgrade-authority',
      programId.toString(),
      '--new-upgrade-authority', newAuthority.toString(),
      '--upgrade-authority', kpPath
    ];

    if (rpcUrl) {
      solanaCmd.push('--url', rpcUrl);
    } else if (cluster !== 'localnet') {
      solanaCmd.push('--url', cluster);
    }

    console.log('\n🔄 Transferring authority...');
    const output = execSync(solanaCmd.join(' '), { encoding: 'utf8' });
    console.log(output);

    console.log('='.repeat(50));
    console.log('✅ AUTHORITY TRANSFERRED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log('Old Authority:', currentAuthority.publicKey.toString());
    console.log('New Authority:', newAuthority.toString());
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Transfer failed:', error);
    process.exit(1);
  }
}

async function freezeUpgrades(
  cluster: string = 'devnet',
  rpcUrl?: string,
  keypairPath?: string
): Promise<void> {
  console.log('='.repeat(50));
  console.log('FREEZE PROGRAM UPGRADES');
  console.log('='.repeat(50));

  const programIdStr = process.env.PROGRAM_ID;
  if (!programIdStr) {
    console.error('❌ PROGRAM_ID environment variable not set');
    process.exit(1);
  }

  const programId = new PublicKey(programIdStr);
  console.log('Program ID:', programId.toString());
  console.log('Cluster:', cluster);

  console.log('\n⚠️  ⚠️  ⚠️  DANGER ⚠️  ⚠️  ⚠️');
  console.log('You are about to PERMANENTLY FREEZE program upgrades.');
  console.log('After this action:');
  console.log('  - The program can NEVER be upgraded again');
  console.log('  - No bugs can be fixed');
  console.log('  - No features can be added');
  console.log('  - This action is IRREVERSIBLE');
  console.log('\nType "FREEZE" to continue, or Ctrl+C to cancel:');

  // In a real scenario, you'd want to use readline for user input
  // For now, we'll just exit and require manual confirmation
  console.log('\n❌ Freezing requires manual confirmation');
  console.log('To freeze upgrades, run:');
  console.log(`   solana program set-upgrade-authority ${programId.toString()} --final --upgrade-authority <path>`);
  process.exit(0);
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  const cluster = args[0] || 'devnet';
  const rpcUrl = args[1];
  const keypairPath = args[2];

  try {
    switch (command) {
      case 'show':
        await showUpgradeAuthority(cluster, rpcUrl);
        break;
      case 'transfer':
        await transferUpgradeAuthority(cluster, rpcUrl, keypairPath);
        break;
      case 'freeze':
        await freezeUpgrades(cluster, rpcUrl, keypairPath);
        break;
      default:
        console.log('Usage:');
        console.log('  show      - Show current upgrade authority');
        console.log('  transfer  - Transfer upgrade authority');
        console.log('  freeze    - Freeze upgrades (irreversible!)');
        console.log('\nExamples:');
        console.log('  PROGRAM_ID=<id> ts-node manage-upgrade-authority.ts show devnet');
        console.log('  PROGRAM_ID=<id> NEW_AUTHORITY=<pubkey> ts-node manage-upgrade-authority.ts transfer devnet');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { showUpgradeAuthority, transferUpgradeAuthority, freezeUpgrades };

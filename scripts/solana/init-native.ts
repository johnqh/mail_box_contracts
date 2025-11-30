/**
 * Native Solana Mailer Initialization Script
 *
 * This script initializes the native Solana Mailer program (non-Anchor).
 * It uses Borsh serialization to create the Initialize instruction.
 *
 * Usage:
 *   npx ts-node scripts/solana/init-native.ts <cluster> [rpc-url]
 *
 * Examples:
 *   npx ts-node scripts/solana/init-native.ts devnet
 *   npx ts-node scripts/solana/init-native.ts mainnet-beta https://api.mainnet-beta.solana.com
 *
 * Environment variables (from .env.local):
 *   SOLANA_PRIVATE_KEY - Base58 or JSON array format private key
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

// Default Program ID (same across all clusters)
const DEFAULT_PROGRAM_ID = 'yW7AiuUVdtSDUvExyNtjQDLMLsccnbgAqgZHJYYsqCW';

// USDC mint addresses per cluster
const USDC_MINTS: Record<string, string> = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  'testnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// Default RPC URLs per cluster
const RPC_URLS: Record<string, string> = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  'devnet': 'https://api.devnet.solana.com',
  'testnet': 'https://api.testnet.solana.com',
};

/**
 * Load keypair from SOLANA_PRIVATE_KEY environment variable
 * Supports both base58 (Phantom export) and JSON array formats
 */
async function loadKeypair(): Promise<Keypair> {
  const keyString = process.env.SOLANA_PRIVATE_KEY?.trim();

  if (!keyString) {
    throw new Error('SOLANA_PRIVATE_KEY not found in environment. Set it in .env.local');
  }

  let secretKey: Uint8Array;

  if (keyString.startsWith('[')) {
    // JSON array format: [1,2,3,...]
    secretKey = new Uint8Array(JSON.parse(keyString));
  } else {
    // Base58 format (from Phantom wallet export)
    const bs58 = await import('bs58');
    secretKey = bs58.default.decode(keyString);
  }

  return Keypair.fromSecretKey(secretKey);
}

/**
 * Derive the mailer PDA
 */
function getMailerPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mailer')],
    programId
  );
}

/**
 * Create the Initialize instruction data using Borsh serialization
 *
 * MailerInstruction::Initialize { usdc_mint: Pubkey }
 * - 1 byte: variant index (0)
 * - 32 bytes: usdc_mint pubkey
 */
function createInitializeInstructionData(usdcMint: PublicKey): Buffer {
  const data = Buffer.alloc(1 + 32);

  // Variant index for Initialize = 0
  data.writeUInt8(0, 0);

  // USDC mint pubkey (32 bytes)
  usdcMint.toBuffer().copy(data, 1);

  return data;
}

/**
 * Check if mailer is already initialized
 */
async function isMailerInitialized(connection: Connection, mailerPda: PublicKey): Promise<boolean> {
  const accountInfo = await connection.getAccountInfo(mailerPda);
  return accountInfo !== null && accountInfo.data.length > 0;
}

/**
 * Initialize the mailer program
 */
async function initializeMailer(
  connection: Connection,
  payer: Keypair,
  usdcMint: PublicKey,
  programId: PublicKey
): Promise<string> {
  const [mailerPda, bump] = getMailerPDA(programId);

  console.log('Mailer PDA:', mailerPda.toString());
  console.log('PDA bump:', bump);

  // Check if already initialized
  const initialized = await isMailerInitialized(connection, mailerPda);
  if (initialized) {
    throw new Error(`Mailer is already initialized at ${mailerPda.toString()}`);
  }

  // Create the instruction
  const instructionData = createInitializeInstructionData(usdcMint);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },  // owner
      { pubkey: mailerPda, isSigner: false, isWritable: true },       // mailer PDA
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
    ],
    programId: programId,
    data: instructionData,
  });

  // Create and send transaction
  const transaction = new Transaction().add(instruction);

  console.log('Sending initialize transaction...');
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: 'confirmed' }
  );

  return signature;
}

async function main() {
  const args = process.argv.slice(2);
  const cluster = args[0] || 'devnet';
  const rpcUrl = args[1] || RPC_URLS[cluster];
  const programIdArg = args[2] || DEFAULT_PROGRAM_ID;

  if (!rpcUrl) {
    throw new Error(`Unknown cluster: ${cluster}. Use devnet, testnet, or mainnet-beta`);
  }

  const usdcMintAddress = USDC_MINTS[cluster];
  if (!usdcMintAddress) {
    throw new Error(`No USDC mint configured for cluster: ${cluster}`);
  }

  const programId = new PublicKey(programIdArg);

  console.log('='.repeat(60));
  console.log('NATIVE SOLANA MAILER INITIALIZATION');
  console.log('='.repeat(60));
  console.log('Cluster:', cluster);
  console.log('RPC URL:', rpcUrl);
  console.log('Program ID:', programId.toString());
  console.log('USDC Mint:', usdcMintAddress);
  console.log('-'.repeat(60));

  // Load keypair
  const payer = await loadKeypair();
  console.log('Payer/Owner:', payer.publicKey.toString());

  // Connect
  const connection = new Connection(rpcUrl, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  if (balance < 0.01 * 1e9) {
    throw new Error('Insufficient SOL balance for transaction fees');
  }

  // Initialize
  const usdcMint = new PublicKey(usdcMintAddress);
  const signature = await initializeMailer(connection, payer, usdcMint, programId);

  const [mailerPda] = getMailerPDA(programId);

  console.log('='.repeat(60));
  console.log('INITIALIZATION SUCCESSFUL!');
  console.log('='.repeat(60));
  console.log('Signature:', signature);
  console.log('Mailer PDA:', mailerPda.toString());
  console.log('Owner:', payer.publicKey.toString());
  console.log('USDC Mint:', usdcMintAddress);
  console.log('='.repeat(60));

  // Output JSON for easy copy
  console.log('\nDeployment info (JSON):');
  console.log(JSON.stringify({
    cluster,
    programId: programId.toString(),
    mailerPda: mailerPda.toString(),
    owner: payer.publicKey.toString(),
    usdcMint: usdcMintAddress,
    initSignature: signature,
    timestamp: new Date().toISOString(),
  }, null, 2));
}

main().catch((error) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});

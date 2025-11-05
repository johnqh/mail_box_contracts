import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  SystemProgram,
  ConfirmOptions,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Optional } from '@sudobility/types';
// Removed borsh import - using manual encoding for native program
import { ClaimableInfo, MailerFees } from './types.js';

/**
 * Interface for wallet adapter pattern
 */
export interface Wallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction>(transactions: T[]): Promise<T[]>;
}

/**
 * Compute unit optimization options for Solana transactions
 */
export interface ComputeUnitOptions {
  /**
   * Compute unit limit for the transaction (default: 200,000)
   * Max: 1,400,000
   */
  computeUnitLimit?: number;

  /**
   * Priority fee in micro-lamports per compute unit
   * Higher values = faster inclusion during congestion
   */
  computeUnitPrice?: number;

  /**
   * Automatically simulate and optimize compute units
   * @default false
   */
  autoOptimize?: boolean;

  /**
   * Multiplier for compute unit buffer when auto-optimizing
   * @default 1.2 (20% buffer)
   */
  computeUnitMultiplier?: number;

  /**
   * Skip compute unit settings entirely
   * @default false
   */
  skipComputeUnits?: boolean;
}

/**
 * Transaction result with compute unit details
 */
export interface TransactionResult {
  /**
   * Transaction signature
   */
  signature: string;

  /**
   * Simulated compute units (if auto-optimized)
   */
  simulatedUnits?: number;

  /**
   * Actual compute unit limit set
   */
  computeUnitLimit?: number;

  /**
   * Priority fee per compute unit (if set)
   */
  computeUnitPrice?: number;
}

/**
 * Native Solana Program instruction data structures
 */

// Instruction data encoding functions
function encodeInitialize(usdcMint: PublicKey): Buffer {
  const data = Buffer.alloc(1 + 32);
  data.writeUInt8(InstructionType.Initialize, 0);
  usdcMint.toBuffer().copy(data, 1);
  return data;
}

function encodeSend(
  to: PublicKey,
  subject: string,
  body: string,
  revenueShareToReceiver: boolean,
  resolveSenderToName: boolean = false
): Buffer {
  const subjectBytes = Buffer.from(subject, 'utf8');
  const bodyBytes = Buffer.from(body, 'utf8');
  const data = Buffer.alloc(
    1 + 32 + 4 + subjectBytes.length + 4 + bodyBytes.length + 1 + 1
  );
  let offset = 0;

  data.writeUInt8(InstructionType.Send, offset);
  offset += 1;

  to.toBuffer().copy(data, offset);
  offset += 32;

  data.writeUInt32LE(subjectBytes.length, offset);
  offset += 4;
  subjectBytes.copy(data, offset);
  offset += subjectBytes.length;

  data.writeUInt32LE(bodyBytes.length, offset);
  offset += 4;
  bodyBytes.copy(data, offset);
  offset += bodyBytes.length;

  data.writeUInt8(revenueShareToReceiver ? 1 : 0, offset);
  offset += 1;

  data.writeUInt8(resolveSenderToName ? 1 : 0, offset);

  return data;
}

function encodeSendPrepared(
  to: PublicKey,
  mailId: string,
  revenueShareToReceiver: boolean,
  resolveSenderToName: boolean = false
): Buffer {
  const mailIdBytes = Buffer.from(mailId, 'utf8');
  const data = Buffer.alloc(1 + 32 + 4 + mailIdBytes.length + 1 + 1);
  let offset = 0;

  data.writeUInt8(InstructionType.SendPrepared, offset);
  offset += 1;

  to.toBuffer().copy(data, offset);
  offset += 32;

  data.writeUInt32LE(mailIdBytes.length, offset);
  offset += 4;
  mailIdBytes.copy(data, offset);
  offset += mailIdBytes.length;

  data.writeUInt8(revenueShareToReceiver ? 1 : 0, offset);
  offset += 1;

  data.writeUInt8(resolveSenderToName ? 1 : 0, offset);

  return data;
}

function encodeSendToEmail(
  toEmail: string,
  subject: string,
  body: string
): Buffer {
  const emailBytes = Buffer.from(toEmail, 'utf8');
  const subjectBytes = Buffer.from(subject, 'utf8');
  const bodyBytes = Buffer.from(body, 'utf8');
  const data = Buffer.alloc(
    1 + 4 + emailBytes.length + 4 + subjectBytes.length + 4 + bodyBytes.length
  );
  let offset = 0;

  data.writeUInt8(InstructionType.SendToEmail, offset);
  offset += 1;

  data.writeUInt32LE(emailBytes.length, offset);
  offset += 4;
  emailBytes.copy(data, offset);
  offset += emailBytes.length;

  data.writeUInt32LE(subjectBytes.length, offset);
  offset += 4;
  subjectBytes.copy(data, offset);
  offset += subjectBytes.length;

  data.writeUInt32LE(bodyBytes.length, offset);
  offset += 4;
  bodyBytes.copy(data, offset);

  return data;
}

function encodeSendPreparedToEmail(
  toEmail: string,
  mailId: string
): Buffer {
  const emailBytes = Buffer.from(toEmail, 'utf8');
  const mailIdBytes = Buffer.from(mailId, 'utf8');
  const data = Buffer.alloc(
    1 + 4 + emailBytes.length + 4 + mailIdBytes.length
  );
  let offset = 0;

  data.writeUInt8(InstructionType.SendPreparedToEmail, offset);
  offset += 1;

  data.writeUInt32LE(emailBytes.length, offset);
  offset += 4;
  emailBytes.copy(data, offset);
  offset += emailBytes.length;

  data.writeUInt32LE(mailIdBytes.length, offset);
  offset += 4;
  mailIdBytes.copy(data, offset);

  return data;
}

function encodeSendThroughWebhook(
  to: PublicKey,
  webhookId: string,
  revenueShareToReceiver: boolean,
  resolveSenderToName: boolean = false
): Buffer {
  const webhookBytes = Buffer.from(webhookId, 'utf8');
  const data = Buffer.alloc(1 + 32 + 4 + webhookBytes.length + 1 + 1);
  let offset = 0;

  data.writeUInt8(InstructionType.SendThroughWebhook, offset);
  offset += 1;

  to.toBuffer().copy(data, offset);
  offset += 32;

  data.writeUInt32LE(webhookBytes.length, offset);
  offset += 4;
  webhookBytes.copy(data, offset);
  offset += webhookBytes.length;

  data.writeUInt8(revenueShareToReceiver ? 1 : 0, offset);
  offset += 1;

  data.writeUInt8(resolveSenderToName ? 1 : 0, offset);

  return data;
}

function encodeSimpleInstruction(instructionType: InstructionType): Buffer {
  const data = Buffer.alloc(1);
  data.writeUInt8(instructionType, 0);
  return data;
}

function encodeSetFee(newFee: bigint): Buffer {
  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(InstructionType.SetFee, 0);
  data.writeBigUInt64LE(newFee, 1);
  return data;
}

function encodeSetDelegationFee(newFee: bigint): Buffer {
  const data = Buffer.alloc(1 + 8);
  data.writeUInt8(InstructionType.SetDelegationFee, 0);
  data.writeBigUInt64LE(newFee, 1);
  return data;
}

function encodeSetCustomFeePercentage(
  account: PublicKey,
  percentage: number
): Buffer {
  const data = Buffer.alloc(1 + 32 + 1);
  data.writeUInt8(InstructionType.SetCustomFeePercentage, 0);
  account.toBuffer().copy(data, 1);
  data.writeUInt8(percentage, 33);
  return data;
}

function encodeClearCustomFeePercentage(account: PublicKey): Buffer {
  const data = Buffer.alloc(1 + 32);
  data.writeUInt8(InstructionType.ClearCustomFeePercentage, 0);
  account.toBuffer().copy(data, 1);
  return data;
}

function encodeDelegateTo(delegate?: Optional<PublicKey>): Buffer {
  if (!delegate) {
    // Clear delegation - just send the instruction type and a null option
    const data = Buffer.alloc(1 + 1);
    data.writeUInt8(InstructionType.DelegateTo, 0);
    data.writeUInt8(0, 1); // Option::None
    return data;
  } else {
    // Set delegation - send instruction type, Some option, and pubkey
    const data = Buffer.alloc(1 + 1 + 32);
    data.writeUInt8(InstructionType.DelegateTo, 0);
    data.writeUInt8(1, 1); // Option::Some
    delegate.toBuffer().copy(data, 2);
    return data;
  }
}

function encodeClaimExpiredShares(recipient: PublicKey): Buffer {
  const data = Buffer.alloc(1 + 32);
  data.writeUInt8(InstructionType.ClaimExpiredShares, 0);
  recipient.toBuffer().copy(data, 1);
  return data;
}

// Account data parsing interfaces
interface MailerState {
  owner: PublicKey;
  usdc_mint: PublicKey;
  send_fee: bigint;
  delegation_fee: bigint;
  owner_claimable: bigint;
  paused: boolean;
  bump: number;
}

interface RecipientClaim {
  recipient: PublicKey;
  amount: bigint;
  timestamp: bigint;
  bump: number;
}

interface Delegation {
  delegator: PublicKey;
  delegate?: Optional<PublicKey>;
  bump: number;
}

interface FeeDiscountAccount {
  account: PublicKey;
  discount: number;
  bump: number;
}

// Account data parsing functions
function parseMailerState(data: Buffer): MailerState {
  let offset = 0;
  const owner = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const usdcMint = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const sendFee = data.readBigUInt64LE(offset);
  offset += 8;
  const delegationFee = data.readBigUInt64LE(offset);
  offset += 8;
  const ownerClaimable = data.readBigUInt64LE(offset);
  offset += 8;
  const paused = data.readUInt8(offset) === 1;
  offset += 1;
  const bump = data.readUInt8(offset);

  return {
    owner,
    usdc_mint: usdcMint,
    send_fee: sendFee,
    delegation_fee: delegationFee,
    owner_claimable: ownerClaimable,
    paused,
    bump,
  };
}

function parseRecipientClaim(data: Buffer): RecipientClaim {
  let offset = 0;
  const recipient = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const timestamp = data.readBigInt64LE(offset);
  offset += 8;
  const bump = data.readUInt8(offset);

  return {
    recipient,
    amount,
    timestamp,
    bump,
  };
}

function parseDelegation(data: Buffer): Delegation {
  let offset = 0;
  const delegator = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const hasDelegate = data.readUInt8(offset) === 1;
  offset += 1;
  const delegate = hasDelegate
    ? new PublicKey(data.slice(offset, offset + 32))
    : null;
  if (hasDelegate) offset += 32;
  const bump = data.readUInt8(offset);

  return {
    delegator,
    delegate,
    bump,
  };
}

function parseFeeDiscount(data: Buffer): FeeDiscountAccount {
  let offset = 0;
  const account = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const discount = data.readUInt8(offset);
  offset += 1;
  const bump = data.readUInt8(offset);

  return {
    account,
    discount,
    bump,
  };
}

enum InstructionType {
  Initialize = 0,
  Send = 1,
  SendPrepared = 2,
  SendToEmail = 3,
  SendPreparedToEmail = 4,
  SendThroughWebhook = 5,
  ClaimRecipientShare = 6,
  ClaimOwnerShare = 7,
  SetFee = 8,
  DelegateTo = 9,
  RejectDelegation = 10,
  SetDelegationFee = 11,
  SetCustomFeePercentage = 12,
  ClearCustomFeePercentage = 13,
  Pause = 14,
  Unpause = 15,
  DistributeClaimableFunds = 16,
  ClaimExpiredShares = 17,
  EmergencyUnpause = 18,
}

/**
 * @class MailerClient
 * @description Native Solana program client for the Mailer program
 * @notice Provides easy-to-use methods for sending messages with USDC fees and revenue sharing
 *
 * ## Key Features:
 * - **Priority Messages**: Full fee (0.1 USDC) with 90% revenue share to recipient
 * - **Standard Messages**: 10% fee only (0.01 USDC) with no revenue share
 * - **Revenue Claims**: 60-day claim period for priority message revenue shares
 * - **Delegation Management**: Delegate message handling with rejection capability
 *
 * ## Usage Examples:
 * ```typescript
 * // Connect to existing deployed program
 * const connection = new Connection('https://api.devnet.solana.com');
 * const wallet = new WalletAdapter(keypair);
 * const programId = new PublicKey('9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF');
 * const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
 * const client = new MailerClient(connection, wallet, programId, usdcMint);
 *
 * // Send message with revenue sharing to recipient
 * await client.send('recipient-address', 'Subject', 'Message body', true);
 *
 * // Claim your revenue share within 60 days (as recipient)
 * await client.claimRecipientShare();
 *
 * // Check claimable amount
 * const info = await client.getRecipientClaimable();
 * if (info) console.log(`Claimable: ${formatUSDC(info.amount)} USDC`);
 * ```
 *
 * @author Mailer Team
 * @version 2.0.0 - Native Solana Program (no Anchor)
 */
export class MailerClient {
  private connection: Connection;
  private wallet: Wallet;
  private programId: PublicKey;
  private usdcMint: PublicKey;
  private mailerStatePda: PublicKey;
  private mailerBump: number;
  private defaultComputeUnitMultiplier = 1.2; // 20% buffer by default

  constructor(
    connection: Connection,
    wallet: Wallet,
    programId: PublicKey,
    usdcMint: PublicKey
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
    this.usdcMint = usdcMint;

    // Derive the mailer state PDA
    const [mailerPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('mailer')],
      this.programId
    );
    this.mailerStatePda = mailerPda;
    this.mailerBump = bump;
  }

  /**
   * Optimize compute units for a transaction
   * @param transaction Transaction to optimize
   * @param options Compute unit options
   * @returns Optimized transaction with compute budget instructions
   */
  private async optimizeComputeUnits(
    transaction: Transaction,
    options?: ComputeUnitOptions
  ): Promise<{ transaction: Transaction; simulatedUnits?: number }> {
    // Skip if explicitly disabled
    if (options?.skipComputeUnits) {
      return { transaction };
    }

    let simulatedUnits: number | undefined;
    let computeUnitLimit = options?.computeUnitLimit;

    // Auto-optimize by simulating transaction
    if (options?.autoOptimize && !computeUnitLimit) {
      try {
        // Set a high limit for simulation
        const simTransaction = new Transaction().add(...transaction.instructions);
        simTransaction.add(
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 1_400_000, // Max for simulation
          })
        );
        simTransaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        simTransaction.feePayer = this.wallet.publicKey;

        const simulation = await this.connection.simulateTransaction(simTransaction);

        if (simulation.value.err === null && simulation.value.unitsConsumed) {
          simulatedUnits = simulation.value.unitsConsumed;
          const multiplier = options.computeUnitMultiplier ?? this.defaultComputeUnitMultiplier;
          computeUnitLimit = Math.min(
            Math.ceil(simulatedUnits * multiplier),
            1_400_000 // Max compute units
          );
        }
      } catch (error) {
        console.warn('Failed to simulate transaction for compute unit optimization:', error);
        // Fall back to default or specified limit
        computeUnitLimit = computeUnitLimit ?? 200_000;
      }
    }

    // Create new transaction with compute budget instructions prepended
    const optimizedTx = new Transaction();

    // Add compute unit limit if specified or auto-optimized
    if (computeUnitLimit) {
      optimizedTx.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnitLimit,
        })
      );
    }

    // Add priority fee if specified
    if (options?.computeUnitPrice) {
      optimizedTx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: options.computeUnitPrice,
        })
      );
    }

    // Add original instructions
    optimizedTx.add(...transaction.instructions);

    return {
      transaction: optimizedTx,
      simulatedUnits,
    };
  }

  /**
   * Initialize the mailer program (owner only)
   * @param computeOptions Compute unit optimization options
   */
  async initialize(computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeInitialize(this.usdcMint),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Send a message with optional revenue sharing
   * @param to Recipient's public key or address string who receives message and potential revenue share
   * @param subject Message subject
   * @param body Message body
   * @param revenueShareToReceiver If true, recipient gets 90% revenue share; if false, no revenue share
   * @param resolveSenderToName If true, resolve sender address to name via off-chain service
   * @param computeOptions Compute unit optimization options
   * @returns Transaction result with signature and compute details
   */
  async send(
    to: string | PublicKey,
    subject: string,
    body: string,
    revenueShareToReceiver: boolean = false,
    resolveSenderToName: boolean = false,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const recipientKey = typeof to === 'string' ? new PublicKey(to) : to;
    // Derive recipient claim PDA
    const [recipientClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), recipientKey.toBuffer()],
      this.programId
    );

    // Get associated token accounts
    const senderTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    // Check if accounts need to be created
    const instructions: TransactionInstruction[] = [];

    // Check if mailer token account exists
    const mailerTokenInfo =
      await this.connection.getAccountInfo(mailerTokenAccount);
    if (!mailerTokenInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          mailerTokenAccount,
          this.mailerStatePda,
          this.usdcMint
        )
      );
    }

    // Add the send instruction
    const sendInstruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: recipientClaimPda, isSigner: false, isWritable: true },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSend(recipientKey, subject, body, revenueShareToReceiver, resolveSenderToName),
    });

    instructions.push(sendInstruction);
    const transaction = new Transaction().add(...instructions);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Claim recipient share of revenue
   * @returns Transaction result
   */
  async claimRecipientShare(computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const [recipientClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), this.wallet.publicKey.toBuffer()],
      this.programId
    );

    const recipientTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: recipientClaimPda, isSigner: false, isWritable: true },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSimpleInstruction(InstructionType.ClaimRecipientShare),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Claim owner share of fees (owner only)
   * @returns Transaction result
   */
  async claimOwnerShare(computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const ownerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
        { pubkey: ownerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSimpleInstruction(InstructionType.ClaimOwnerShare),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Claim expired recipient shares and move them under owner control
   * @param recipient Recipient whose expired shares to reclaim
   * @param options Transaction confirm options
   * @returns Transaction signature
   */
  async claimExpiredShares(
    recipient: string | PublicKey,
    options?: ConfirmOptions
  , computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const recipientKey = typeof recipient === 'string' ? new PublicKey(recipient) : recipient;

    const [recipientClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), recipientKey.toBuffer()],
      this.programId
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
        { pubkey: recipientClaimPda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: encodeClaimExpiredShares(recipientKey),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, options, computeOptions);
  }

  /**
   * Delegate message handling to another address
   * @param delegate Address to delegate to, or null to clear delegation
   * @returns Transaction signature
   */
  async delegateTo(delegate?: Optional<string | PublicKey>, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const delegateKey = delegate
      ? typeof delegate === 'string'
        ? new PublicKey(delegate)
        : delegate
      : null;

    const [delegationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('delegation'), this.wallet.publicKey.toBuffer()],
      this.programId
    );

    const delegatorTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: delegationPda, isSigner: false, isWritable: true },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: delegatorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeDelegateTo(delegateKey),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Reject a delegation made to you
   * @param delegator Address that delegated to you
   * @returns Transaction signature
   */
  async rejectDelegation(delegator: string | PublicKey, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const delegatorKey =
      typeof delegator === 'string' ? new PublicKey(delegator) : delegator;

    const [delegationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('delegation'), delegatorKey.toBuffer()],
      this.programId
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: delegationPda, isSigner: false, isWritable: true },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSimpleInstruction(InstructionType.RejectDelegation),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Set the send fee (owner only)
   * @param newFee New fee in USDC micro-units (6 decimals)
   * @param computeOptions Compute unit optimization options
   * @returns Transaction result
   */
  async setFee(newFee: number | bigint, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: encodeSetFee(typeof newFee === 'bigint' ? newFee : BigInt(newFee)),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Set the delegation fee (owner only)
   * @param newFee New delegation fee in USDC micro-units (6 decimals)
   * @returns Transaction signature
   */
  async setDelegationFee(newFee: number | bigint, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: encodeSetDelegationFee(
        typeof newFee === 'bigint' ? newFee : BigInt(newFee)
      ),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, undefined, computeOptions);
  }

  async setCustomFeePercentage(
    account: string | PublicKey,
    percentage: number,
    payer?: Optional<string | PublicKey>
  , computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const normalizedPercentage = Math.trunc(percentage);
    if (normalizedPercentage < 0 || normalizedPercentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }

    const accountKey = typeof account === 'string' ? new PublicKey(account) : account;
    const payerKey = payer
      ? typeof payer === 'string'
        ? new PublicKey(payer)
        : payer
      : this.wallet.publicKey;

    const [discountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('discount'), accountKey.toBuffer()],
      this.programId
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: discountPda, isSigner: false, isWritable: true },
        { pubkey: accountKey, isSigner: false, isWritable: false },
        { pubkey: payerKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSetCustomFeePercentage(accountKey, normalizedPercentage),
    });

    const transaction = new Transaction().add(instruction);
    return this.sendTransaction(transaction, undefined, computeOptions);
  }

  async clearCustomFeePercentage(account: string | PublicKey, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const accountKey = typeof account === 'string' ? new PublicKey(account) : account;
    const [discountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('discount'), accountKey.toBuffer()],
      this.programId
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: discountPda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: encodeClearCustomFeePercentage(accountKey),
    });

    const transaction = new Transaction().add(instruction);
    return this.sendTransaction(transaction, undefined, computeOptions);
  }

  async getCustomFeePercentage(account: string | PublicKey): Promise<number> {
    const accountKey = typeof account === 'string' ? new PublicKey(account) : account;
    const [discountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('discount'), accountKey.toBuffer()],
      this.programId
    );

    const accountInfo = await this.connection.getAccountInfo(discountPda);
    if (!accountInfo) {
      return 100;
    }

    const discountState = parseFeeDiscount(accountInfo.data);
    return 100 - discountState.discount;
  }

  /**
   * Get current fees from the mailer state
   * @returns MailerFees object with current fees
   */
  async getFees(): Promise<MailerFees> {
    const accountInfo = await this.connection.getAccountInfo(
      this.mailerStatePda
    );
    if (!accountInfo) {
      throw new Error(
        'Mailer state account not found - program not initialized'
      );
    }

    const stateData = parseMailerState(accountInfo.data);
    return {
      sendFee: Number(stateData.send_fee),
      delegationFee: Number(stateData.delegation_fee),
    };
  }

  /**
   * Get recipient claimable information
   * @param recipient Optional recipient address, defaults to wallet address
   * @returns ClaimableInfo or null if no claimable amount
   */
  async getRecipientClaimable(
    recipient?: Optional<PublicKey>
  ): Promise<Optional<ClaimableInfo>> {
    const recipientKey = recipient || this.wallet.publicKey;
    const [recipientClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), recipientKey.toBuffer()],
      this.programId
    );

    const accountInfo = await this.connection.getAccountInfo(recipientClaimPda);
    if (!accountInfo) {
      return null;
    }

    const claimData = parseRecipientClaim(accountInfo.data);

    // Check if claim period has expired (60 days)
    const now = Math.floor(Date.now() / 1000);
    const isExpired = now > Number(claimData.timestamp) + 60 * 24 * 60 * 60;

    return {
      amount: Number(claimData.amount),
      timestamp: Number(claimData.timestamp),
      recipient: recipientKey.toBase58(),
      isExpired,
    };
  }

  /**
   * Get owner claimable amount
   * @returns Owner claimable amount in USDC micro-units
   */
  async getOwnerClaimable(): Promise<number> {
    const accountInfo = await this.connection.getAccountInfo(
      this.mailerStatePda
    );
    if (!accountInfo) {
      throw new Error('Mailer state account not found');
    }

    const stateData = parseMailerState(accountInfo.data);
    return Number(stateData.owner_claimable);
  }

  /**
   * Get delegation information for an address
   * @param delegator Address to check delegation for, defaults to wallet address
   * @returns Delegation info or null if no delegation
   */
  async getDelegation(
    delegator?: Optional<PublicKey>
  ): Promise<Optional<{ delegator: string; delegate?: Optional<string> }>> {
    const delegatorKey = delegator || this.wallet.publicKey;
    const [delegationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('delegation'), delegatorKey.toBuffer()],
      this.programId
    );

    const accountInfo = await this.connection.getAccountInfo(delegationPda);
    if (!accountInfo) {
      return null;
    }

    const delegationData = parseDelegation(accountInfo.data);
    return {
      delegator: delegatorKey.toBase58(),
      delegate: delegationData.delegate
        ? delegationData.delegate.toBase58()
        : null,
    };
  }

  /**
   * Get the mailer state PDA address
   * @returns PublicKey of the mailer state PDA
   */
  getMailerStatePda(): PublicKey {
    return this.mailerStatePda;
  }

  /**
   * Send a message to an email address (no wallet known)
   * Charges only 10% owner fee since recipient wallet is unknown
   * @param toEmail Email address of the recipient
   * @param subject Message subject
   * @param body Message body
   * @param options Transaction confirm options
   * @returns Transaction signature
   */
  async sendToEmail(
    toEmail: string,
    subject: string,
    body: string,
    options?: ConfirmOptions
  , computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    // Get associated token accounts
    const senderTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    // Check if accounts need to be created
    const instructions: TransactionInstruction[] = [];

    // Check if mailer token account exists
    const mailerTokenInfo =
      await this.connection.getAccountInfo(mailerTokenAccount);
    if (!mailerTokenInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          mailerTokenAccount,
          this.mailerStatePda,
          this.usdcMint
        )
      );
    }

    // Encode instruction data for SendToEmail
    const instructionData = encodeSendToEmail(toEmail, subject, body);

    // Create send instruction
    instructions.push(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
          { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
          { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: instructionData,
      })
    );

    const transaction = new Transaction().add(...instructions);
    return this.sendTransaction(transaction, options, computeOptions);
  }

  /**
   * Send a prepared message to an email address (no wallet known)
   * Charges only 10% owner fee since recipient wallet is unknown
   * @param toEmail Email address of the recipient
   * @param mailId Pre-prepared message ID
   * @param options Transaction confirm options
   * @returns Transaction signature
   */
  async sendPreparedToEmail(
    toEmail: string,
    mailId: string,
    options?: ConfirmOptions
  , computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    // Get associated token accounts
    const senderTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    // Check if accounts need to be created
    const instructions: TransactionInstruction[] = [];

    // Check if mailer token account exists
    const mailerTokenInfo =
      await this.connection.getAccountInfo(mailerTokenAccount);
    if (!mailerTokenInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          mailerTokenAccount,
          this.mailerStatePda,
          this.usdcMint
        )
      );
    }

    // Encode instruction data for SendPreparedToEmail
    const instructionData = encodeSendPreparedToEmail(toEmail, mailId);

    // Create send instruction
    instructions.push(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
          { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
          { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: this.programId,
        data: instructionData,
      })
    );

    const transaction = new Transaction().add(...instructions);
    return this.sendTransaction(transaction, options, computeOptions);
  }

  /**
   * Send a prepared message using a mailId (to match EVM behavior)
   * @param to Recipient's public key or address string
   * @param mailId Pre-prepared message identifier
   * @param revenueShareToReceiver If true, recipient gets 90% revenue share
   * @param resolveSenderToName If true, resolve sender address to name
   * @returns Transaction signature
   */
  async sendPrepared(
    to: string | PublicKey,
    mailId: string,
    revenueShareToReceiver: boolean = false,
    resolveSenderToName: boolean = false
  , computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const recipientKey = typeof to === 'string' ? new PublicKey(to) : to;
    const [recipientClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), recipientKey.toBuffer()],
      this.programId
    );

    const senderTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    const instructions: TransactionInstruction[] = [];

    const mailerTokenInfo =
      await this.connection.getAccountInfo(mailerTokenAccount);
    if (!mailerTokenInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          mailerTokenAccount,
          this.mailerStatePda,
          this.usdcMint
        )
      );
    }

    const sendInstruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: recipientClaimPda, isSigner: false, isWritable: true },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSendPrepared(
        recipientKey,
        mailId,
        revenueShareToReceiver,
        resolveSenderToName
      ),
    });

    instructions.push(sendInstruction);
    const transaction = new Transaction().add(...instructions);
    return this.sendTransaction(transaction, undefined, computeOptions);
  }

  async sendThroughWebhook(
    to: string | PublicKey,
    webhookId: string,
    revenueShareToReceiver: boolean = false,
    resolveSenderToName: boolean = false
  , computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const recipientKey = typeof to === 'string' ? new PublicKey(to) : to;
    const [recipientClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), recipientKey.toBuffer()],
      this.programId
    );

    const senderTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    const instructions: TransactionInstruction[] = [];

    const mailerTokenInfo =
      await this.connection.getAccountInfo(mailerTokenAccount);
    if (!mailerTokenInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          mailerTokenAccount,
          this.mailerStatePda,
          this.usdcMint
        )
      );
    }

    const sendInstruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: recipientClaimPda, isSigner: false, isWritable: true },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSendThroughWebhook(
        recipientKey,
        webhookId,
        revenueShareToReceiver,
        resolveSenderToName
      ),
    });

    instructions.push(sendInstruction);
    const transaction = new Transaction().add(...instructions);
    return this.sendTransaction(transaction, undefined, computeOptions);
  }

  /**
   * Pause the contract and distribute owner claimable funds (owner only)
   * @param options Transaction confirm options
   * @returns Transaction signature
   */
  async pause(options?: ConfirmOptions, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const ownerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.wallet.publicKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
        { pubkey: ownerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data: encodeSimpleInstruction(InstructionType.Pause),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, options, computeOptions);
  }

  /**
   * Unpause the contract (owner only)
   * @param options Transaction confirm options
   * @returns Transaction signature
   */
  async unpause(options?: ConfirmOptions, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: encodeSimpleInstruction(InstructionType.Unpause),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, options, computeOptions);
  }

  /**
   * Emergency unpause without fund distribution (owner only)
   * @param options Transaction confirm options
   * @returns Transaction signature
   */
  async emergencyUnpause(options?: ConfirmOptions, computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: encodeSimpleInstruction(InstructionType.EmergencyUnpause),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, options, computeOptions);
  }

  /**
   * Distribute claimable funds to a recipient when contract is paused
   * @param recipient Recipient address to distribute funds for
   * @param options Transaction confirm options
   * @returns Transaction signature
   */
  async distributeClaimableFunds(
    recipient: string | PublicKey,
    options?: ConfirmOptions
  , computeOptions?: ComputeUnitOptions): Promise<TransactionResult> {
    const recipientKey = typeof recipient === 'string' ? new PublicKey(recipient) : recipient;

    const [recipientClaimPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), recipientKey.toBuffer()],
      this.programId
    );

    const recipientTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      recipientKey
    );
    const mailerTokenAccount = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.mailerStatePda,
      true
    );

    // Encode the recipient parameter
    const data = Buffer.alloc(1 + 32);
    data.writeUInt8(InstructionType.DistributeClaimableFunds, 0);
    recipientKey.toBuffer().copy(data, 1);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: false },
        { pubkey: recipientClaimPda, isSigner: false, isWritable: true },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: this.programId,
      data,
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction, options, computeOptions);
  }

  /**
   * Get the current send fee
   * @returns Send fee in USDC micro-units (6 decimals)
   */
  async getSendFee(): Promise<bigint> {
    const fees = await this.getFees();
    return BigInt(fees.sendFee);
  }

  /**
   * Check if contract is currently paused
   * @returns True if contract is paused, false otherwise
   */
  async isPaused(): Promise<boolean> {
    const accountInfo = await this.connection.getAccountInfo(
      this.mailerStatePda
    );
    if (!accountInfo) {
      throw new Error(
        'Mailer state account not found - program not initialized'
      );
    }

    const stateData = parseMailerState(accountInfo.data);
    // paused field is at offset: 32 + 32 + 8 + 8 + 8 = 88 bytes
    return stateData.paused;
  }

  /**
   * Send and confirm a transaction
   * @param transaction Transaction to send
   * @param options Confirm options
   * @returns Transaction signature
   */
  private async sendTransaction(
    transaction: Transaction,
    options?: Optional<ConfirmOptions>,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    // Optimize compute units if requested
    const { transaction: optimizedTx, simulatedUnits } = await this.optimizeComputeUnits(
      transaction,
      computeOptions
    );

    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    optimizedTx.recentBlockhash = blockhash;
    optimizedTx.feePayer = this.wallet.publicKey;

    // Sign transaction
    const signedTx = await this.wallet.signTransaction(optimizedTx);

    // Send and confirm
    const signature = await this.connection.sendRawTransaction(
      signedTx.serialize()
    );
    await this.connection.confirmTransaction(
      signature,
      options?.commitment || 'confirmed'
    );

    return {
      signature,
      simulatedUnits,
      computeUnitLimit: computeOptions?.computeUnitLimit,
      computeUnitPrice: computeOptions?.computeUnitPrice,
    };
  }

  /**
   * Create a simple wallet from a keypair for testing
   * @param keypair Solana keypair
   * @returns Wallet interface implementation
   */
  static createWallet(keypair: Keypair): Wallet {
    return {
      publicKey: keypair.publicKey,
      async signTransaction<T extends Transaction>(transaction: T): Promise<T> {
        transaction.partialSign(keypair);
        return transaction;
      },
      async signAllTransactions<T extends Transaction>(
        transactions: T[]
      ): Promise<T[]> {
        return transactions.map((tx) => {
          tx.partialSign(keypair);
          return tx;
        });
      },
    };
  }
}

// Wallet interface is exported above

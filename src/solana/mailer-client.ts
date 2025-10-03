import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  SystemProgram,
  ConfirmOptions,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Optional } from '@johnqh/types';
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
  revenueShareToReceiver: boolean
): Buffer {
  const subjectBytes = Buffer.from(subject, 'utf8');
  const bodyBytes = Buffer.from(body, 'utf8');
  const data = Buffer.alloc(
    1 + 32 + 4 + subjectBytes.length + 4 + bodyBytes.length + 1
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

// Account data parsing interfaces
interface MailerState {
  owner: PublicKey;
  usdc_mint: PublicKey;
  send_fee: bigint;
  delegation_fee: bigint;
  owner_claimable: bigint;
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
  const bump = data.readUInt8(offset);

  return {
    owner,
    usdc_mint: usdcMint,
    send_fee: sendFee,
    delegation_fee: delegationFee,
    owner_claimable: ownerClaimable,
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

/**
 * Instruction types for the native Solana program
 */
enum InstructionType {
  Initialize = 0,
  Send = 1,
  SendToEmail = 2,
  SendPreparedToEmail = 3,
  ClaimRecipientShare = 4,
  ClaimOwnerShare = 5,
  SetFee = 6,
  DelegateTo = 7,
  RejectDelegation = 8,
  SetDelegationFee = 9,
  Pause = 10,
  Unpause = 11,
  DistributeClaimableFunds = 12,
  EmergencyUnpause = 13,
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
   * Initialize the mailer program (owner only)
   */
  async initialize(): Promise<string> {
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
    return await this.sendTransaction(transaction);
  }

  /**
   * Send a message with optional revenue sharing
   * @param to Recipient's public key or address string who receives message and potential revenue share
   * @param subject Message subject
   * @param body Message body
   * @param revenueShareToReceiver If true, recipient gets 90% revenue share; if false, no revenue share
   * @returns Transaction signature
   */
  async send(
    to: string | PublicKey,
    subject: string,
    body: string,
    revenueShareToReceiver: boolean = false
  ): Promise<string> {
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
      data: encodeSend(recipientKey, subject, body, revenueShareToReceiver),
    });

    instructions.push(sendInstruction);
    const transaction = new Transaction().add(...instructions);
    return await this.sendTransaction(transaction);
  }

  /**
   * Claim recipient share of revenue
   * @returns Transaction signature
   */
  async claimRecipientShare(): Promise<string> {
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
    return await this.sendTransaction(transaction);
  }

  /**
   * Claim owner share of fees (owner only)
   * @returns Transaction signature
   */
  async claimOwnerShare(): Promise<string> {
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
    return await this.sendTransaction(transaction);
  }

  /**
   * Delegate message handling to another address
   * @param delegate Address to delegate to, or null to clear delegation
   * @returns Transaction signature
   */
  async delegateTo(delegate?: Optional<string | PublicKey>): Promise<string> {
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
    return await this.sendTransaction(transaction);
  }

  /**
   * Reject a delegation made to you
   * @param delegator Address that delegated to you
   * @returns Transaction signature
   */
  async rejectDelegation(delegator: string | PublicKey): Promise<string> {
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
      ],
      programId: this.programId,
      data: encodeSimpleInstruction(InstructionType.RejectDelegation),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction);
  }

  /**
   * Set the send fee (owner only)
   * @param newFee New fee in USDC micro-units (6 decimals)
   * @returns Transaction signature
   */
  async setFee(newFee: number | bigint): Promise<string> {
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.mailerStatePda, isSigner: false, isWritable: true },
      ],
      programId: this.programId,
      data: encodeSetFee(typeof newFee === 'bigint' ? newFee : BigInt(newFee)),
    });

    const transaction = new Transaction().add(instruction);
    return await this.sendTransaction(transaction);
  }

  /**
   * Set the delegation fee (owner only)
   * @param newFee New delegation fee in USDC micro-units (6 decimals)
   * @returns Transaction signature
   */
  async setDelegationFee(newFee: number | bigint): Promise<string> {
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
    return await this.sendTransaction(transaction);
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
  ): Promise<string> {
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
    return this.sendTransaction(transaction, options);
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
  ): Promise<string> {
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
    return this.sendTransaction(transaction, options);
  }

  /**
   * Send and confirm a transaction
   * @param transaction Transaction to send
   * @param options Confirm options
   * @returns Transaction signature
   */
  private async sendTransaction(
    transaction: Transaction,
    options?: Optional<ConfirmOptions>
  ): Promise<string> {
    // Get recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.wallet.publicKey;

    // Sign transaction
    const signedTx = await this.wallet.signTransaction(transaction);

    // Send and confirm
    const signature = await this.connection.sendRawTransaction(
      signedTx.serialize()
    );
    await this.connection.confirmTransaction(
      signature,
      options?.commitment || 'confirmed'
    );

    return signature;
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

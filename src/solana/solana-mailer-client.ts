import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ConfirmOptions,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { ChainInfo } from '@sudobility/configs';
import { Optional } from '@sudobility/types';
import { ClaimableInfo, MailerFees } from './types';

/**
 * Interface for wallet adapter pattern
 */
export interface Wallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction>(transactions: T[]): Promise<T[]>;
}

/**
 * Solana Wallet interface
 */
export interface SolanaWallet {
  wallet: Wallet;
  connection?: Connection;
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
   * Transaction hash (same as signature for Solana)
   */
  transactionHash: string;

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
 * Native Solana Program instruction types
 */
enum InstructionType {
  Initialize = 0,
  Send = 1,
  SendPrepared = 2,
  SendThroughWebhook = 3,
  SendToEmail = 4,
  SendPreparedToEmail = 5,
  ClaimRecipientShare = 6,
  ClaimOwnerShare = 7,
  ClaimExpiredShares = 8,
  SetFees = 9,
  DelegateTo = 10,
  RejectDelegation = 11,
  SetCustomFeePercentage = 12,
  ClearCustomFeePercentage = 13,
  Pause = 14,
  Unpause = 15,
  EmergencyUnpause = 16,
  DistributeClaimableFunds = 17,
}

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

function encodeSendThroughWebhook(
  to: PublicKey,
  subject: string,
  body: string,
  webhookId: string,
  revenueShareToReceiver: boolean
): Buffer {
  const subjectBytes = Buffer.from(subject, 'utf8');
  const bodyBytes = Buffer.from(body, 'utf8');
  const webhookIdBytes = Buffer.from(webhookId, 'utf8');
  const data = Buffer.alloc(
    1 + 32 + 4 + subjectBytes.length + 4 + bodyBytes.length + 4 + webhookIdBytes.length + 1
  );
  let offset = 0;

  data.writeUInt8(InstructionType.SendThroughWebhook, offset);
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

  data.writeUInt32LE(webhookIdBytes.length, offset);
  offset += 4;
  webhookIdBytes.copy(data, offset);
  offset += webhookIdBytes.length;

  data.writeUInt8(revenueShareToReceiver ? 1 : 0, offset);

  return data;
}

function encodeSendToEmail(
  emailHash: string,
  subject: string,
  body: string,
  payer: PublicKey,
  revenueShareToReceiver: boolean
): Buffer {
  const emailHashBytes = Buffer.from(emailHash, 'utf8');
  const subjectBytes = Buffer.from(subject, 'utf8');
  const bodyBytes = Buffer.from(body, 'utf8');
  const data = Buffer.alloc(
    1 + 4 + emailHashBytes.length + 4 + subjectBytes.length + 4 + bodyBytes.length + 32 + 1
  );
  let offset = 0;

  data.writeUInt8(InstructionType.SendToEmail, offset);
  offset += 1;

  data.writeUInt32LE(emailHashBytes.length, offset);
  offset += 4;
  emailHashBytes.copy(data, offset);
  offset += emailHashBytes.length;

  data.writeUInt32LE(subjectBytes.length, offset);
  offset += 4;
  subjectBytes.copy(data, offset);
  offset += subjectBytes.length;

  data.writeUInt32LE(bodyBytes.length, offset);
  offset += 4;
  bodyBytes.copy(data, offset);
  offset += bodyBytes.length;

  payer.toBuffer().copy(data, offset);
  offset += 32;

  data.writeUInt8(revenueShareToReceiver ? 1 : 0, offset);

  return data;
}

function encodeSendPreparedToEmail(
  emailHash: string,
  mailId: string,
  payer: PublicKey,
  revenueShareToReceiver: boolean
): Buffer {
  const emailHashBytes = Buffer.from(emailHash, 'utf8');
  const mailIdBytes = Buffer.from(mailId, 'utf8');
  const data = Buffer.alloc(
    1 + 4 + emailHashBytes.length + 4 + mailIdBytes.length + 32 + 1
  );
  let offset = 0;

  data.writeUInt8(InstructionType.SendPreparedToEmail, offset);
  offset += 1;

  data.writeUInt32LE(emailHashBytes.length, offset);
  offset += 4;
  emailHashBytes.copy(data, offset);
  offset += emailHashBytes.length;

  data.writeUInt32LE(mailIdBytes.length, offset);
  offset += 4;
  mailIdBytes.copy(data, offset);
  offset += mailIdBytes.length;

  payer.toBuffer().copy(data, offset);
  offset += 32;

  data.writeUInt8(revenueShareToReceiver ? 1 : 0, offset);

  return data;
}

function encodeSetFees(sendFee: bigint, delegationFee: bigint): Buffer {
  const data = Buffer.alloc(1 + 8 + 8);
  data.writeUInt8(InstructionType.SetFees, 0);
  data.writeBigUInt64LE(sendFee, 1);
  data.writeBigUInt64LE(delegationFee, 9);
  return data;
}

function encodeDelegateTo(delegate: Optional<PublicKey>): Buffer {
  const data = Buffer.alloc(1 + 1 + (delegate ? 32 : 0));
  data.writeUInt8(InstructionType.DelegateTo, 0);
  data.writeUInt8(delegate ? 1 : 0, 1);
  if (delegate) {
    delegate.toBuffer().copy(data, 2);
  }
  return data;
}

function encodeRejectDelegation(delegatingAddress: PublicKey): Buffer {
  const data = Buffer.alloc(1 + 32);
  data.writeUInt8(InstructionType.RejectDelegation, 0);
  delegatingAddress.toBuffer().copy(data, 1);
  return data;
}

function encodeSetCustomFeePercentage(account: PublicKey, percentage: number): Buffer {
  if (percentage < 0 || percentage > 100) {
    throw new Error('Percentage must be between 0 and 100');
  }
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

function encodeClaimExpiredShares(recipient: PublicKey): Buffer {
  const data = Buffer.alloc(1 + 32);
  data.writeUInt8(InstructionType.ClaimExpiredShares, 0);
  recipient.toBuffer().copy(data, 1);
  return data;
}

function encodeDistributeClaimableFunds(recipients: PublicKey[]): Buffer {
  const recipientCount = recipients.length;
  const data = Buffer.alloc(1 + 4 + recipientCount * 32);
  let offset = 0;

  data.writeUInt8(InstructionType.DistributeClaimableFunds, offset);
  offset += 1;

  data.writeUInt32LE(recipientCount, offset);
  offset += 4;

  for (const recipient of recipients) {
    recipient.toBuffer().copy(data, offset);
    offset += 32;
  }

  return data;
}

/**
 * Stateless Solana Mailer client.
 * All methods take wallet and chainInfo as parameters.
 * No state is stored in the instance.
 */
export class SolanaMailerClient {
  private defaultComputeUnitMultiplier = 1.2; // 20% buffer by default

  // Default compute unit limits for common operations
  private readonly defaultComputeUnits = {
    send: 200000,
    sendPrepared: 150000,
    sendToEmail: 250000,
    claimRevenue: 100000,
    claimOwnerShare: 100000,
    delegateTo: 80000,
    setFees: 60000,
    pause: 50000,
    unpause: 50000,
    initialize: 100000,
    distributeClaimableFunds: 150000,
  };

  // Priority fee recommendations based on network congestion
  private readonly priorityFeeRecommendations = {
    low: 1000,      // 1,000 microLamports - for low priority transactions
    normal: 10000,  // 10,000 microLamports - for normal priority
    high: 50000,    // 50,000 microLamports - for high priority
    urgent: 100000, // 100,000 microLamports - for urgent transactions
  };

  /**
   * Create or get connection from wallet/chainInfo
   */
  private async getOrCreateConnection(
    chainInfo: ChainInfo,
    connection?: Connection
  ): Promise<Connection> {
    if (connection) {
      return connection;
    }

    // Build RPC URL from ChainInfo
    let rpcUrl: string;
    if (chainInfo.alchemyNetwork) {
      rpcUrl = `https://${chainInfo.alchemyNetwork}.g.alchemy.com/v2/demo`;
    } else if (chainInfo.ankrNetwork) {
      rpcUrl = `https://rpc.ankr.com/${chainInfo.ankrNetwork}`;
    } else {
      // Default Solana endpoints
      rpcUrl = chainInfo.isTestNet
        ? 'https://api.devnet.solana.com'
        : 'https://api.mainnet-beta.solana.com';
    }

    return new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Get program and state PDAs from chainInfo
   */
  private getProgramAddresses(chainInfo: ChainInfo): {
    programId: PublicKey;
    mailerStatePda: PublicKey;
    mailerBump: number;
  } {
    if (!chainInfo.mailerAddress) {
      throw new Error(`No mailer program deployed on ${chainInfo.name}`);
    }

    const programId = new PublicKey(chainInfo.mailerAddress);
    const [mailerPda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from('mailer')],
      programId
    );

    return {
      programId,
      mailerStatePda: mailerPda,
      mailerBump: bump,
    };
  }

  /**
   * Optimize compute units for a transaction
   */
  private async optimizeComputeUnits(
    transaction: Transaction,
    wallet: Wallet,
    connection: Connection,
    options?: ComputeUnitOptions,
    defaultComputeUnits?: number
  ): Promise<{ transaction: Transaction; simulatedUnits?: number }> {
    // Skip if explicitly disabled
    if (options?.skipComputeUnits) {
      return { transaction };
    }

    let simulatedUnits: number | undefined;
    let computeUnitLimit = options?.computeUnitLimit;

    // Auto-optimize by simulating transaction
    if (options?.autoOptimize && !computeUnitLimit) {
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          // Set a high limit for simulation
          const simTransaction = new Transaction().add(...transaction.instructions);
          simTransaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({
              units: 1_400_000, // Max for simulation
            })
          );
          simTransaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          simTransaction.feePayer = wallet.publicKey;

          const simulation = await connection.simulateTransaction(simTransaction);

          if (simulation.value.err === null && simulation.value.unitsConsumed) {
            simulatedUnits = simulation.value.unitsConsumed;
            const multiplier = options.computeUnitMultiplier ?? this.defaultComputeUnitMultiplier;
            computeUnitLimit = Math.min(
              Math.ceil(simulatedUnits * multiplier),
              1_400_000
            );
            break; // Success
          } else if (simulation.value.err) {
            throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
          }
        } catch (error) {
          retryCount++;
          if (retryCount > maxRetries) {
            console.warn(`Failed to auto-optimize compute units after ${maxRetries} retries:`, error);
            // Use default if provided
            if (defaultComputeUnits) {
              computeUnitLimit = defaultComputeUnits;
            }
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }
    }

    // Use default compute units if no limit is set yet
    if (!computeUnitLimit && defaultComputeUnits) {
      computeUnitLimit = defaultComputeUnits;
    }

    // Apply compute budget instructions
    const optimizedTx = new Transaction();

    // Add compute unit limit if specified
    if (computeUnitLimit) {
      optimizedTx.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: computeUnitLimit,
        })
      );
    }

    // Add priority fee if specified (or use recommended normal priority)
    const priorityFee = options?.computeUnitPrice ??
                       (options?.autoOptimize ? this.priorityFeeRecommendations.normal : undefined);
    if (priorityFee) {
      optimizedTx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityFee,
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
   * Send and confirm transaction
   */
  private async sendTransaction(
    transaction: Transaction,
    wallet: Wallet,
    connection: Connection,
    options?: ConfirmOptions,
    computeOptions?: ComputeUnitOptions,
    defaultComputeUnits?: number
  ): Promise<TransactionResult> {
    // Optimize compute units
    const { transaction: optimizedTx, simulatedUnits } = await this.optimizeComputeUnits(
      transaction,
      wallet,
      connection,
      computeOptions,
      defaultComputeUnits
    );

    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    optimizedTx.recentBlockhash = blockhash;
    optimizedTx.feePayer = wallet.publicKey;

    // Sign transaction
    const signed = await wallet.signTransaction(optimizedTx);

    // Send and confirm
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: options?.skipPreflight ?? false,
      preflightCommitment: options?.preflightCommitment ?? 'confirmed',
    });

    await connection.confirmTransaction(signature, options?.commitment ?? 'confirmed');

    return {
      signature,
      transactionHash: signature,
      simulatedUnits,
      computeUnitLimit: computeOptions?.computeUnitLimit,
      computeUnitPrice: computeOptions?.computeUnitPrice,
    };
  }

  /**
   * Initialize the mailer program (owner only)
   */
  async initialize(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);

    const instruction = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: mailerStatePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInitialize(usdcMint),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Send a message with optional revenue sharing
   */
  async send(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    to: string | PublicKey,
    subject: string,
    body: string,
    revenueShareToReceiver: boolean,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);
    const toPubkey = typeof to === 'string' ? new PublicKey(to) : to;

    // Get token accounts
    const senderTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const [recipientInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('recipient_info'), toPubkey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: toPubkey, isSigner: false, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientInfo, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeSend(toPubkey, subject, body, revenueShareToReceiver),
    });

    const transaction = new Transaction().add(instruction);

    // Check if mailer token account exists, create if not
    const accountInfo = await connection.getAccountInfo(mailerTokenAccount);
    if (!accountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          connectedWallet.wallet.publicKey,
          mailerTokenAccount,
          mailerStatePda,
          usdcMint
        )
      );
    }

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Send a prepared message
   */
  async sendPrepared(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    to: string | PublicKey,
    mailId: string,
    revenueShareToReceiver: boolean,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);
    const toPubkey = typeof to === 'string' ? new PublicKey(to) : to;

    const senderTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const [recipientInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('recipient_info'), toPubkey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: toPubkey, isSigner: false, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientInfo, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeSendPrepared(toPubkey, mailId, revenueShareToReceiver),
    });

    const transaction = new Transaction().add(instruction);

    // Check if mailer token account exists, create if not
    const accountInfo = await connection.getAccountInfo(mailerTokenAccount);
    if (!accountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          connectedWallet.wallet.publicKey,
          mailerTokenAccount,
          mailerStatePda,
          usdcMint
        )
      );
    }

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Send through webhook
   */
  async sendThroughWebhook(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    to: string | PublicKey,
    subject: string,
    body: string,
    webhookId: string,
    revenueShareToReceiver: boolean,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);
    const toPubkey = typeof to === 'string' ? new PublicKey(to) : to;

    const senderTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const [recipientInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('recipient_info'), toPubkey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: toPubkey, isSigner: false, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientInfo, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeSendThroughWebhook(toPubkey, subject, body, webhookId, revenueShareToReceiver),
    });

    const transaction = new Transaction().add(instruction);

    const accountInfo = await connection.getAccountInfo(mailerTokenAccount);
    if (!accountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          connectedWallet.wallet.publicKey,
          mailerTokenAccount,
          mailerStatePda,
          usdcMint
        )
      );
    }

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Send to email address
   */
  async sendToEmail(
    emailHash: string,
    subject: string,
    body: string,
    payer: string | PublicKey,
    revenueShareToReceiver: boolean,
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);
    const payerPubkey = typeof payer === 'string' ? new PublicKey(payer) : payer;

    const senderTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeSendToEmail(emailHash, subject, body, payerPubkey, revenueShareToReceiver),
    });

    const transaction = new Transaction().add(instruction);

    const accountInfo = await connection.getAccountInfo(mailerTokenAccount);
    if (!accountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          connectedWallet.wallet.publicKey,
          mailerTokenAccount,
          mailerStatePda,
          usdcMint
        )
      );
    }

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Send prepared to email address
   */
  async sendPreparedToEmail(
    emailHash: string,
    mailId: string,
    payer: string | PublicKey,
    revenueShareToReceiver: boolean,
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);
    const payerPubkey = typeof payer === 'string' ? new PublicKey(payer) : payer;

    const senderTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeSendPreparedToEmail(emailHash, mailId, payerPubkey, revenueShareToReceiver),
    });

    const transaction = new Transaction().add(instruction);

    const accountInfo = await connection.getAccountInfo(mailerTokenAccount);
    if (!accountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          connectedWallet.wallet.publicKey,
          mailerTokenAccount,
          mailerStatePda,
          usdcMint
        )
      );
    }

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Claim recipient share
   */
  async claimRecipientShare(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);

    const recipientTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const [recipientInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('recipient_info'), connectedWallet.wallet.publicKey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientInfo, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from([InstructionType.ClaimRecipientShare]),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Claim owner share (owner only)
   */
  async claimOwnerShare(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);

    const ownerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: ownerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from([InstructionType.ClaimOwnerShare]),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Claim expired shares (owner only)
   */
  async claimExpiredShares(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    recipient: string | PublicKey,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    const recipientPubkey = typeof recipient === 'string' ? new PublicKey(recipient) : recipient;

    const [recipientInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('recipient_info'), recipientPubkey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: recipientInfo, isSigner: false, isWritable: true },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeClaimExpiredShares(recipientPubkey),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Delegate to another address
   */
  async delegateTo(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    delegate: Optional<string | PublicKey>,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);

    const delegatePubkey = delegate
      ? (typeof delegate === 'string' ? new PublicKey(delegate) : delegate)
      : null;

    const senderTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      connectedWallet.wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    const [delegatorInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('delegator_info'), connectedWallet.wallet.publicKey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: delegatorInfo, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeDelegateTo(delegatePubkey),
    });

    const transaction = new Transaction().add(instruction);

    const accountInfo = await connection.getAccountInfo(mailerTokenAccount);
    if (!accountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          connectedWallet.wallet.publicKey,
          mailerTokenAccount,
          mailerStatePda,
          usdcMint
        )
      );
    }

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Reject delegation
   */
  async rejectDelegation(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    delegatingAddress: string | PublicKey,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId } = this.getProgramAddresses(chainInfo);

    const delegatorPubkey = typeof delegatingAddress === 'string' ? new PublicKey(delegatingAddress) : delegatingAddress;

    const [delegatorInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('delegator_info'), delegatorPubkey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: delegatorInfo, isSigner: false, isWritable: true },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeRejectDelegation(delegatorPubkey),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Set fees (owner only)
   */
  async setFees(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    sendFee: number | bigint,
    delegationFee: number | bigint,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeSetFees(BigInt(sendFee), BigInt(delegationFee)),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Set custom fee percentage
   */
  async setCustomFeePercentage(
    account: string | PublicKey,
    percentage: number,
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    const accountPubkey = typeof account === 'string' ? new PublicKey(account) : account;

    const [customFeeInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('custom_fee'), accountPubkey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: mailerStatePda, isSigner: false, isWritable: false },
      { pubkey: customFeeInfo, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeSetCustomFeePercentage(accountPubkey, percentage),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Clear custom fee percentage
   */
  async clearCustomFeePercentage(
    account: string | PublicKey,
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    const accountPubkey = typeof account === 'string' ? new PublicKey(account) : account;

    const [customFeeInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('custom_fee'), accountPubkey.toBuffer()],
      programId
    );

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: false },
      { pubkey: customFeeInfo, isSigner: false, isWritable: true },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeClearCustomFeePercentage(accountPubkey),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Pause the program (owner only)
   */
  async pause(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from([InstructionType.Pause]),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Unpause the program (owner only)
   */
  async unpause(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from([InstructionType.Unpause]),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Emergency unpause (owner only)
   */
  async emergencyUnpause(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
    ];

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from([InstructionType.EmergencyUnpause]),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  /**
   * Distribute claimable funds when paused
   */
  async distributeClaimableFunds(
    connectedWallet: SolanaWallet,
    chainInfo: ChainInfo,
    recipients: (string | PublicKey)[],
    computeOptions?: ComputeUnitOptions
  ): Promise<TransactionResult> {
    const connection = await this.getOrCreateConnection(chainInfo, connectedWallet.connection);
    const { programId, mailerStatePda } = this.getProgramAddresses(chainInfo);

    if (!chainInfo.usdcAddress) {
      throw new Error(`No USDC mint configured for ${chainInfo.name}`);
    }

    const usdcMint = new PublicKey(chainInfo.usdcAddress);

    const recipientPubkeys = recipients.map(r =>
      typeof r === 'string' ? new PublicKey(r) : r
    );

    const mailerTokenAccount = getAssociatedTokenAddressSync(
      usdcMint,
      mailerStatePda,
      true,
      TOKEN_PROGRAM_ID
    );

    // Build keys array
    const keys = [
      { pubkey: connectedWallet.wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: mailerStatePda, isSigner: false, isWritable: true },
      { pubkey: mailerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Add recipient info and token accounts
    for (const recipient of recipientPubkeys) {
      const [recipientInfo] = PublicKey.findProgramAddressSync(
        [Buffer.from('recipient_info'), recipient.toBuffer()],
        programId
      );
      const recipientTokenAccount = getAssociatedTokenAddressSync(
        usdcMint,
        recipient,
        false,
        TOKEN_PROGRAM_ID
      );
      keys.push({ pubkey: recipientInfo, isSigner: false, isWritable: true });
      keys.push({ pubkey: recipientTokenAccount, isSigner: false, isWritable: true });
    }

    const instruction = new TransactionInstruction({
      programId,
      keys,
      data: encodeDistributeClaimableFunds(recipientPubkeys),
    });

    const transaction = new Transaction().add(instruction);

    return await this.sendTransaction(
      transaction,
      connectedWallet.wallet,
      connection,
      undefined,
      computeOptions
    );
  }

  // ============= Read Methods =============

  /**
   * Get fees configuration
   */
  async getFees(chainInfo: ChainInfo, connection?: Connection): Promise<MailerFees> {
    const conn = await this.getOrCreateConnection(chainInfo, connection);
    const { mailerStatePda } = this.getProgramAddresses(chainInfo);

    const accountInfo = await conn.getAccountInfo(mailerStatePda);
    if (!accountInfo || !accountInfo.data) {
      throw new Error('Mailer not initialized');
    }

    // Parse the state data
    const data = accountInfo.data;
    const sendFee = data.readBigUInt64LE(41); // After discriminator(8) + owner(32) + paused(1)
    const delegationFee = data.readBigUInt64LE(49);

    return {
      sendFee,
      delegationFee,
    };
  }

  /**
   * Get send fee only
   */
  async getSendFee(chainInfo: ChainInfo, connection?: Connection): Promise<bigint> {
    const fees = await this.getFees(chainInfo, connection);
    return fees.sendFee;
  }

  /**
   * Get delegation fee only
   */
  async getDelegationFee(chainInfo: ChainInfo, connection?: Connection): Promise<bigint> {
    const fees = await this.getFees(chainInfo, connection);
    return fees.delegationFee;
  }

  /**
   * Get recipient claimable info
   */
  async getRecipientClaimable(
    recipient: string | PublicKey,
    chainInfo: ChainInfo,
    connection?: Connection
  ): Promise<ClaimableInfo | null> {
    const conn = await this.getOrCreateConnection(chainInfo, connection);
    const { programId } = this.getProgramAddresses(chainInfo);

    const recipientPubkey = typeof recipient === 'string' ? new PublicKey(recipient) : recipient;

    const [recipientInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('recipient_info'), recipientPubkey.toBuffer()],
      programId
    );

    const accountInfo = await conn.getAccountInfo(recipientInfo);
    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    // Parse the recipient info data
    const data = accountInfo.data;
    const amount = data.readBigUInt64LE(8); // After discriminator
    const expiresAt = data.readBigInt64LE(16);

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    const isExpired = Number(expiresAt) > 0 && Number(expiresAt) < now;

    return {
      amount: Number(amount),
      timestamp: Number(expiresAt), // Using expiresAt as timestamp
      expiresAt: Number(expiresAt),
      recipient: recipient instanceof PublicKey ? recipient.toBase58() : recipient,
      isExpired,
    };
  }

  /**
   * Get owner claimable amount
   */
  async getOwnerClaimable(chainInfo: ChainInfo, connection?: Connection): Promise<number> {
    const conn = await this.getOrCreateConnection(chainInfo, connection);
    const { mailerStatePda } = this.getProgramAddresses(chainInfo);

    const accountInfo = await conn.getAccountInfo(mailerStatePda);
    if (!accountInfo || !accountInfo.data) {
      throw new Error('Mailer not initialized');
    }

    // Parse the state data
    const data = accountInfo.data;
    const ownerClaimable = data.readBigUInt64LE(57); // After discriminator(8) + owner(32) + paused(1) + sendFee(8) + delegationFee(8)

    return Number(ownerClaimable);
  }

  /**
   * Get delegation for an address
   */
  async getDelegation(
    address: string | PublicKey,
    chainInfo: ChainInfo,
    connection?: Connection
  ): Promise<PublicKey | null> {
    const conn = await this.getOrCreateConnection(chainInfo, connection);
    const { programId } = this.getProgramAddresses(chainInfo);

    const addressPubkey = typeof address === 'string' ? new PublicKey(address) : address;

    const [delegatorInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('delegator_info'), addressPubkey.toBuffer()],
      programId
    );

    const accountInfo = await conn.getAccountInfo(delegatorInfo);
    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    // Parse the delegatingAddress info data
    const data = accountInfo.data;
    const hasDelegate = data.readUInt8(8) === 1; // After discriminator

    if (!hasDelegate) {
      return null;
    }

    // Read delegate pubkey
    const delegateBytes = data.slice(9, 41); // 32 bytes for pubkey
    return new PublicKey(delegateBytes);
  }

  /**
   * Get custom fee percentage for an account
   */
  async getCustomFeePercentage(
    account: string | PublicKey,
    chainInfo: ChainInfo,
    connection?: Connection
  ): Promise<number> {
    const conn = await this.getOrCreateConnection(chainInfo, connection);
    const { programId } = this.getProgramAddresses(chainInfo);

    const accountPubkey = typeof account === 'string' ? new PublicKey(account) : account;

    const [customFeeInfo] = PublicKey.findProgramAddressSync(
      [Buffer.from('custom_fee'), accountPubkey.toBuffer()],
      programId
    );

    const accountInfo = await conn.getAccountInfo(customFeeInfo);
    if (!accountInfo || !accountInfo.data) {
      return 100; // Default to 100% if no custom fee set
    }

    // Parse the custom fee data
    const data = accountInfo.data;
    const percentage = data.readUInt8(8); // After discriminator

    return percentage;
  }

  /**
   * Check if the program is paused
   */
  async isPaused(chainInfo: ChainInfo, connection?: Connection): Promise<boolean> {
    const conn = await this.getOrCreateConnection(chainInfo, connection);
    const { mailerStatePda } = this.getProgramAddresses(chainInfo);

    const accountInfo = await conn.getAccountInfo(mailerStatePda);
    if (!accountInfo || !accountInfo.data) {
      throw new Error('Mailer not initialized');
    }

    // Parse the state data
    const data = accountInfo.data;
    const paused = data.readUInt8(40); // After discriminator(8) + owner(32)

    return paused === 1;
  }

  /**
   * Get the contract owner
   */
  async getOwner(chainInfo: ChainInfo, connection?: Connection): Promise<PublicKey> {
    const conn = await this.getOrCreateConnection(chainInfo, connection);
    const { mailerStatePda } = this.getProgramAddresses(chainInfo);

    const accountInfo = await conn.getAccountInfo(mailerStatePda);
    if (!accountInfo || !accountInfo.data) {
      throw new Error('Mailer not initialized');
    }

    // Parse the state data
    const data = accountInfo.data;
    const ownerBytes = data.slice(8, 40); // After discriminator(8)

    return new PublicKey(ownerBytes);
  }
}
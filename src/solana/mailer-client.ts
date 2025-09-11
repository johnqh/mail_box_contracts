import { 
    Connection, 
    PublicKey, 
    Transaction,
    TransactionInstruction,
    Keypair,
    SystemProgram,
    ConfirmOptions
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID, 
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction
} from '@solana/spl-token';
// Removed borsh import - using manual encoding for native program
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
 * Native Solana Program instruction data structures
 */

// Instruction data encoding functions
function encodeInitialize(usdcMint: PublicKey): Buffer {
    const data = Buffer.alloc(1 + 32);
    data.writeUInt8(InstructionType.Initialize, 0);
    usdcMint.toBuffer().copy(data, 1);
    return data;
}

function encodeSendPriority(to: PublicKey, subject: string, body: string): Buffer {
    const subjectBytes = Buffer.from(subject, 'utf8');
    const bodyBytes = Buffer.from(body, 'utf8');
    const data = Buffer.alloc(1 + 32 + 4 + subjectBytes.length + 4 + bodyBytes.length);
    let offset = 0;
    
    data.writeUInt8(InstructionType.SendPriority, offset);
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
    
    return data;
}

function encodeSend(to: PublicKey, subject: string, body: string): Buffer {
    const subjectBytes = Buffer.from(subject, 'utf8');
    const bodyBytes = Buffer.from(body, 'utf8');
    const data = Buffer.alloc(1 + 32 + 4 + subjectBytes.length + 4 + bodyBytes.length);
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

function encodeDelegateTo(delegate: PublicKey | null): Buffer {
    if (delegate === null) {
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
  delegate: PublicKey | null;
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
    const delegate = hasDelegate ? new PublicKey(data.slice(offset, offset + 32)) : null;
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
    SendPriority = 1,
    Send = 2,
    ClaimRecipientShare = 3,
    ClaimOwnerShare = 4,
    SetFee = 5,
    DelegateTo = 6,
    RejectDelegation = 7,
    SetDelegationFee = 8,
}

/**
 * @class MailerClient
 * @description Native Solana program client for the Mailer program
 * @notice Provides easy-to-use methods for sending messages with USDC fees and revenue sharing
 * 
 * ## Key Features:
 * - **Priority Messages**: Full fee (0.1 USDC) with 90% revenue share back to sender
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
 * // Send priority message (with revenue sharing)
 * await client.sendPriority('recipient-address', 'Subject', 'Message body');
 * 
 * // Claim your revenue share within 60 days
 * await client.claimRecipientShare();
 * 
 * // Check claimable amount
 * const info = await client.getRecipientClaimable();
 * if (info) console.log(`Claimable: ${formatUSDC(info.amount)} USDC`);
 * ```
 * 
 * @author MailBox Team
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
     * Send a priority message with revenue sharing
     * @param to Recipient's public key or address string
     * @param subject Message subject
     * @param body Message body
     * @returns Transaction signature
     */
    async sendPriority(to: string | PublicKey, subject: string, body: string): Promise<string> {
        const recipientKey = typeof to === 'string' ? new PublicKey(to) : to;
        return await this.sendMessage(recipientKey, subject, body, true);
    }

    /**
     * Send a standard message with 10% fee
     * @param to Recipient's public key or address string
     * @param subject Message subject
     * @param body Message body
     * @returns Transaction signature
     */
    async send(to: string | PublicKey, subject: string, body: string): Promise<string> {
        const recipientKey = typeof to === 'string' ? new PublicKey(to) : to;
        return await this.sendMessage(recipientKey, subject, body, false);
    }

    /**
     * Private method to handle both priority and standard message sending
     */
    private async sendMessage(to: PublicKey, subject: string, body: string, isPriority: boolean): Promise<string> {
        // Derive recipient claim PDA
        const [recipientClaimPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('claim'), to.toBuffer()],
            this.programId
        );

        // Get associated token accounts
        const senderTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.wallet.publicKey);
        const mailerTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.mailerStatePda, true);

        // Check if accounts need to be created
        const instructions: TransactionInstruction[] = [];
        
        // Check if mailer token account exists
        const mailerTokenInfo = await this.connection.getAccountInfo(mailerTokenAccount);
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
            data: isPriority ? encodeSendPriority(to, subject, body) : encodeSend(to, subject, body),
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

        const recipientTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.wallet.publicKey);
        const mailerTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.mailerStatePda, true);

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
        const ownerTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.wallet.publicKey);
        const mailerTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.mailerStatePda, true);

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
    async delegateTo(delegate: string | PublicKey | null): Promise<string> {
        const delegateKey = delegate ? (typeof delegate === 'string' ? new PublicKey(delegate) : delegate) : null;
        
        const [delegationPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('delegation'), this.wallet.publicKey.toBuffer()],
            this.programId
        );

        const delegatorTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.wallet.publicKey);
        const mailerTokenAccount = getAssociatedTokenAddressSync(this.usdcMint, this.mailerStatePda, true);

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
        const delegatorKey = typeof delegator === 'string' ? new PublicKey(delegator) : delegator;
        
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
            data: encodeSetDelegationFee(typeof newFee === 'bigint' ? newFee : BigInt(newFee)),
        });

        const transaction = new Transaction().add(instruction);
        return await this.sendTransaction(transaction);
    }

    /**
     * Get current fees from the mailer state
     * @returns MailerFees object with current fees
     */
    async getFees(): Promise<MailerFees> {
        const accountInfo = await this.connection.getAccountInfo(this.mailerStatePda);
        if (!accountInfo) {
            throw new Error('Mailer state account not found - program not initialized');
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
    async getRecipientClaimable(recipient?: PublicKey): Promise<ClaimableInfo | null> {
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
        const isExpired = now > (Number(claimData.timestamp) + (60 * 24 * 60 * 60));

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
        const accountInfo = await this.connection.getAccountInfo(this.mailerStatePda);
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
    async getDelegation(delegator?: PublicKey): Promise<{ delegator: string; delegate: string | null } | null> {
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
            delegate: delegationData.delegate ? delegationData.delegate.toBase58() : null,
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
     * Send and confirm a transaction
     * @param transaction Transaction to send
     * @param options Confirm options
     * @returns Transaction signature
     */
    private async sendTransaction(transaction: Transaction, options?: ConfirmOptions): Promise<string> {
        // Get recent blockhash
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = this.wallet.publicKey;

        // Sign transaction
        const signedTx = await this.wallet.signTransaction(transaction);

        // Send and confirm
        const signature = await this.connection.sendRawTransaction(signedTx.serialize());
        await this.connection.confirmTransaction(signature, options?.commitment || 'confirmed');

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
            async signAllTransactions<T extends Transaction>(transactions: T[]): Promise<T[]> {
                return transactions.map(tx => {
                    tx.partialSign(keypair);
                    return tx;
                });
            },
        };
    }
}

// Wallet interface is exported above
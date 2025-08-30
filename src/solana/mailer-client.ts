import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { 
    Connection, 
    PublicKey, 
    SystemProgram
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';
import { Mailer } from '../../target/types/mailer';
import { ClaimableInfo, MailerFees, formatUSDC, CLAIM_PERIOD_DAYS } from './types';

/**
 * @class MailerClient
 * @description High-level TypeScript client for the Mailer program on Solana
 * @notice Provides easy-to-use methods for sending messages with USDC fees and revenue sharing
 * 
 * ## Key Features:
 * - **Priority Messages**: Full fee (0.1 USDC) with 90% revenue share back to sender
 * - **Standard Messages**: 10% fee only (0.01 USDC) with no revenue share
 * - **Revenue Claims**: 60-day claim period for priority message revenue shares
 * - **Self-messaging**: All messages are sent to the sender's own address
 * 
 * ## Usage Examples:
 * ```typescript
 * // Connect to existing deployed program
 * const connection = new Connection('https://api.devnet.solana.com');
 * const wallet = new Wallet(keypair);
 * const client = new MailerClient(connection, wallet, programId, usdcMint);
 * 
 * // Send priority message (with revenue sharing)
 * await client.sendPriority('Subject', 'Message body');
 * 
 * // Claim your revenue share within 60 days
 * await client.claimRecipientShare();
 * 
 * // Check claimable amount
 * const info = await client.getRecipientClaimable(wallet.publicKey);
 * if (info) console.log(`Claimable: ${formatUSDC(info.amount)} USDC`);
 * ```
 * 
 * @author MailBox Team
 * @version 1.0.0
 */
export class MailerClient {
    private program: Program<Mailer>;
    private provider: AnchorProvider;
    private mailerPda: PublicKey;
    private usdcMint: PublicKey;

    /**
     * @description Creates a new MailerClient instance for interacting with a deployed Mailer program
     * @param connection Solana RPC connection for blockchain interactions
     * @param wallet Anchor wallet containing keypair for signing transactions
     * @param programId Public key of the deployed Mailer program
     * @param usdcMint Public key of the USDC token mint (6 decimal places)
     * @example
     * ```typescript
     * const connection = new Connection('https://api.devnet.solana.com');
     * const wallet = new Wallet(Keypair.generate());
     * const programId = new PublicKey('9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF');
     * const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
     * const client = new MailerClient(connection, wallet, programId, usdcMint);
     * ```
     */
    constructor(
        connection: Connection,
        wallet: anchor.Wallet,
        programId: PublicKey,
        usdcMint: PublicKey
    ) {
        this.provider = new AnchorProvider(connection, wallet, {});
        this.program = new Program(
            require('../../target/idl/mailer.json') as any,
            this.provider
        ) as Program<Mailer>;
        this.usdcMint = usdcMint;
        
        // Derive PDA
        const [mailerPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('mailer')],
            this.program.programId
        );
        this.mailerPda = mailerPda;
    }

    /**
     * @description Deploy and initialize a new Mailer program, returning a client instance
     * @param connection Solana RPC connection for blockchain interactions
     * @param wallet Anchor wallet with authority to initialize the program
     * @param programId Public key of the deployed Mailer program
     * @param usdcMint Public key of the USDC token mint
     * @param owner Optional owner address (defaults to wallet.publicKey)
     * @returns Promise resolving to a configured MailerClient instance
     * @throws {Error} If initialization fails or accounts cannot be created
     * @example
     * ```typescript
     * const client = await MailerClient.initialize(
     *     connection,
     *     wallet,
     *     programId,
     *     usdcMint,
     *     ownerPublicKey
     * );
     * console.log('Mailer initialized at:', client.getMailerAddress());
     * ```
     */
    static async initialize(
        connection: Connection,
        wallet: anchor.Wallet,
        programId: PublicKey,
        usdcMint: PublicKey,
        owner?: PublicKey
    ): Promise<MailerClient> {
        const client = new MailerClient(connection, wallet, programId, usdcMint);
        await client.initializeProgram(owner || wallet.publicKey);
        return client;
    }

    private async initializeProgram(owner: PublicKey): Promise<void> {
        await (this.program.methods as any)
            .initialize(this.usdcMint)
            .accounts({
                mailer: this.mailerPda,
                owner: owner,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    /**
     * @description Send a priority message with full fee and 90% revenue sharing
     * @notice Sender pays 0.1 USDC, receives 90% back as claimable revenue within 60 days
     * @param subject Message subject line (plain text)
     * @param body Message content (plain text)
     * @returns Promise resolving to transaction signature
     * @throws {Error} If insufficient USDC balance or transaction fails
     * @example
     * ```typescript
     * // Requires 0.1 USDC in wallet's associated token account
     * const tx = await client.sendPriority(
     *     'Important Message',
     *     'This is a priority message with revenue sharing'
     * );
     * console.log('Message sent:', tx);
     * 
     * // After sending, 0.09 USDC becomes claimable for 60 days
     * const claimable = await client.getRecipientClaimable(wallet.publicKey);
     * ```
     */
    async sendPriority(subject: string, body: string): Promise<string> {
        const sender = this.provider.wallet.publicKey;
        const [recipientClaimPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('claim'), sender.toBuffer()],
            this.program.programId
        );

        const senderUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            sender
        );

        const mailerUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailerPda,
            true
        );

        return await (this.program.methods as any)
            .sendPriority(subject, body)
            .accounts({
                recipientClaim: recipientClaimPda,
                mailer: this.mailerPda,
                sender: sender,
                senderUsdcAccount,
                mailerUsdcAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    /**
     * @description Send a priority message using a pre-prepared mail identifier
     * @notice Sender pays 0.1 USDC, receives 90% back as claimable revenue within 60 days
     * @param mailId Pre-prepared message identifier (e.g., IPFS hash or UUID)
     * @returns Promise resolving to transaction signature
     * @throws {Error} If insufficient USDC balance or transaction fails
     * @example
     * ```typescript
     * // For messages stored off-chain (IPFS, database, etc.)
     * const mailId = 'QmX7Y8Z9...'; // IPFS hash
     * const tx = await client.sendPriorityPrepared(mailId);
     * console.log('Prepared message sent:', tx);
     * ```
     */
    async sendPriorityPrepared(mailId: string): Promise<string> {
        const sender = this.provider.wallet.publicKey;
        const [recipientClaimPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('claim'), sender.toBuffer()],
            this.program.programId
        );

        const senderUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            sender
        );

        const mailerUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailerPda,
            true
        );

        return await (this.program.methods as any)
            .sendPriorityPrepared(mailId)
            .accounts({
                recipientClaim: recipientClaimPda,
                mailer: this.mailerPda,
                sender: sender,
                senderUsdcAccount,
                mailerUsdcAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    /**
     * @description Send a standard message with 10% fee only (no revenue sharing)
     * @notice Sender pays 0.01 USDC with no revenue share returned
     * @param subject Message subject line (plain text)
     * @param body Message content (plain text)
     * @returns Promise resolving to transaction signature
     * @throws {Error} If insufficient USDC balance or transaction fails
     * @example
     * ```typescript
     * // Requires only 0.01 USDC in wallet's associated token account
     * const tx = await client.send(
     *     'Regular Message',
     *     'This is a standard message without revenue sharing'
     * );
     * console.log('Standard message sent:', tx);
     * ```
     */
    async send(subject: string, body: string): Promise<string> {
        const sender = this.provider.wallet.publicKey;
        const [recipientClaimPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('claim'), sender.toBuffer()],
            this.program.programId
        );

        const senderUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            sender
        );

        const mailerUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailerPda,
            true
        );

        return await (this.program.methods as any)
            .send(subject, body)
            .accounts({
                recipientClaim: recipientClaimPda,
                mailer: this.mailerPda,
                sender: sender,
                senderUsdcAccount,
                mailerUsdcAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    /**
     * @description Send a standard message using a pre-prepared mail identifier
     * @notice Sender pays 0.01 USDC with no revenue share returned
     * @param mailId Pre-prepared message identifier (e.g., IPFS hash or UUID)
     * @returns Promise resolving to transaction signature
     * @throws {Error} If insufficient USDC balance or transaction fails
     * @example
     * ```typescript
     * // For cost-effective messaging with external content
     * const mailId = 'message-uuid-123';
     * const tx = await client.sendPrepared(mailId);
     * console.log('Standard prepared message sent:', tx);
     * ```
     */
    async sendPrepared(mailId: string): Promise<string> {
        const sender = this.provider.wallet.publicKey;
        const [recipientClaimPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('claim'), sender.toBuffer()],
            this.program.programId
        );

        const senderUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            sender
        );

        const mailerUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailerPda,
            true
        );

        return await (this.program.methods as any)
            .sendPrepared(mailId)
            .accounts({
                recipientClaim: recipientClaimPda,
                mailer: this.mailerPda,
                sender: sender,
                senderUsdcAccount,
                mailerUsdcAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    /**
     * @description Claim your accumulated revenue share from priority messages
     * @notice Must be called within 60 days of earning shares, or they expire
     * @returns Promise resolving to transaction signature
     * @throws {Error} If no claimable amount, claim period expired, or transfer fails
     * @example
     * ```typescript
     * // Check claimable amount first
     * const info = await client.getRecipientClaimable(wallet.publicKey);
     * if (info && info.amount > 0 && !info.isExpired) {
     *     const tx = await client.claimRecipientShare();
     *     console.log(`Claimed ${formatUSDC(info.amount)} USDC:`, tx);
     * }
     * ```
     */
    async claimRecipientShare(): Promise<string> {
        const recipient = this.provider.wallet.publicKey;
        const [recipientClaimPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('claim'), recipient.toBuffer()],
            this.program.programId
        );

        const recipientUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            recipient
        );

        const mailerUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailerPda,
            true
        );

        return await (this.program.methods as any)
            .claimRecipientShare()
            .accounts({
                recipientClaim: recipientClaimPda,
                mailer: this.mailerPda,
                recipient: recipient,
                recipientUsdcAccount,
                mailerUsdcAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    /**
     * @description Claim accumulated owner fees (owner only)
     * @notice Only the program owner can call this function
     * @returns Promise resolving to transaction signature
     * @throws {Error} If caller is not owner, no claimable amount, or transfer fails
     * @example
     * ```typescript
     * // Only works if wallet is the program owner
     * const ownerFees = await client.getOwnerClaimable();
     * if (ownerFees > 0) {
     *     const tx = await client.claimOwnerShare();
     *     console.log(`Owner claimed ${formatUSDC(ownerFees)} USDC:`, tx);
     * }
     * ```
     */
    async claimOwnerShare(): Promise<string> {
        const owner = this.provider.wallet.publicKey;
        const ownerUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            owner
        );

        const mailerUsdcAccount = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailerPda,
            true
        );

        return await (this.program.methods as any)
            .claimOwnerShare()
            .accounts({
                mailer: this.mailerPda,
                owner: owner,
                ownerUsdcAccount,
                mailerUsdcAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    /**
     * @description Reclaim expired revenue shares to owner account (owner only)
     * @notice Only callable after 60-day claim period has expired
     * @param recipient Address whose expired shares should be reclaimed
     * @returns Promise resolving to transaction signature
     * @throws {Error} If caller is not owner, no expired shares, or period not expired
     * @example
     * ```typescript
     * // Check if user's shares have expired
     * const info = await client.getRecipientClaimable(recipientAddress);
     * if (info && info.amount > 0 && info.isExpired) {
     *     const tx = await client.claimExpiredShares(recipientAddress);
     *     console.log(`Reclaimed ${formatUSDC(info.amount)} USDC:`, tx);
     * }
     * ```
     */
    async claimExpiredShares(recipient: PublicKey): Promise<string> {
        const [recipientClaimPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('claim'), recipient.toBuffer()],
            this.program.programId
        );

        return await (this.program.methods as any)
            .claimExpiredShares()
            .accounts({
                recipientClaim: recipientClaimPda,
                mailer: this.mailerPda,
                owner: this.provider.wallet.publicKey,
            })
            .rpc();
    }

    /**
     * @description Update the base sending fee (owner only)
     * @notice This affects both priority and standard message pricing
     * @param newFee New fee amount in USDC (with 6 decimals)
     * @returns Promise resolving to transaction signature
     * @throws {Error} If caller is not owner or transaction fails
     * @example
     * ```typescript
     * // Set fee to 0.2 USDC (200,000 with 6 decimals)
     * const tx = await client.setFee(200000);
     * console.log('Fee updated:', tx);
     * 
     * // Priority messages now cost 0.2 USDC
     * // Standard messages now cost 0.02 USDC (10% of 0.2)
     * ```
     */
    async setFee(newFee: number): Promise<string> {
        return await (this.program.methods as any)
            .setFee(new BN(newFee))
            .accounts({
                mailer: this.mailerPda,
                owner: this.provider.wallet.publicKey,
            })
            .rpc();
    }

    /**
     * @description Get detailed information about claimable revenue shares
     * @param recipient Address to check claimable information for
     * @returns Promise resolving to ClaimableInfo or null if no claims exist
     * @example
     * ```typescript
     * const info = await client.getRecipientClaimable(userAddress);
     * if (info) {
     *     console.log(`Claimable: ${formatUSDC(info.amount)} USDC`);
     *     console.log(`Expires: ${new Date(info.expiresAt * 1000).toISOString()}`);
     *     console.log(`Is Expired: ${info.isExpired}`);
     * } else {
     *     console.log('No claimable amounts found');
     * }
     * ```
     */
    async getRecipientClaimable(recipient: PublicKey): Promise<ClaimableInfo | null> {
        try {
            const [recipientClaimPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('claim'), recipient.toBuffer()],
                this.program.programId
            );

            const account = await (this.program.account as any).recipientClaim.fetch(recipientClaimPda);
            const amount = account.amount.toNumber();
            const timestamp = account.timestamp.toNumber();
            const claimPeriodSeconds = CLAIM_PERIOD_DAYS * 24 * 60 * 60;
            const expiresAt = timestamp + claimPeriodSeconds;
            const currentTime = Math.floor(Date.now() / 1000);
            
            return {
                amount,
                expiresAt,
                isExpired: amount > 0 && currentTime > expiresAt,
            };
        } catch {
            return null;
        }
    }

    /**
     * @description Get the total USDC amount claimable by the program owner
     * @returns Promise resolving to claimable amount in USDC (with 6 decimals)
     * @example
     * ```typescript
     * const ownerClaimable = await client.getOwnerClaimable();
     * console.log(`Owner can claim: ${formatUSDC(ownerClaimable)} USDC`);
     * ```
     */
    async getOwnerClaimable(): Promise<number> {
        const account = await (this.program.account as any).mailerState.fetch(this.mailerPda);
        return account.ownerClaimable.toNumber();
    }

    /**
     * @description Get current fee structure information
     * @returns Promise resolving to MailerFees with fee details
     * @example
     * ```typescript
     * const fees = await client.getFees();
     * console.log(`Send Fee: ${formatUSDC(fees.sendFee)} USDC`);
     * 
     * // Calculate actual costs
     * const priorityCost = fees.sendFee; // Full fee
     * const standardCost = Math.floor(fees.sendFee * 0.1); // 10% fee
     * ```
     */
    async getFees(): Promise<MailerFees> {
        const account = await (this.program.account as any).mailerState.fetch(this.mailerPda);
        return {
            sendFee: account.sendFee.toNumber(),
        };
    }

    /**
     * @description Get current fees formatted as human-readable strings
     * @returns Promise resolving to formatted fee strings
     * @example
     * ```typescript
     * const formatted = await client.getFeesFormatted();
     * console.log(`Current send fee: ${formatted.sendFee}`);
     * ```
     */
    async getFeesFormatted(): Promise<{ sendFee: string }> {
        const fees = await this.getFees();
        return {
            sendFee: formatUSDC(fees.sendFee) + ' USDC',
        };
    }

    /**
     * @description Get the Program Derived Address (PDA) of the Mailer account
     * @returns The deterministically derived address of the Mailer program account
     * @example
     * ```typescript
     * const mailerAddress = client.getMailerAddress();
     * console.log('Mailer PDA:', mailerAddress.toString());
     * 
     * // This address stores the program state and USDC balance
     * const usdcAccount = getAssociatedTokenAddressSync(usdcMint, mailerAddress, true);
     * ```
     */
    getMailerAddress(): PublicKey {
        return this.mailerPda;
    }

    /**
     * @description Get the USDC token mint address used by this client
     * @returns The USDC mint public key
     * @example
     * ```typescript
     * const usdcMint = client.getUsdcMint();
     * console.log('USDC Mint:', usdcMint.toString());
     * ```
     */
    getUsdcMint(): PublicKey {
        return this.usdcMint;
    }

    /**
     * @description Get the Mailer program ID
     * @returns The Mailer program's public key
     * @example
     * ```typescript
     * const programId = client.getProgramId();
     * console.log('Mailer Program ID:', programId.toString());
     * ```
     */
    getProgramId(): PublicKey {
        return this.program.programId;
    }

    /**
     * @description Helper method to calculate fee splits for priority vs standard messages
     * @param sendFee The base sending fee amount
     * @param isPriority Whether this is a priority message with revenue sharing
     * @returns Object with recipientAmount and ownerAmount breakdown
     * @example
     * ```typescript
     * const fees = await client.getFees();
     * 
     * // Priority message: sender gets 90% back as claimable
     * const priority = client.calculateFees(fees.sendFee, true);
     * console.log(`Priority: ${formatUSDC(priority.recipientAmount)} claimable, ${formatUSDC(priority.ownerAmount)} to owner`);
     * 
     * // Standard message: only 10% fee to owner
     * const standard = client.calculateFees(fees.sendFee, false);
     * console.log(`Standard: ${formatUSDC(standard.ownerAmount)} to owner`);
     * ```
     */
    calculateFees(sendFee: number, isPriority: boolean): { recipientAmount: number; ownerAmount: number } {
        if (isPriority) {
            const ownerAmount = Math.floor((sendFee * 10) / 100);
            const recipientAmount = sendFee - ownerAmount;
            return { recipientAmount, ownerAmount };
        } else {
            const ownerAmount = Math.floor((sendFee * 10) / 100);
            return { recipientAmount: 0, ownerAmount };
        }
    }
}
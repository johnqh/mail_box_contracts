import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { 
    Connection, 
    PublicKey, 
    SystemProgram, 
    Transaction,
    TransactionInstruction
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync
} from '@solana/spl-token';
import { MailService } from '../../target/types/mail_service';
import { DelegationInfo, MailServiceFees, formatUSDC } from './types';

/**
 * @class MailServiceClient
 * @description High-level TypeScript client for the MailService program on Solana
 * @notice Provides easy-to-use methods for delegation management with USDC fees
 * 
 * ## Key Features:
 * - **Delegation Management**: Delegate mail handling to other addresses for 10 USDC
 * - **Delegation Rejection**: Allow delegates to reject unwanted delegations
 * - **Fee Management**: Owner can update delegation fees
 * - **Fee Withdrawal**: Owner can withdraw collected fees
 * 
 * ## Usage Examples:
 * ```typescript
 * // Connect to existing deployed program
 * const connection = new Connection('https://api.devnet.solana.com');
 * const wallet = new Wallet(keypair);
 * const client = new MailServiceClient(connection, wallet, programId, usdcMint);
 * 
 * // Set up delegation
 * await client.delegateTo(delegatePublicKey);
 * 
 * // Check delegation status
 * const delegate = await client.getDelegation(wallet.publicKey);
 * 
 * // Reject delegation (if you're the delegate)
 * await client.rejectDelegation(delegatorPublicKey);
 * ```
 * 
 * @author MailBox Team
 * @version 1.0.0
 */
export class MailServiceClient {
    private program: Program<MailService>;
    private provider: AnchorProvider;
    private mailServicePda: PublicKey;
    private usdcMint: PublicKey;

    /**
     * @description Creates a new MailServiceClient instance for interacting with a deployed MailService program
     * @param connection Solana RPC connection for blockchain interactions
     * @param wallet Anchor wallet containing keypair for signing transactions
     * @param programId Public key of the deployed MailService program
     * @param usdcMint Public key of the USDC token mint (6 decimal places)
     * @example
     * ```typescript
     * const connection = new Connection('https://api.devnet.solana.com');
     * const wallet = new Wallet(Keypair.generate());
     * const programId = new PublicKey('8EKjCLZjz6LKRxZcQ6LwwF5V8P3TCEgM2CdQg4pZxXHE');
     * const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
     * const client = new MailServiceClient(connection, wallet, programId, usdcMint);
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
            require('../../target/idl/mail_service.json') as any,
            this.provider
        ) as Program<MailService>;
        this.usdcMint = usdcMint;
        
        // Derive PDA
        const [mailServicePda] = PublicKey.findProgramAddressSync(
            [Buffer.from('mail_service')],
            this.program.programId
        );
        this.mailServicePda = mailServicePda;
    }

    /**
     * @description Deploy and initialize a new MailService program, returning a client instance
     * @param connection Solana RPC connection for blockchain interactions
     * @param wallet Anchor wallet with authority to initialize the program
     * @param programId Public key of the deployed MailService program
     * @param usdcMint Public key of the USDC token mint
     * @param owner Optional owner address (defaults to wallet.publicKey)
     * @returns Promise resolving to a configured MailServiceClient instance
     * @throws {Error} If initialization fails or accounts cannot be created
     * @example
     * ```typescript
     * // Deploy new MailService program
     * const client = await MailServiceClient.initialize(
     *   connection,
     *   wallet,
     *   programId,
     *   usdcMint
     * );
     * console.log('MailService initialized at:', client.getProgramId().toString());
     * ```
     */
    static async initialize(
        connection: Connection,
        wallet: anchor.Wallet,
        programId: PublicKey,
        usdcMint: PublicKey,
        owner?: PublicKey
    ): Promise<MailServiceClient> {
        const client = new MailServiceClient(connection, wallet, programId, usdcMint);
        
        const ownerKey = owner || wallet.publicKey;
        
        try {
            const tx = await (client.program.methods as any)
                .initialize(usdcMint)
                .accounts({
                    mailService: client.mailServicePda,
                    owner: ownerKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
                
            console.log('MailService initialized with transaction:', tx);
            return client;
        } catch (error) {
            throw new Error(`Failed to initialize MailService: ${error}`);
        }
    }

    /**
     * @description Delegate mail handling to another address with USDC fee payment
     * @param delegate Public key of the address to delegate to (null to clear delegation)
     * @returns Promise resolving to the transaction signature
     * @throws {Error} If delegation setup fails or insufficient USDC balance
     * @example
     * ```typescript
     * // Delegate to another address (costs 10 USDC)
     * const delegateKey = new PublicKey('...');
     * const txSig = await client.delegateTo(delegateKey);
     * console.log('Delegation set, transaction:', txSig);
     * 
     * // Clear delegation (no fee)
     * await client.delegateTo(null);
     * ```
     */
    async delegateTo(delegate: PublicKey | null): Promise<string> {
        const delegator = this.provider.wallet.publicKey;
        
        // Derive delegation PDA
        const [delegationPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('delegation'), delegator.toBuffer()],
            this.program.programId
        );

        // Get associated token accounts
        const delegatorUsdc = getAssociatedTokenAddressSync(
            this.usdcMint,
            delegator
        );
        const serviceUsdc = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailServicePda,
            true // allowOwnerOffCurve
        );

        return await (this.program.methods as any)
            .delegateTo(delegate)
            .accounts({
                delegation: delegationPda,
                mailService: this.mailServicePda,
                delegator,
                delegatorUsdcAccount: delegatorUsdc,
                serviceUsdcAccount: serviceUsdc,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
    }

    /**
     * @description Reject a delegation that was made to your address
     * @param delegatorAddress Public key of the account that delegated to you
     * @returns Promise resolving to the transaction signature
     * @throws {Error} If you're not the current delegate or no delegation exists
     * @example
     * ```typescript
     * // Reject a delegation made to you
     * const delegatorKey = new PublicKey('...');
     * const txSig = await client.rejectDelegation(delegatorKey);
     * console.log('Delegation rejected, transaction:', txSig);
     * ```
     */
    async rejectDelegation(delegatorAddress: PublicKey): Promise<string> {
        const rejector = this.provider.wallet.publicKey;
        
        // Derive delegation PDA for the delegator
        const [delegationPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('delegation'), delegatorAddress.toBuffer()],
            this.program.programId
        );

        return await (this.program.methods as any)
            .rejectDelegation()
            .accounts({
                delegation: delegationPda,
                delegator: delegatorAddress,
                rejector,
            })
            .rpc();
    }

    /**
     * @description Update the delegation fee (owner only)
     * @param newFeeUsdc New fee amount in USDC (will be converted to 6-decimal format)
     * @returns Promise resolving to the transaction signature
     * @throws {Error} If caller is not the owner or fee update fails
     * @example
     * ```typescript
     * // Set delegation fee to 15 USDC
     * await client.setDelegationFee(15);
     * ```
     */
    async setDelegationFee(newFeeUsdc: number): Promise<string> {
        const owner = this.provider.wallet.publicKey;
        const newFeeAmount = new BN(newFeeUsdc * 1_000_000); // Convert to 6 decimals

        return await (this.program.methods as any)
            .setDelegationFee(newFeeAmount)
            .accounts({
                mailService: this.mailServicePda,
                owner,
            })
            .rpc();
    }

    /**
     * @description Withdraw collected fees from the service to owner's account (owner only)
     * @param amountUsdc Amount to withdraw in USDC
     * @returns Promise resolving to the transaction signature
     * @throws {Error} If caller is not the owner or insufficient balance
     * @example
     * ```typescript
     * // Withdraw 50 USDC in fees
     * await client.withdrawFees(50);
     * ```
     */
    async withdrawFees(amountUsdc: number): Promise<string> {
        const owner = this.provider.wallet.publicKey;
        const amount = new BN(amountUsdc * 1_000_000); // Convert to 6 decimals

        // Get associated token accounts
        const serviceUsdc = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailServicePda,
            true // allowOwnerOffCurve
        );
        const ownerUsdc = getAssociatedTokenAddressSync(
            this.usdcMint,
            owner
        );

        return await (this.program.methods as any)
            .withdrawFees(amount)
            .accounts({
                mailService: this.mailServicePda,
                owner,
                serviceUsdcAccount: serviceUsdc,
                ownerUsdcAccount: ownerUsdc,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    /**
     * @description Get current delegation for a delegator address
     * @param delegatorAddress Address to check delegation for
     * @returns Promise resolving to DelegationInfo or null if no delegation exists
     * @example
     * ```typescript
     * // Check your own delegation
     * const delegation = await client.getDelegation(wallet.publicKey);
     * if (delegation) {
     *   console.log('Delegated to:', delegation.delegate?.toString());
     * }
     * ```
     */
    async getDelegation(delegatorAddress: PublicKey): Promise<DelegationInfo | null> {
        try {
            const [delegationPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('delegation'), delegatorAddress.toBuffer()],
                this.program.programId
            );

            const delegationAccount = await (this.program.account as any).delegation.fetch(delegationPda);
            
            return {
                delegator: delegationAccount.delegator,
                delegate: delegationAccount.delegate,
                bump: delegationAccount.bump
            };
        } catch (error) {
            // Account doesn't exist
            return null;
        }
    }

    /**
     * @description Get current program fees and configuration
     * @returns Promise resolving to MailServiceFees object with current fee structure
     * @example
     * ```typescript
     * const fees = await client.getFees();
     * console.log('Delegation fee:', formatUSDC(fees.delegationFee), 'USDC');
     * ```
     */
    async getFees(): Promise<MailServiceFees> {
        const serviceAccount = await (this.program.account as any).mailServiceState.fetch(this.mailServicePda);
        
        return {
            delegationFee: serviceAccount.delegationFee.toNumber()
        };
    }

    /**
     * @description Get the program ID for this MailService instance
     * @returns Public key of the program
     */
    getProgramId(): PublicKey {
        return this.program.programId;
    }

    /**
     * @description Get the PDA address for the main MailService state
     * @returns Public key of the MailService PDA
     */
    getServiceAddress(): PublicKey {
        return this.mailServicePda;
    }

    /**
     * @description Get the USDC mint address being used by this service
     * @returns Public key of the USDC token mint
     */
    getUSDCMint(): PublicKey {
        return this.usdcMint;
    }

    /**
     * @description Create a delegation PDA for a given delegator
     * @param delegatorAddress Address of the delegator
     * @returns Tuple of [PDA PublicKey, bump seed]
     */
    getDelegationPDA(delegatorAddress: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from('delegation'), delegatorAddress.toBuffer()],
            this.program.programId
        );
    }

    /**
     * @description Get service token account balance in USDC
     * @returns Promise resolving to the balance in USDC (human readable)
     */
    async getServiceBalance(): Promise<number> {
        const serviceUsdc = getAssociatedTokenAddressSync(
            this.usdcMint,
            this.mailServicePda,
            true // allowOwnerOffCurve
        );

        try {
            const balance = await this.provider.connection.getTokenAccountBalance(serviceUsdc);
            return parseFloat(balance.value.uiAmount?.toString() || '0');
        } catch (error) {
            // Account doesn't exist
            return 0;
        }
    }
}
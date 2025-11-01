// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Mailer
 * @notice Decentralized messaging system with delegation management, USDC fees and revenue sharing
 * @dev Two-tier messaging fee system + delegation management with rejection capability
 * @author Mailer Team
 */

import "./interfaces/IERC20.sol";

contract Mailer {
    /// @notice USDC token contract for fee payments
    IERC20 public immutable usdcToken;
    
    /// @notice Base sending fee (0.1 USDC with 6 decimals)
    uint256 public sendFee = 100000;
    
    /// @notice Contract owner with administrative privileges
    address public immutable owner;
    
    /// @notice Time limit for recipients to claim their revenue share (60 days)
    uint256 public constant CLAIM_PERIOD = 60 days;
    
    /// @notice Percentage of fee that goes to message sender as revenue share
    uint256 public constant RECIPIENT_SHARE = 90; // 90%
    
    /// @notice Percentage of fee that goes to contract owner
    uint256 public constant OWNER_SHARE = 10; // 10%
    
    /// @notice Fee required for delegation operations (10 USDC with 6 decimals)
    uint256 public delegationFee = 10000000;
    
    /// @notice Structure for tracking claimable amounts with timestamp
    /// @param amount USDC amount claimable by recipient
    /// @param timestamp When the claimable amount was last updated
    struct ClaimableAmount {
        uint256 amount;
        uint256 timestamp;
    }
    
    /// @notice Mapping of recipient addresses to their claimable revenue shares
    mapping(address => ClaimableAmount) public recipientClaims;
    
    /// @notice Total USDC amount claimable by contract owner
    uint256 public ownerClaimable;
    
    /// @notice Reentrancy guard status
    uint256 private _status;
    
    /// @notice Contract pause state - when true, all functions are paused and funds are distributed
    bool public paused;

    /// @notice Mapping of addresses to their custom fee discount (0-100)
    /// @dev 0 = no discount (full fee), 100 = full discount (free)
    ///      Internally stores discount instead of percentage for cleaner logic
    mapping(address => uint256) public customFeeDiscount;

    /// @notice Mapping of contract addresses to authorized wallet addresses that can pay fees
    /// @dev Allows smart contracts to send messages while authorized wallets pay the fees
    ///      permissions[contractAddress][walletAddress] = true/false
    ///      Multiple wallets can be authorized per contract for security
    mapping(address => mapping(address => bool)) public permissions;

    event MailSent(
        address indexed from,
        address indexed to,
        string subject,
        string body,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    );

    event PreparedMailSent(
        address indexed from,
        address indexed to,
        string indexed mailId,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    );

    event MailSentToEmail(
        address indexed from,
        string toEmail,
        string subject,
        string body
    );

    event PreparedMailSentToEmail(
        address indexed from,
        string toEmail,
        string indexed mailId
    );

    event WebhookMailSent(
        address indexed from,
        address indexed to,
        string indexed webhookId,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    );

    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event SharesRecorded(address indexed recipient, uint256 recipientAmount, uint256 ownerAmount);
    event RecipientClaimed(address indexed recipient, uint256 amount);
    event OwnerClaimed(uint256 amount);
    event ExpiredSharesClaimed(address indexed recipient, uint256 amount);
    
    /// @notice Emitted when delegation is set or cleared
    /// @param delegator The address setting the delegation
    /// @param delegate The delegate address (address(0) for clearing)
    event DelegationSet(address indexed delegator, address indexed delegate);
    
    /// @notice Emitted when delegation fee is updated
    /// @param oldFee Previous fee amount
    /// @param newFee New fee amount
    event DelegationFeeUpdated(uint256 oldFee, uint256 newFee);
    
    /// @notice Emitted when contract is paused and funds are distributed
    event ContractPaused();
    
    /// @notice Emitted when contract is unpaused
    event ContractUnpaused();
    
    /// @notice Emitted when contract is emergency unpaused without fund distribution
    event EmergencyUnpaused();
    
    /// @notice Emitted when funds are auto-distributed during pause
    /// @param recipient Address receiving funds
    /// @param amount Amount distributed
    event FundsDistributed(address indexed recipient, uint256 amount);

    /// @notice Emitted when custom fee percentage is set for an address
    /// @param account Address that received custom fee percentage
    /// @param percentage Fee percentage (0-100)
    event CustomFeePercentageSet(address indexed account, uint256 percentage);

    /// @notice Emitted when a wallet grants permission for a contract to send messages
    /// @param contractAddress The contract being granted permission
    /// @param wallet The wallet that will pay fees for the contract
    event PermissionGranted(address indexed contractAddress, address indexed wallet);

    /// @notice Emitted when permission is revoked
    /// @param contractAddress The contract having permission revoked
    /// @param wallet The wallet that was paying fees
    event PermissionRevoked(address indexed contractAddress, address indexed wallet);

    error OnlyOwner();
    error NoClaimableAmount();
    error ClaimPeriodNotExpired();
    error FeePaymentRequired();
    error TransferFailed();
    error ReentrancyGuard();
    error InvalidAddress();
    error MathOverflow();
    error ContractIsPaused();
    error ContractNotPaused();
    error InvalidPercentage();
    error UnpermittedPayer();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }
    
    modifier nonReentrant() {
        if (_status == 1) {
            revert ReentrancyGuard();
        }
        _status = 1;
        _;
        _status = 0;
    }
    
    modifier whenNotPaused() {
        if (paused) {
            revert ContractIsPaused();
        }
        _;
    }
    
    constructor(address _usdcToken, address _owner) {
        if (_usdcToken == address(0) || _owner == address(0)) {
            revert InvalidAddress();
        }
        usdcToken = IERC20(_usdcToken);
        owner = _owner;
    }
    
    
    /**
     * @notice Send a message with optional revenue sharing
     * @dev Two modes based on revenueShareToReceiver flag:
     *      - true (Priority): Charges full sendFee (0.1 USDC), receiver gets 90% back as claimable within 60 days of the last reward
     *      - false (Standard): Charges only 10% of sendFee (0.01 USDC), no claimable amount
     * @param to Recipient address who receives the message and potential revenue share
     * @param subject Message subject line
     * @param body Message body content
     * @param payer Address that will pay the USDC fee (must be authorized if msg.sender is a contract)
     * @param revenueShareToReceiver If true, receiver gets 90% revenue share; if false, no revenue share
     * @param resolveSenderToName If true, resolve sender address to name via off-chain service
     *
     * Cost for payer:
     * - Priority (revenueShareToReceiver=true): Payer pays 0.1 USDC, receiver gets 0.09 USDC claimable
     * - Standard (revenueShareToReceiver=false): Payer pays 0.01 USDC only
     *
     * Why use Standard? Lower upfront cost, no revenue tracking needed.
     * Why use Priority? Reward the recipient with claimable revenue share.
     *
     * Requirements:
     * - Contract must not be paused
     * - Payer must have approved this contract to spend required USDC amount
     * - Payer must have sufficient USDC balance
     * - If msg.sender is a contract, payer must be in permissions[msg.sender]
     */
    function send(
        address to,
        string calldata subject,
        string calldata body,
        address payer,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    ) external nonReentrant whenNotPaused {
        _processFee(payer, to, revenueShareToReceiver);
        emit MailSent(msg.sender, to, subject, body, revenueShareToReceiver, resolveSenderToName);
    }
    
    /**
     * @notice Send a message using pre-prepared content (referenced by mailId)
     * @dev Same as send but references off-chain stored content via mailId
     * @param to Recipient address who receives the message and potential revenue share
     * @param mailId Reference ID to pre-prepared message content
     * @param payer Address that will pay the USDC fee (must be authorized if msg.sender is a contract)
     * @param revenueShareToReceiver If true, receiver gets 90% revenue share; if false, no revenue share
     * @param resolveSenderToName If true, resolve sender address to name via off-chain service
     *
     * Use case: For large messages or repeated templates, store content off-chain
     * and reference it here to save gas costs on transaction data.
     */
    function sendPrepared(
        address to,
        string calldata mailId,
        address payer,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    ) external nonReentrant whenNotPaused {
        _processFee(payer, to, revenueShareToReceiver);
        emit PreparedMailSent(msg.sender, to, mailId, revenueShareToReceiver, resolveSenderToName);
    }

    /**
     * @notice Send a message to an email address (no wallet address known)
     * @dev Always charges standard 10% fee (0.01 USDC) since there's no recipient wallet for revenue sharing
     * @param toEmail Email address of the recipient
     * @param subject Message subject line
     * @param body Message body content
     * @param payer Address that will pay the USDC fee (must be authorized if msg.sender is a contract)
     *
     * Use case: Send to users who haven't set up a wallet yet
     * Cost: 0.01 USDC (10% of sendFee), all goes to owner
     *
     * Requirements:
     * - Contract must not be paused
     * - Payer must have approved this contract to spend required USDC amount
     * - Payer must have sufficient USDC balance
     * - If msg.sender is a contract, payer must be in permissions[msg.sender]
     */
    function sendToEmailAddress(
        string calldata toEmail,
        string calldata subject,
        string calldata body,
        address payer
    ) external nonReentrant whenNotPaused {
        _processFee(payer, address(0), false);
        emit MailSentToEmail(msg.sender, toEmail, subject, body);
    }

    /**
     * @notice Send a pre-prepared message to an email address (no wallet address known)
     * @dev Always charges standard 10% fee (0.01 USDC) since there's no recipient wallet for revenue sharing
     * @param toEmail Email address of the recipient
     * @param mailId Reference ID to pre-prepared message content
     * @param payer Address that will pay the USDC fee (must be authorized if msg.sender is a contract)
     *
     * Use case: For large messages or repeated templates, store content off-chain
     * and reference it here to save gas costs on transaction data.
     */
    function sendPreparedToEmailAddress(
        string calldata toEmail,
        string calldata mailId,
        address payer
    ) external nonReentrant whenNotPaused {
        _processFee(payer, address(0), false);
        emit PreparedMailSentToEmail(msg.sender, toEmail, mailId);
    }

    /**
     * @notice Send a message through webhook (referenced by webhookId)
     * @dev Same as sendPrepared but for webhook-triggered messages
     * @param to Recipient address who receives the message and potential revenue share
     * @param webhookId Reference ID to webhook configuration
     * @param payer Address that will pay the USDC fee (must be authorized if msg.sender is a contract)
     * @param revenueShareToReceiver If true, receiver gets 90% revenue share; if false, no revenue share
     * @param resolveSenderToName If true, resolve sender address to name via off-chain service
     *
     * Use case: For webhook-triggered automated messages where content is generated dynamically
     * based on webhook configuration.
     */
    function sendThroughWebhook(
        address to,
        string calldata webhookId,
        address payer,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    ) external nonReentrant whenNotPaused {
        _processFee(payer, to, revenueShareToReceiver);
        emit WebhookMailSent(msg.sender, to, webhookId, revenueShareToReceiver, resolveSenderToName);
    }

    function setFee(uint256 usdcAmount) external onlyOwner whenNotPaused {
        uint256 oldFee = sendFee;
        sendFee = usdcAmount;
        emit FeeUpdated(oldFee, usdcAmount);
    }
    
    function getFee() external view returns (uint256) {
        return sendFee;
    }
    
    /**
     * @notice Internal function to record revenue shares for priority messages
     * @dev Splits totalAmount into 90% for recipient (message receiver) and 10% for owner
     * @param recipient Address that will be able to claim the 90% share (the message recipient)
     * @param totalAmount Total fee amount to split (typically sendFee = 0.1 USDC)
     *
     * Split logic:
     * - Owner gets exactly 10% (calculated first for precision)
     * - Recipient gets remainder (totalAmount - ownerAmount) to handle any rounding
     *
     * Timestamp behavior:
     * - Every call updates timestamp to current block time, extending the 60-day claim window
     */
    function _recordShares(address recipient, uint256 totalAmount) internal {
        // Ensure safe math operations (protect against overflow in multiplication)
        if (totalAmount > type(uint256).max / RECIPIENT_SHARE) {
            revert MathOverflow();
        }

        // Calculate owner amount first to ensure precision
        uint256 ownerAmount = (totalAmount * OWNER_SHARE) / 100;
        uint256 recipientAmount = totalAmount - ownerAmount;

        // Update recipient's claimable amount and refresh timestamp to extend the claim window
        recipientClaims[recipient].amount += recipientAmount;
        recipientClaims[recipient].timestamp = block.timestamp;

        // Update owner's claimable amount
        ownerClaimable += ownerAmount;

        emit SharesRecorded(recipient, recipientAmount, ownerAmount);
    }

    /**
     * @notice Process fee payment for any send operation
     * @dev Unified fee processing with revenue sharing support
     *      Gas optimized with unchecked math and early return for zero fees
     * @param recipient Address to receive revenue share (use address(0) for email sends with no revenue share)
     * @param revenueShareToReceiver If true, splits fee 90/10; if false, charges 10% owner fee only
     *
     * Fee logic:
     * - Priority mode (revenueShareToReceiver=true):
     *   - Charges full fee
     *   - If recipient != address(0): 90% to recipient, 10% to owner
     *   - If recipient == address(0): 100% to owner (email case)
     * - Standard mode (revenueShareToReceiver=false):
     *   - Charges 10% fee only, all to owner
     *
     * Gas optimizations:
     * - Ternary operator for conditional assignment (cheaper than if/else)
     * - Unchecked math for safe operations (division/multiplication cannot overflow)
     * - Early return on zero fee (avoids unnecessary transfer and storage write)
     */
    /**
     * @notice Internal function to process fees with permission checking
     * @dev Verifies that the payer is authorized to pay for msg.sender (if msg.sender != payer)
     * @param payer Address that will pay the USDC fee
     * @param recipient Address that receives revenue share (or address(0) for email sends)
     * @param revenueShareToReceiver Whether to enable revenue sharing
     */
    function _processFee(address payer, address recipient, bool revenueShareToReceiver) internal {
        // Check permission: if msg.sender is different from payer, payer must have authorized msg.sender
        if (msg.sender != payer && !permissions[msg.sender][payer]) {
            revert UnpermittedPayer();
        }

        uint256 effectiveFee = _calculateFeeForAddress(payer, sendFee);

        // Early return if no fee (saves gas on zero transfers and storage writes)
        if (effectiveFee == 0) return;

        // Calculate fee to charge
        uint256 feeToCharge;
        unchecked {
            // Safe: division by 100 reduces value, multiplication by 10 then division cannot overflow
            feeToCharge = revenueShareToReceiver ? effectiveFee : (effectiveFee * OWNER_SHARE) / 100;
        }

        // Transfer fee from payer to contract
        if (!usdcToken.transferFrom(payer, address(this), feeToCharge)) {
            revert FeePaymentRequired();
        }

        // Handle revenue sharing or direct owner payment
        if (revenueShareToReceiver && recipient != address(0)) {
            // Split fee between recipient (90%) and owner (10%)
            _recordShares(recipient, effectiveFee);
        } else {
            // All fees go to owner (standard mode or email send)
            ownerClaimable += feeToCharge;
        }
    }

    /**
     * @notice Claim your accumulated revenue share from priority messages received
     * @dev Must be called within 60 days of the most recent reward being recorded
     *
     * Claim period logic:
     * - Clock refreshes on every priority message received (when timestamp is updated)
     * - Multiple priority messages extend the timer, keeping all rewards available as long as one is received every 60 days
     * - After 60 days with no new rewards, funds become permanently unclaimable (owner can recover via claimExpiredShares)
     *
     * Example timeline:
     * Day 0: Receive priority message, get 0.09 USDC claimable, timer starts
     * Day 60: Receive another priority message, now 0.18 USDC claimable, timer refreshes
     * Day 119: Can still claim all 0.18 USDC because the second reward reset the timer
     * Day 121: Too late, funds expired if no new rewards arrived after Day 60
     */
    function claimRecipientShare() external nonReentrant {
        ClaimableAmount storage claim = recipientClaims[msg.sender];
        if (claim.amount == 0) {
            revert NoClaimableAmount();
        }

        // Check if claim period has expired (60 days from the most recent reward)
        if (block.timestamp > claim.timestamp + CLAIM_PERIOD) {
            revert NoClaimableAmount();
        }

        // Store amount and reset claim data
        uint256 amount = claim.amount;
        claim.amount = 0;
        claim.timestamp = 0;

        // Transfer USDC to claimer
        bool success = usdcToken.transfer(msg.sender, amount);
        if (!success) {
            revert TransferFailed();
        }

        emit RecipientClaimed(msg.sender, amount);
    }
    
    function claimOwnerShare() external onlyOwner nonReentrant {
        if (ownerClaimable == 0) {
            revert NoClaimableAmount();
        }
        
        uint256 amount = ownerClaimable;
        ownerClaimable = 0;
        
        bool success = usdcToken.transfer(owner, amount);
        if (!success) {
            revert TransferFailed();
        }
        
        emit OwnerClaimed(amount);
    }
    
    function claimExpiredShares(address recipient) external onlyOwner nonReentrant {
        ClaimableAmount storage claim = recipientClaims[recipient];
        if (claim.amount == 0) {
            revert NoClaimableAmount();
        }
        
        if (block.timestamp <= claim.timestamp + CLAIM_PERIOD) {
            revert ClaimPeriodNotExpired();
        }
        
        uint256 amount = claim.amount;
        claim.amount = 0;
        claim.timestamp = 0;
        
        ownerClaimable += amount;
        
        emit ExpiredSharesClaimed(recipient, amount);
    }
    
    function getRecipientClaimable(address recipient) external view returns (uint256 amount, uint256 expiresAt, bool isExpired) {
        ClaimableAmount storage claim = recipientClaims[recipient];
        amount = claim.amount;
        expiresAt = claim.timestamp + CLAIM_PERIOD;
        isExpired = claim.amount > 0 && block.timestamp > expiresAt;
    }
    
    function getOwnerClaimable() external view returns (uint256) {
        return ownerClaimable;
    }
    
    /// @notice Delegate mail handling to another address
    /// @dev Charges delegation fee in USDC. Emits event for indexer tracking
    /// @param delegate Address to delegate to, or address(0) to clear
    function delegateTo(address delegate) external nonReentrant whenNotPaused {
        // If clearing delegation (setting to address(0)), no fee required
        if (delegate != address(0)) {
            uint256 fee = delegationFee;
            if (!usdcToken.transferFrom(msg.sender, address(this), fee)) {
                revert FeePaymentRequired();
            }
            ownerClaimable += fee;
        }
        emit DelegationSet(msg.sender, delegate);
    }
    
    /// @notice Reject a delegation made to you by another address
    /// @dev Emits event for indexer tracking. No validation - relies on off-chain logic
    /// @param delegatingAddress Address that delegated to msg.sender
    function rejectDelegation(address delegatingAddress) external nonReentrant whenNotPaused {
        emit DelegationSet(delegatingAddress, address(0));
    }
    
    /// @notice Update the delegation fee (owner only)
    /// @param usdcAmount New fee amount in USDC (6 decimals)
    function setDelegationFee(uint256 usdcAmount) external onlyOwner whenNotPaused {
        uint256 oldFee = delegationFee;
        delegationFee = usdcAmount;
        emit DelegationFeeUpdated(oldFee, usdcAmount);
    }
    
    /// @notice Get current delegation fee
    /// @return Current delegation fee in USDC (6 decimals)
    function getDelegationFee() external view returns (uint256) {
        return delegationFee;
    }

    /// @notice Set custom fee percentage for a specific address
    /// @dev Only owner can set. Percentage must be between 0-100 (inclusive)
    ///      0 = free (no fee), 100 = full fee, anything in between reduces the fee proportionally
    ///      Internally stores as discount (100 - percentage) for cleaner logic
    /// @param account Address to set custom fee percentage for
    /// @param percentage Fee percentage (0-100). Set to 0 for free messages, 100 for full fee
    function setCustomFeePercentage(address account, uint256 percentage) external onlyOwner whenNotPaused {
        if (account == address(0)) {
            revert InvalidAddress();
        }
        if (percentage > 100) {
            revert InvalidPercentage();
        }

        // Store as discount: 0% fee = 100 discount, 100% fee = 0 discount
        customFeeDiscount[account] = 100 - percentage;
        emit CustomFeePercentageSet(account, percentage);
    }

    /// @notice Clear custom fee percentage for a specific address
    /// @dev Only owner can clear. After clearing, address will use default fee structure (100%)
    /// @param account Address to clear custom fee percentage for
    function clearCustomFeePercentage(address account) external onlyOwner whenNotPaused {
        if (account == address(0)) {
            revert InvalidAddress();
        }

        // Set discount to 0 (no discount = 100% fee = default behavior)
        customFeeDiscount[account] = 0;
        emit CustomFeePercentageSet(account, 100);
    }

    /// @notice Get custom fee percentage for an address
    /// @param account Address to check
    /// @return percentage Fee percentage (0-100), 100 means default (full fee)
    function getCustomFeePercentage(address account) external view returns (uint256) {
        // Convert discount back to percentage: 0 discount = 100% fee, 100 discount = 0% fee
        return 100 - customFeeDiscount[account];
    }

    /// @notice Calculate the effective fee for an address based on custom discount
    /// @dev Internal helper function. Uses discount calculation: fee = baseFee * (100 - discount) / 100
    ///      Default discount of 0 means full fee (100%)
    /// @param account Address to calculate fee for
    /// @param baseFee Base fee amount to apply discount to
    /// @return Calculated fee amount
    function _calculateFeeForAddress(address account, uint256 baseFee) internal view returns (uint256) {
        // Get discount (0-100): 0 = no discount (full fee), 100 = full discount (free)
        uint256 discount = customFeeDiscount[account];

        // Apply discount: fee = baseFee * (100 - discount) / 100
        // Examples: discount=0 → 100% fee, discount=50 → 50% fee, discount=100 → 0% fee (free)
        return (baseFee * (100 - discount)) / 100;
    }

    /// @notice Pause the contract and distribute all claimable funds to their rightful owners
    /// @dev Only owner can pause. All recipient shares and owner claimable funds are distributed
    function pause() external onlyOwner {
        if (paused) {
            revert ContractIsPaused();
        }
        
        paused = true;
        
        // Distribute owner claimable funds first
        if (ownerClaimable > 0) {
            uint256 ownerAmount = ownerClaimable;
            ownerClaimable = 0;
            
            bool success = usdcToken.transfer(owner, ownerAmount);
            if (success) {
                emit FundsDistributed(owner, ownerAmount);
            } else {
                // If transfer fails, restore the balance
                ownerClaimable = ownerAmount;
            }
        }
        
        emit ContractPaused();
    }
    
    /// @notice Distribute a specific recipient's claimable funds during pause
    /// @dev Can only be called when paused. Anyone can call this function to help distribute funds.
    ///      Funds are always sent to their rightful owner (recipient), so this is safe for public access.
    ///      Distributes funds regardless of expiration to prevent fund loss during emergency.
    /// @param recipient Address to distribute funds for
    function distributeClaimableFunds(address recipient) external {
        if (!paused) {
            revert ContractNotPaused();
        }
        
        ClaimableAmount storage claim = recipientClaims[recipient];
        if (claim.amount == 0) {
            revert NoClaimableAmount();
        }
        
        uint256 amount = claim.amount;
        claim.amount = 0;
        claim.timestamp = 0;
        
        bool success = usdcToken.transfer(recipient, amount);
        if (success) {
            emit FundsDistributed(recipient, amount);
        } else {
            // If transfer fails, restore the balance
            claim.amount = amount;
            claim.timestamp = block.timestamp;
        }
    }
    
    /// @notice Unpause the contract to resume normal operations
    /// @dev Only owner can unpause
    function unpause() external onlyOwner {
        if (!paused) {
            revert ContractNotPaused();
        }
        
        paused = false;
        emit ContractUnpaused();
    }
    
    /// @notice Emergency unpause without fund distribution (owner only)
    /// @dev Use when pause() failed due to transfer issues. Owner can still manually claim funds later
    function emergencyUnpause() external onlyOwner {
        if (!paused) {
            revert ContractNotPaused();
        }

        paused = false;
        emit EmergencyUnpaused();
    }

    /// @notice Grant permission for a contract to send messages using caller's USDC balance
    /// @dev Allows smart contracts to send messages while the wallet pays fees
    ///      If permission already exists, emits PermissionRevoked for the old wallet
    /// @param contractAddress The contract address to grant permission to
    ///
    /// Requirements:
    /// - contractAddress must not be address(0)
    /// - Caller must have approved this Mailer contract to spend their USDC
    ///
    /// Usage:
    /// 1. Wallet calls: usdc.approve(mailer, largeAmount)
    /// 2. Wallet calls: mailer.setPermission(myContract)
    /// 3. Contract can now call: mailer.send(...) and fees are paid by wallet
    /**
     * @notice Grant permission for a contract to send messages using caller's USDC balance
     * @dev Adds caller to the set of authorized payers for the contract
     *      Multiple wallets can be authorized per contract for security and flexibility
     * @param contractAddress The contract address to grant permission to
     *
     * Requirements:
     * - contractAddress must not be address(0)
     * - Contract must not be paused
     * - Caller must have approved Mailer to spend their USDC
     *
     * Events:
     * - PermissionGranted(contractAddress, msg.sender)
     */
    function setPermission(address contractAddress) external whenNotPaused {
        if (contractAddress == address(0)) {
            revert InvalidAddress();
        }

        permissions[contractAddress][msg.sender] = true;
        emit PermissionGranted(contractAddress, msg.sender);
    }

    /**
     * @notice Remove permission for a contract to use caller's USDC balance
     * @dev Removes caller from the set of authorized payers for the contract
     * @param contractAddress The contract address to remove permission from
     *
     * Requirements:
     * - Caller must have previously granted permission
     *
     * Events:
     * - PermissionRevoked(contractAddress, msg.sender)
     */
    function removePermission(address contractAddress) external {
        if (contractAddress == address(0)) {
            revert InvalidAddress();
        }

        permissions[contractAddress][msg.sender] = false;
        emit PermissionRevoked(contractAddress, msg.sender);
    }

    /// @notice Check if contract is currently paused
    /// @return True if contract is paused, false otherwise
    function isPaused() external view returns (bool) {
        return paused;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Mailer
 * @notice Decentralized messaging system with USDC fees and revenue sharing
 * @dev Two-tier fee system: Priority (full fee + 90% share) and Standard (10% fee only)
 * @author MailBox Team
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

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
    
    event MailSent(
        address indexed from,
        address indexed to,
        string subject,
        string body
    );
    
    event PreparedMailSent(
        address indexed from,
        address indexed to,
        string indexed mailId
    );
    
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event SharesRecorded(address indexed recipient, uint256 recipientAmount, uint256 ownerAmount);
    event RecipientClaimed(address indexed recipient, uint256 amount);
    event OwnerClaimed(uint256 amount);
    event ExpiredSharesClaimed(address indexed recipient, uint256 amount);
    
    error OnlyOwner();
    error NoClaimableAmount();
    error ClaimPeriodNotExpired();
    error FeePaymentRequired();
    error TransferFailed();
    error ReentrancyGuard();
    error InvalidAddress();
    error MathOverflow();
    
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
    
    constructor(address _usdcToken, address _owner) {
        if (_usdcToken == address(0) || _owner == address(0)) {
            revert InvalidAddress();
        }
        usdcToken = IERC20(_usdcToken);
        owner = _owner;
    }
    
    
    function sendPriority(
        string calldata subject,
        string calldata body
    ) external nonReentrant {
        if (!usdcToken.transferFrom(msg.sender, address(this), sendFee)) {
            revert FeePaymentRequired();
        }
        _recordShares(msg.sender, sendFee);
        emit MailSent(msg.sender, msg.sender, subject, body);
    }
    
    function sendPriorityPrepared(
        string calldata mailId
    ) external nonReentrant {
        if (!usdcToken.transferFrom(msg.sender, address(this), sendFee)) {
            revert FeePaymentRequired();
        }
        _recordShares(msg.sender, sendFee);
        emit PreparedMailSent(msg.sender, msg.sender, mailId);
    }
    
    function send(
        string calldata subject,
        string calldata body
    ) external nonReentrant {
        uint256 ownerFee = (sendFee * OWNER_SHARE) / 100;
        if (!usdcToken.transferFrom(msg.sender, address(this), ownerFee)) {
            revert FeePaymentRequired();
        }
        ownerClaimable += ownerFee;
        emit MailSent(msg.sender, msg.sender, subject, body);
    }
    
    function sendPrepared(
        string calldata mailId
    ) external nonReentrant {
        uint256 ownerFee = (sendFee * OWNER_SHARE) / 100;
        if (!usdcToken.transferFrom(msg.sender, address(this), ownerFee)) {
            revert FeePaymentRequired();
        }
        ownerClaimable += ownerFee;
        emit PreparedMailSent(msg.sender, msg.sender, mailId);
    }
    
    function setFee(uint256 usdcAmount) external onlyOwner {
        uint256 oldFee = sendFee;
        sendFee = usdcAmount;
        emit FeeUpdated(oldFee, usdcAmount);
    }
    
    function getFee() external view returns (uint256) {
        return sendFee;
    }
    
    function _recordShares(address recipient, uint256 totalAmount) internal {
        // Ensure safe math operations
        if (totalAmount > type(uint256).max / RECIPIENT_SHARE) {
            revert MathOverflow();
        }
        
        // Calculate owner amount first to ensure precision
        uint256 ownerAmount = (totalAmount * OWNER_SHARE) / 100;
        uint256 recipientAmount = totalAmount - ownerAmount;
        
        // Update recipient's claimable amount and set timestamp only if not already set
        recipientClaims[recipient].amount += recipientAmount;
        if (recipientClaims[recipient].timestamp == 0) {
            recipientClaims[recipient].timestamp = block.timestamp;
        }
        
        // Update owner's claimable amount
        ownerClaimable += ownerAmount;
        
        emit SharesRecorded(recipient, recipientAmount, ownerAmount);
    }
    
    function claimRecipientShare() external nonReentrant {
        ClaimableAmount storage claim = recipientClaims[msg.sender];
        if (claim.amount == 0) {
            revert NoClaimableAmount();
        }
        
        // Check if claim period has expired
        if (block.timestamp > claim.timestamp + CLAIM_PERIOD) {
            revert NoClaimableAmount();
        }
        
        uint256 amount = claim.amount;
        claim.amount = 0;
        claim.timestamp = 0;
        
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
}
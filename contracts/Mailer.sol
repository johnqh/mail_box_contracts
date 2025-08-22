// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract Mailer {
    IERC20 public immutable usdcToken;
    uint256 public sendFee = 100000; // 0.1 USDC (6 decimals)
    address public immutable owner;
    
    uint256 public constant CLAIM_PERIOD = 60 days;
    uint256 public constant RECIPIENT_SHARE = 90; // 90%
    uint256 public constant OWNER_SHARE = 10; // 10%
    
    struct ClaimableAmount {
        uint256 amount;
        uint256 timestamp;
    }
    
    mapping(address => ClaimableAmount) public recipientClaims;
    uint256 public ownerClaimable;
    
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
    
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }
    
    constructor(address _usdcToken, address _owner) {
        usdcToken = IERC20(_usdcToken);
        owner = _owner;
    }
    
    
    function sendPriority(
        string calldata subject,
        string calldata body
    ) external {
        bool success = usdcToken.transferFrom(msg.sender, address(this), sendFee);
        if (success) {
            _recordShares(msg.sender, sendFee);
            emit MailSent(msg.sender, msg.sender, subject, body);
        }
    }
    
    function sendPriorityPrepared(
        string calldata mailId
    ) external {
        bool success = usdcToken.transferFrom(msg.sender, address(this), sendFee);
        if (success) {
            _recordShares(msg.sender, sendFee);
            emit PreparedMailSent(msg.sender, msg.sender, mailId);
        }
    }
    
    function send(
        string calldata subject,
        string calldata body
    ) external {
        uint256 ownerFee = (sendFee * OWNER_SHARE) / 100;
        bool success = usdcToken.transferFrom(msg.sender, address(this), ownerFee);
        if (success) {
            ownerClaimable += ownerFee;
            emit MailSent(msg.sender, msg.sender, subject, body);
        }
    }
    
    function sendPrepared(
        string calldata mailId
    ) external {
        uint256 ownerFee = (sendFee * OWNER_SHARE) / 100;
        bool success = usdcToken.transferFrom(msg.sender, address(this), ownerFee);
        if (success) {
            ownerClaimable += ownerFee;
            emit PreparedMailSent(msg.sender, msg.sender, mailId);
        }
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
        uint256 recipientAmount = (totalAmount * RECIPIENT_SHARE) / 100;
        uint256 ownerAmount = totalAmount - recipientAmount;
        
        // Update recipient's claimable amount and reset timestamp
        recipientClaims[recipient].amount += recipientAmount;
        recipientClaims[recipient].timestamp = block.timestamp;
        
        // Update owner's claimable amount
        ownerClaimable += ownerAmount;
        
        emit SharesRecorded(recipient, recipientAmount, ownerAmount);
    }
    
    function claimRecipientShare() external {
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
        require(success, "Transfer failed");
        
        emit RecipientClaimed(msg.sender, amount);
    }
    
    function claimOwnerShare() external onlyOwner {
        if (ownerClaimable == 0) {
            revert NoClaimableAmount();
        }
        
        uint256 amount = ownerClaimable;
        ownerClaimable = 0;
        
        bool success = usdcToken.transfer(owner, amount);
        require(success, "Transfer failed");
        
        emit OwnerClaimed(amount);
    }
    
    function claimExpiredShares(address recipient) external onlyOwner {
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
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PrivilegedMail {
    IERC20 public immutable usdcToken;
    uint256 public sendFee = 100000; // 0.1 USDC (6 decimals)
    address public immutable owner;
    
    event MailSent(
        address indexed from,
        address indexed to,
        string subject,
        string body
    );
    
    event PreparedMailSent(
        address indexed from,
        string indexed mailId
    );
    
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    
    error OnlyOwner();
    
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
    
    
    function send(
        address to,
        string calldata subject,
        string calldata body
    ) external {
        bool success = usdcToken.transferFrom(msg.sender, address(this), sendFee);
        if (success) {
            emit MailSent(msg.sender, to, subject, body);
        }
    }
    
    function sendPrepared(string calldata mailId) external {
        bool success = usdcToken.transferFrom(msg.sender, address(this), sendFee);
        if (success) {
            emit PreparedMailSent(msg.sender, mailId);
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
}
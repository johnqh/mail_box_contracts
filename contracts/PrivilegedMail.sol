// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PrivilegedMail {
    IERC20 public immutable usdcToken;
    uint256 public constant SEND_FEE = 100000; // 0.1 USDC (6 decimals)
    
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
    
    constructor(address _usdcToken) {
        usdcToken = IERC20(_usdcToken);
    }
    
    
    function send(
        address to,
        string calldata subject,
        string calldata body
    ) external {
        bool success = usdcToken.transferFrom(msg.sender, address(this), SEND_FEE);
        if (success) {
            emit MailSent(msg.sender, to, subject, body);
        }
    }
    
    function sendPrepared(string calldata mailId) external {
        bool success = usdcToken.transferFrom(msg.sender, address(this), SEND_FEE);
        if (success) {
            emit PreparedMailSent(msg.sender, mailId);
        }
    }
}
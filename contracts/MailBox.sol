// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract MailBox {
    IERC20 public immutable usdcToken;
    uint256 public constant SEND_FEE = 100000; // 0.1 USDC (6 decimals)
    
    event MailSent(
        address indexed from,
        address indexed to,
        string subject,
        string body
    );
    
    constructor(address _usdcToken) {
        usdcToken = IERC20(_usdcToken);
    }
    
    
    function send(
        address from,
        address to,
        string calldata subject,
        string calldata body
    ) external {
        bool success = usdcToken.transferFrom(from, address(this), SEND_FEE);
        if (success) {
            emit MailSent(from, to, subject, body);
        }
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IMailer.sol";
import "../interfaces/IERC20.sol";

/**
 * @title MailerIntegrationExample
 * @notice Example contract showing how to integrate Mailer messaging into your smart contract
 * @dev Demonstrates various patterns for sending messages through the Mailer contract
 * @author Mailer Team
 */
contract MailerIntegrationExample {
    IMailer public immutable mailer;
    IERC20 public immutable usdcToken;
    address public owner;

    event NotificationSent(address indexed recipient, string message);
    event EmailNotificationSent(string indexed email, string message);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _mailerAddress, address _usdcAddress) {
        require(_mailerAddress != address(0), "Invalid mailer address");
        require(_usdcAddress != address(0), "Invalid USDC address");

        mailer = IMailer(_mailerAddress);
        usdcToken = IERC20(_usdcAddress);
        owner = msg.sender;
    }

    /**
     * @notice Example 1: Send a simple notification to a user
     * @dev Uses standard fee (0.01 USDC) with no revenue sharing
     * @param recipient User's wallet address
     * @param message Notification message
     */
    function sendNotification(address recipient, string calldata message) external {
        // Ensure this contract has USDC approved for Mailer
        // In production, you'd handle approval management

        mailer.send(
            recipient,
            "Notification",
            message,
            msg.sender,          // User pays the fee
            false,               // No revenue sharing (standard fee)
            true                 // Resolve sender to name
        );

        emit NotificationSent(recipient, message);
    }

    /**
     * @notice Example 2: Send a notification with the contract paying the fee
     * @dev Contract holds USDC and pays fees on behalf of users
     * @param recipient User's wallet address
     * @param message Notification message
     */
    function sendNotificationContractPays(address recipient, string calldata message) external {
        // Contract must first authorize itself with the Mailer
        // Call: mailer.setPermission(address(this))

        mailer.send(
            recipient,
            "System Notification",
            message,
            address(this),       // Contract pays the fee
            false,               // No revenue sharing
            false                // Don't resolve (contract sender)
        );

        emit NotificationSent(recipient, message);
    }

    /**
     * @notice Example 3: Send a priority message with revenue sharing
     * @dev Charges full fee (0.1 USDC), recipient can claim 90% back
     * @param recipient User's wallet address
     * @param subject Message subject
     * @param body Message body
     */
    function sendPriorityMessage(
        address recipient,
        string calldata subject,
        string calldata body
    ) external {
        mailer.send(
            recipient,
            subject,
            body,
            msg.sender,          // User pays the fee
            true,                // Enable revenue sharing
            true                 // Resolve sender to name
        );
    }

    /**
     * @notice Example 4: Send to email address (when wallet is unknown)
     * @dev Always uses standard fee, no revenue sharing possible
     * @param email Recipient's email address
     * @param subject Message subject
     * @param body Message body
     */
    function sendEmailNotification(
        string calldata email,
        string calldata subject,
        string calldata body
    ) external {
        mailer.sendToEmailAddress(
            email,
            subject,
            body,
            msg.sender           // User pays the fee
        );

        emit EmailNotificationSent(email, body);
    }

    /**
     * @notice Example 5: Send using pre-prepared content (gas efficient)
     * @dev Store large content off-chain, reference by ID
     * @param recipient User's wallet address
     * @param mailId Reference to pre-prepared content
     */
    function sendPreparedContent(
        address recipient,
        string calldata mailId
    ) external {
        mailer.sendPrepared(
            recipient,
            mailId,
            msg.sender,          // User pays the fee
            false,               // No revenue sharing
            true                 // Resolve sender to name
        );
    }

    /**
     * @notice Example 6: Send through webhook for custom delivery
     * @dev Useful for integration with external notification systems
     * @param recipient User's wallet address
     * @param webhookId Webhook identifier
     */
    function sendViaWebhook(
        address recipient,
        string calldata webhookId
    ) external {
        mailer.sendThroughWebhook(
            recipient,
            webhookId,
            msg.sender,          // User pays the fee
            false,               // No revenue sharing
            true                 // Resolve sender to name
        );
    }

    /**
     * @notice Authorize this contract to pay fees on behalf of users
     * @dev Must be called before using contract-pays patterns
     */
    function authorizeWithMailer() external onlyOwner {
        // This would need to be called on the Mailer contract
        // mailer.setPermission(address(this));
        // Note: This requires the Mailer to expose setPermission publicly
    }

    /**
     * @notice Approve USDC spending for the Mailer contract
     * @dev Required before sending any messages
     * @param amount USDC amount to approve (in 6 decimals)
     */
    function approveUSDCForMailer(uint256 amount) external onlyOwner {
        usdcToken.approve(address(mailer), amount);
    }

    /**
     * @notice Withdraw any USDC held by this contract
     * @dev Emergency function to recover funds
     */
    function withdrawUSDC() external onlyOwner {
        uint256 balance = usdcToken.balanceOf(address(this));
        require(balance > 0, "No USDC to withdraw");
        usdcToken.transfer(owner, balance);
    }
}

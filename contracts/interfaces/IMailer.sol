// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMailer
 * @notice Interface for the Mailer contract messaging functions
 * @dev Use this interface to integrate Mailer messaging into your smart contracts
 * @author Mailer Team
 */
interface IMailer {
    /**
     * @notice Send a message to a wallet address
     * @param to Recipient wallet address
     * @param subject Message subject line
     * @param body Message body content
     * @param payer Address that will pay the USDC fee
     * @param revenueShareToReceiver If true, receiver gets 90% revenue share; if false, no revenue share
     * @param resolveSenderToName If true, resolve sender address to name via off-chain service
     */
    function send(
        address to,
        string calldata subject,
        string calldata body,
        address payer,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    ) external;

    /**
     * @notice Send a message using pre-prepared content (referenced by mailId)
     * @param to Recipient wallet address
     * @param mailId Reference ID to pre-prepared message content
     * @param payer Address that will pay the USDC fee
     * @param revenueShareToReceiver If true, receiver gets 90% revenue share; if false, no revenue share
     * @param resolveSenderToName If true, resolve sender address to name via off-chain service
     */
    function sendPrepared(
        address to,
        string calldata mailId,
        address payer,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    ) external;

    /**
     * @notice Send a message to an email address (no wallet address)
     * @param toEmail Email address of the recipient
     * @param subject Message subject line
     * @param body Message body content
     * @param payer Address that will pay the USDC fee
     */
    function sendToEmailAddress(
        string calldata toEmail,
        string calldata subject,
        string calldata body,
        address payer
    ) external;

    /**
     * @notice Send a pre-prepared message to an email address
     * @param toEmail Email address of the recipient
     * @param mailId Reference ID to pre-prepared message content
     * @param payer Address that will pay the USDC fee
     */
    function sendPreparedToEmailAddress(
        string calldata toEmail,
        string calldata mailId,
        address payer
    ) external;

    /**
     * @notice Send a message through a webhook
     * @param to Recipient wallet address
     * @param webhookId Webhook identifier for delivery
     * @param payer Address that will pay the USDC fee
     * @param revenueShareToReceiver If true, receiver gets 90% revenue share; if false, no revenue share
     * @param resolveSenderToName If true, resolve sender address to name via off-chain service
     */
    function sendThroughWebhook(
        address to,
        string calldata webhookId,
        address payer,
        bool revenueShareToReceiver,
        bool resolveSenderToName
    ) external;
}

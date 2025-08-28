// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC20
 * @notice Interface for ERC20 token standard
 * @dev Minimal interface for USDC token interactions
 */
interface IERC20 {
    /// @notice Transfer tokens from one address to another using allowance
    /// @param from Source address
    /// @param to Destination address
    /// @param amount Amount to transfer
    /// @return success True if transfer succeeded
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    
    /// @notice Transfer tokens to another address
    /// @param to Destination address
    /// @param amount Amount to transfer
    /// @return success True if transfer succeeded
    function transfer(address to, uint256 amount) external returns (bool);
    
    /// @notice Approve another address to spend tokens on your behalf
    /// @param spender Address authorized to spend
    /// @param amount Amount they can spend
    /// @return success True if approval succeeded
    function approve(address spender, uint256 amount) external returns (bool);
    
    /// @notice Get the balance of an address
    /// @param account Address to check balance for
    /// @return balance Token balance
    function balanceOf(address account) external view returns (uint256);
}
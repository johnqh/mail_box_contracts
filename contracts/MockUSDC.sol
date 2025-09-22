// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockUSDC
 * @notice Mock USDC token for testing Mailer contracts
 * @dev ERC20-compatible token with 6 decimals to match real USDC
 * @author Mailer Team
 */
contract MockUSDC {
    /// @notice Balance tracking for each address
    mapping(address => uint256) public balanceOf;
    
    /// @notice Allowance tracking for delegated transfers
    mapping(address => mapping(address => uint256)) public allowance;
    
    /// @notice Token name following ERC20 standard
    string public name = "Mock USDC";
    
    /// @notice Token symbol following ERC20 standard
    string public symbol = "USDC";
    
    /// @notice Token decimals matching real USDC (6 decimals)
    uint8 public decimals = 6;
    
    /// @notice Total token supply (1M USDC with 6 decimals)
    uint256 public totalSupply = 1000000 * 10**6;
    
    /// @notice Contract owner who can mint new tokens
    address public immutable owner;
    
    /// @notice Thrown when non-owner attempts owner-only functions
    error OnlyOwner();
    
    /// @notice Thrown when transfer amount exceeds sender's balance
    error InsufficientBalance();
    
    /// @notice Thrown when transferFrom amount exceeds allowance
    error InsufficientAllowance();
    
    /// @notice Restricts function access to contract owner only
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }
    
    /// @notice Initializes the mock USDC token
    /// @dev Sets deployer as owner and gives them the initial supply
    constructor() {
        owner = msg.sender;
        balanceOf[msg.sender] = totalSupply;
    }
    
    /// @notice Transfer tokens to another address
    /// @param to Recipient address
    /// @param amount Amount to transfer (in 6-decimal USDC units)
    /// @return success True if transfer succeeded
    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) {
            revert InsufficientBalance();
        }
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    /// @notice Transfer tokens from one address to another using allowance
    /// @param from Source address
    /// @param to Recipient address  
    /// @param amount Amount to transfer (in 6-decimal USDC units)
    /// @return success True if transfer succeeded
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (balanceOf[from] < amount) {
            revert InsufficientBalance();
        }
        if (allowance[from][msg.sender] < amount) {
            revert InsufficientAllowance();
        }
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        return true;
    }
    
    /// @notice Approve another address to spend tokens on your behalf
    /// @param spender Address authorized to spend tokens
    /// @param amount Amount they can spend (in 6-decimal USDC units)
    /// @return success True if approval succeeded
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    /// @notice Mint new tokens to an address (owner only)
    /// @dev Used for testing to fund accounts with USDC
    /// @param to Address to receive the newly minted tokens
    /// @param amount Amount to mint (in 6-decimal USDC units)
    function mint(address to, uint256 amount) external onlyOwner {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}
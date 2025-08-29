// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MailService
 * @notice Decentralized delegation management system
 * @dev Handles delegation with rejection capability and USDC fees
 * @author MailBox Team
 */

import "./interfaces/IERC20.sol";

contract MailService {
    /// @notice Contract owner with administrative privileges
    address public immutable owner;
    
    /// @notice USDC token contract for fee payments
    IERC20 public immutable usdcToken;
    
    /// @notice Reentrancy guard status
    uint256 private _status;
    
    /// @notice Fee required for delegation operations (10 USDC with 6 decimals)
    uint256 public delegationFee = 10000000;
    
    /// @notice Mapping of delegator addresses to their chosen delegates
    /// @dev address(0) indicates no delegation or cleared delegation
    mapping(address => address) public delegations;
    
    /// @notice Emitted when delegation is set or cleared
    /// @param delegator The address setting the delegation
    /// @param delegate The delegate address (address(0) for clearing)
    event DelegationSet(address indexed delegator, address indexed delegate);
    
    /// @notice Emitted when delegation fee is updated
    /// @param oldFee Previous fee amount
    /// @param newFee New fee amount
    event DelegationFeeUpdated(uint256 oldFee, uint256 newFee);
    
    /// @notice Thrown when non-owner attempts owner-only functions
    error OnlyOwner();
    
    /// @notice Thrown when attempting to reject a non-existent delegation
    error NoDelegationToReject();
    
    /// @notice Thrown when fee payment fails
    error FeePaymentRequired();
    
    /// @notice Thrown when reentrancy is detected
    error ReentrancyGuard();
    
    /// @notice Thrown when zero address is provided where not allowed
    error InvalidAddress();
    
    /// @notice Restricts function access to contract owner only
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
    
    /// @notice Initializes the contract with USDC token and owner
    /// @param _usdcToken Address of the USDC token contract
    /// @param _owner Address that will have administrative privileges
    constructor(address _usdcToken, address _owner) {
        if (_usdcToken == address(0) || _owner == address(0)) {
            revert InvalidAddress();
        }
        owner = _owner;
        usdcToken = IERC20(_usdcToken);
    }
    
    /// @notice Delegate mail handling to another address
    /// @dev Charges delegation fee in USDC. Use address(0) to clear delegation
    /// @param delegate Address to delegate to, or address(0) to clear
    function delegateTo(address delegate) external nonReentrant {
        // If clearing delegation (setting to address(0)), no fee required
        if (delegate != address(0)) {
            if (!usdcToken.transferFrom(msg.sender, address(this), delegationFee)) {
                revert FeePaymentRequired();
            }
        }
        delegations[msg.sender] = delegate;
        emit DelegationSet(msg.sender, delegate);
    }
    
    /// @notice Reject a delegation made to you by another address
    /// @dev Only the delegate can reject a delegation made to them
    /// @param delegatingAddress Address that delegated to msg.sender
    function rejectDelegation(address delegatingAddress) external nonReentrant {
        if (delegations[delegatingAddress] != msg.sender) {
            revert NoDelegationToReject();
        }
        
        delegations[delegatingAddress] = address(0);
        emit DelegationSet(delegatingAddress, address(0));
    }
    
    /// @notice Update the delegation fee (owner only)
    /// @param usdcAmount New fee amount in USDC (6 decimals)
    function setDelegationFee(uint256 usdcAmount) external onlyOwner {
        uint256 oldFee = delegationFee;
        delegationFee = usdcAmount;
        emit DelegationFeeUpdated(oldFee, usdcAmount);
    }
    
    /// @notice Get current delegation fee
    /// @return Current delegation fee in USDC (6 decimals)
    function getDelegationFee() external view returns (uint256) {
        return delegationFee;
    }
    
}
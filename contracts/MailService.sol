// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MailService {
    address public immutable owner;
    IERC20 public immutable usdcToken;
    uint256 public registrationFee = 100000000; // 100 USDC (6 decimals)
    uint256 public delegationFee = 10000000; // 10 USDC (6 decimals)
    
    event DelegationSet(address indexed delegator, address indexed delegate);
    event DelegationCleared(address indexed delegator);
    event DomainRegistered(string indexed domain, address indexed registrar, uint256 expiration);
    event DomainExtended(string indexed domain, address indexed registrar, uint256 newExpiration);
    event DomainReleased(string indexed domain, address indexed registrar);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    event DelegationFeeUpdated(uint256 oldFee, uint256 newFee);
    
    error EmptyDomain();
    error OnlyOwner();
    
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }
    
    constructor(address _usdcToken, address _owner) {
        owner = _owner;
        usdcToken = IERC20(_usdcToken);
    }
    
    function delegateTo(address delegate) external {
        // Transfer delegation fee
        bool success = usdcToken.transferFrom(msg.sender, address(this), delegationFee);
        if (success) {
            if (delegate == address(0)) {
                emit DelegationCleared(msg.sender);
            } else {
                emit DelegationSet(msg.sender, delegate);
            }
        }
    }
    
    
    function registerDomain(string calldata domain, bool isExtension) external {
        if (bytes(domain).length == 0) {
            revert EmptyDomain();
        }
        
        // Transfer registration fee
        bool success = usdcToken.transferFrom(msg.sender, address(this), registrationFee);
        if (success) {
            uint256 expiration = block.timestamp + 365 days;
            
            if (isExtension) {
                // For extensions, the indexer will calculate the actual new expiration
                emit DomainExtended(domain, msg.sender, expiration);
            } else {
                // New registration
                emit DomainRegistered(domain, msg.sender, expiration);
            }
        }
    }
    
    function releaseRegistration(string calldata domain) external {
        // Simply emit the event - indexer will validate ownership
        emit DomainReleased(domain, msg.sender);
    }
    
    function setRegistrationFee(uint256 usdcAmount) external onlyOwner {
        uint256 oldFee = registrationFee;
        registrationFee = usdcAmount;
        emit RegistrationFeeUpdated(oldFee, usdcAmount);
    }
    
    function setDelegationFee(uint256 usdcAmount) external onlyOwner {
        uint256 oldFee = delegationFee;
        delegationFee = usdcAmount;
        emit DelegationFeeUpdated(oldFee, usdcAmount);
    }
    
    function getRegistrationFee() external view returns (uint256) {
        return registrationFee;
    }
    
    function getDelegationFee() external view returns (uint256) {
        return delegationFee;
    }
    
}
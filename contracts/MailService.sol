// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISafe {
    function getThreshold() external view returns (uint256);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MailService {
    address public immutable owner;
    IERC20 public immutable usdcToken;
    uint256 public registrationFee = 100000000; // 100 USDC (6 decimals)
    mapping(address => address) private delegations;
    mapping(string => address) private domainToRegister;
    mapping(string => uint256) private domainToExpiration;
    mapping(address => string[]) private registerToDomains;
    
    event DelegationSet(address indexed delegator, address indexed delegate);
    event DelegationCleared(address indexed delegator);
    event DomainRegistered(string indexed domain, address indexed registrar, uint256 expiration);
    event DomainExtended(string indexed domain, address indexed registrar, uint256 newExpiration);
    event DomainReleased(string indexed domain, address indexed registrar);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    
    error NotASafeWallet();
    error DomainAlreadyRegistered();
    error EmptyDomain();
    error DomainNotRegistered();
    error OnlyOwner();
    
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }
    
    constructor(address _usdcToken) {
        owner = msg.sender;
        usdcToken = IERC20(_usdcToken);
    }
    
    function delegateTo(address delegate) external {
        if (!_isSafe(msg.sender)) {
            revert NotASafeWallet();
        }
        
        if (delegate == address(0)) {
            delete delegations[msg.sender];
            emit DelegationCleared(msg.sender);
        } else {
            delegations[msg.sender] = delegate;
            emit DelegationSet(msg.sender, delegate);
        }
    }
    
    function getDelegatedAddress(address delegator) external view returns (address) {
        return delegations[delegator];
    }
    
    function registerDomain(string calldata domain) external {
        if (!_isSafe(msg.sender)) {
            revert NotASafeWallet();
        }
        
        if (bytes(domain).length == 0) {
            revert EmptyDomain();
        }
        
        address currentOwner = domainToRegister[domain];
        bool isNewRegistration = currentOwner == address(0);
        bool isRenewal = currentOwner == msg.sender;
        
        if (!isNewRegistration && !isRenewal) {
            revert DomainAlreadyRegistered();
        }
        
        // Transfer registration fee
        bool success = usdcToken.transferFrom(msg.sender, address(this), registrationFee);
        if (success) {
            uint256 newExpiration = block.timestamp + 365 days;
            
            if (isNewRegistration) {
                domainToRegister[domain] = msg.sender;
                domainToExpiration[domain] = newExpiration;
                registerToDomains[msg.sender].push(domain);
                
                emit DomainRegistered(domain, msg.sender, newExpiration);
            } else {
                // Extend existing registration
                domainToExpiration[domain] = domainToExpiration[domain] + 365 days;
                
                emit DomainExtended(domain, msg.sender, domainToExpiration[domain]);
            }
        }
    }
    
    function releaseRegistration(string calldata domain) external {
        if (domainToRegister[domain] != msg.sender) {
            revert DomainNotRegistered();
        }
        
        // Remove domain from registrar's list
        string[] storage domains = registerToDomains[msg.sender];
        for (uint256 i = 0; i < domains.length; i++) {
            if (keccak256(bytes(domains[i])) == keccak256(bytes(domain))) {
                domains[i] = domains[domains.length - 1];
                domains.pop();
                break;
            }
        }
        
        // Remove domain registration and expiration
        delete domainToRegister[domain];
        delete domainToExpiration[domain];
        
        emit DomainReleased(domain, msg.sender);
    }
    
    function setRegistrationFee(uint256 usdcAmount) external onlyOwner {
        uint256 oldFee = registrationFee;
        registrationFee = usdcAmount;
        emit RegistrationFeeUpdated(oldFee, usdcAmount);
    }
    
    function getRegistrationFee() external view returns (uint256) {
        return registrationFee;
    }
    
    function getDomainRegister(string calldata domain) external view returns (address registrar, uint256 expiration) {
        return (domainToRegister[domain], domainToExpiration[domain]);
    }
    
    function getDomains() external view returns (string[] memory domains, uint256[] memory expirations) {
        string[] memory userDomains = registerToDomains[msg.sender];
        uint256[] memory domainExpirations = new uint256[](userDomains.length);
        
        for (uint256 i = 0; i < userDomains.length; i++) {
            domainExpirations[i] = domainToExpiration[userDomains[i]];
        }
        
        return (userDomains, domainExpirations);
    }
    
    function _isSafe(address account) private view returns (bool) {
        if (account.code.length == 0) {
            return false;
        }
        
        try ISafe(account).getThreshold() returns (uint256 threshold) {
            return threshold > 0;
        } catch {
            return false;
        }
    }
}
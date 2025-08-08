// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./SafeChecker.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract MailService {
    struct Registration {
        address registrar;
        uint256 expiration;
    }
    
    address public immutable owner;
    IERC20 public immutable usdcToken;
    SafeChecker public immutable safeChecker;
    uint256 public registrationFee = 100000000; // 100 USDC (6 decimals)
    mapping(address => address) private delegations;
    // Changed: Now maps domain to array of registrations instead of single address
    mapping(string => Registration[]) private domainRegistrations;
    // Maps registrar + domain hash to registration index for efficient lookup
    mapping(bytes32 => uint256) private registrationIndex;
    mapping(address => string[]) private registerToDomains;
    
    event DelegationSet(address indexed delegator, address indexed delegate);
    event DelegationCleared(address indexed delegator);
    event DomainRegistered(string indexed domain, address indexed registrar, uint256 expiration);
    event DomainExtended(string indexed domain, address indexed registrar, uint256 newExpiration);
    event DomainReleased(string indexed domain, address indexed registrar);
    event RegistrationFeeUpdated(uint256 oldFee, uint256 newFee);
    
    error NotASafeWallet();
    error EmptyDomain();
    error DomainNotRegistered();
    error OnlyOwner();
    
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert OnlyOwner();
        }
        _;
    }
    
    constructor(address _usdcToken, address _safeChecker) {
        owner = msg.sender;
        usdcToken = IERC20(_usdcToken);
        safeChecker = SafeChecker(_safeChecker);
    }
    
    function delegateTo(address delegate) external {
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
        if (!safeChecker.isSafe(msg.sender)) {
            revert NotASafeWallet();
        }
        
        if (bytes(domain).length == 0) {
            revert EmptyDomain();
        }
        
        // Check if this sender already has a registration for this domain
        bytes32 regKey = keccak256(abi.encodePacked(msg.sender, domain));
        uint256 existingIndex = registrationIndex[regKey];
        
        // Transfer registration fee
        bool success = usdcToken.transferFrom(msg.sender, address(this), registrationFee);
        if (success) {
            uint256 newExpiration = block.timestamp + 365 days;
            
            if (existingIndex == 0) {
                // Check if this is actually a new registration (index 0 could be valid)
                Registration[] storage regs = domainRegistrations[domain];
                bool hasExisting = false;
                
                if (regs.length > 0 && regs[0].registrar == msg.sender) {
                    // User has index 0, so this is a renewal
                    hasExisting = true;
                    regs[0].expiration = regs[0].expiration + 365 days;
                    emit DomainExtended(domain, msg.sender, regs[0].expiration);
                } else {
                    // New registration for this user
                    regs.push(Registration(msg.sender, newExpiration));
                    registrationIndex[regKey] = regs.length; // Store 1-based index
                    registerToDomains[msg.sender].push(domain);
                    emit DomainRegistered(domain, msg.sender, newExpiration);
                }
            } else {
                // Renewal - extend existing registration
                Registration[] storage regs = domainRegistrations[domain];
                regs[existingIndex - 1].expiration = regs[existingIndex - 1].expiration + 365 days;
                emit DomainExtended(domain, msg.sender, regs[existingIndex - 1].expiration);
            }
        }
    }
    
    function releaseRegistration(string calldata domain) external {
        bytes32 regKey = keccak256(abi.encodePacked(msg.sender, domain));
        uint256 index = registrationIndex[regKey];
        
        if (index == 0) {
            // Check if user has registration at index 0
            Registration[] storage checkRegs = domainRegistrations[domain];
            if (checkRegs.length == 0 || checkRegs[0].registrar != msg.sender) {
                revert DomainNotRegistered();
            }
            // User has registration at index 0, proceed with removal
            index = 1; // Convert to 1-based for processing
        }
        
        // Remove domain from registrar's list
        string[] storage userDomains = registerToDomains[msg.sender];
        for (uint256 i = 0; i < userDomains.length; i++) {
            if (keccak256(bytes(userDomains[i])) == keccak256(bytes(domain))) {
                userDomains[i] = userDomains[userDomains.length - 1];
                userDomains.pop();
                break;
            }
        }
        
        // Remove registration from array
        Registration[] storage regs = domainRegistrations[domain];
        uint256 arrayIndex = index - 1;
        
        // If not the last element, move last element to this position
        if (arrayIndex < regs.length - 1) {
            Registration memory lastReg = regs[regs.length - 1];
            regs[arrayIndex] = lastReg;
            
            // Update the index mapping for the moved registration
            bytes32 movedRegKey = keccak256(abi.encodePacked(lastReg.registrar, domain));
            registrationIndex[movedRegKey] = index;
        }
        
        regs.pop();
        delete registrationIndex[regKey];
        
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
    
    function getDomainRegistrations(string calldata domain) external view returns (Registration[] memory) {
        return domainRegistrations[domain];
    }
    
    function getUserDomainRegistration(string calldata domain, address user) external view returns (address registrar, uint256 expiration) {
        bytes32 regKey = keccak256(abi.encodePacked(user, domain));
        uint256 index = registrationIndex[regKey];
        
        if (index == 0) {
            // Check if user has registration at index 0
            Registration[] storage zeroIndexRegs = domainRegistrations[domain];
            if (zeroIndexRegs.length > 0 && zeroIndexRegs[0].registrar == user) {
                return (zeroIndexRegs[0].registrar, zeroIndexRegs[0].expiration);
            }
            return (address(0), 0);
        }
        
        Registration[] storage regs = domainRegistrations[domain];
        if (index <= regs.length) {
            Registration storage reg = regs[index - 1];
            return (reg.registrar, reg.expiration);
        }
        
        return (address(0), 0);
    }
    
    function getDomains() external view returns (string[] memory domains, uint256[] memory expirations) {
        string[] memory userDomains = registerToDomains[msg.sender];
        uint256[] memory domainExpirations = new uint256[](userDomains.length);
        
        for (uint256 i = 0; i < userDomains.length; i++) {
            bytes32 regKey = keccak256(abi.encodePacked(msg.sender, userDomains[i]));
            uint256 index = registrationIndex[regKey];
            
            if (index == 0) {
                // Check if user has registration at index 0
                Registration[] storage domainRegs = domainRegistrations[userDomains[i]];
                if (domainRegs.length > 0 && domainRegs[0].registrar == msg.sender) {
                    domainExpirations[i] = domainRegs[0].expiration;
                }
            } else {
                Registration[] storage domainRegs = domainRegistrations[userDomains[i]];
                if (index <= domainRegs.length) {
                    domainExpirations[i] = domainRegs[index - 1].expiration;
                }
            }
        }
        
        return (userDomains, domainExpirations);
    }
    
}
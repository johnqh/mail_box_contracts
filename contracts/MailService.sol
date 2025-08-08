// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISafe {
    function getThreshold() external view returns (uint256);
}

contract MailService {
    address public immutable owner;
    mapping(address => address) private delegations;
    mapping(string => address) private domainToRegister;
    mapping(address => string[]) private registerToDomains;
    
    event DelegationSet(address indexed delegator, address indexed delegate);
    event DelegationCleared(address indexed delegator);
    event DomainRegistered(string indexed domain, address indexed registrar);
    
    error NotASafeWallet();
    error DomainAlreadyRegistered();
    error EmptyDomain();
    
    constructor() {
        owner = msg.sender;
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
        
        if (domainToRegister[domain] != address(0)) {
            revert DomainAlreadyRegistered();
        }
        
        domainToRegister[domain] = msg.sender;
        registerToDomains[msg.sender].push(domain);
        
        emit DomainRegistered(domain, msg.sender);
    }
    
    function getDomainRegister(string calldata domain) external view returns (address) {
        return domainToRegister[domain];
    }
    
    function getDomains() external view returns (string[] memory) {
        return registerToDomains[msg.sender];
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
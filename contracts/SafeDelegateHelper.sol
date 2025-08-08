// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MailService.sol";
import "./SafeChecker.sol";

contract SafeDelegateHelper {
    MailService public mailService;
    IERC20 public usdcToken;
    uint256 private threshold = 2;
    address[] private owners;
    uint256 private _nonce = 0;
    bytes32 private constant DOMAIN_SEPARATOR = keccak256("SafeDelegateHelper");
    
    constructor(address _mailService, address _usdcToken) {
        mailService = MailService(_mailService);
        usdcToken = IERC20(_usdcToken);
        
        // Initialize with a default owner (the deployer) to simulate a Safe
        owners.push(msg.sender);
        owners.push(address(0x1)); // Add a second owner to meet threshold = 2
    }
    
    function getThreshold() external view returns (uint256) {
        return threshold;
    }
    
    function setThreshold(uint256 _threshold) external {
        threshold = _threshold;
    }
    
    function getOwners() external view returns (address[] memory) {
        return owners;
    }
    
    function isOwner(address owner) external view returns (bool) {
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == owner) {
                return true;
            }
        }
        return false;
    }
    
    function nonce() external view returns (uint256) {
        return _nonce;
    }
    
    function domainSeparator() external pure returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }
    
    function testDelegation(address delegate) external {
        mailService.delegateTo(delegate);
    }
    
    function testDomainRegistration(string calldata domain) external {
        mailService.registerDomain(domain);
    }
    
    function testDomainRelease(string calldata domain) external {
        mailService.releaseRegistration(domain);
    }
    
    function getMyDomains() external view returns (string[] memory domains, uint256[] memory expirations) {
        return mailService.getDomains();
    }
    
    function fundAndApprove(uint256 amount) external {
        // This would normally be called by an external account to fund the Safe
        usdcToken.approve(address(mailService), amount);
        _nonce++; // Simulate transaction execution
    }
    
    function addOwner(address newOwner) external {
        owners.push(newOwner);
    }
    
    function removeOwner(address ownerToRemove) external {
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == ownerToRemove) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISafe {
    function getThreshold() external view returns (uint256);
}

contract MailService {
    mapping(address => address) private delegations;
    
    event DelegationSet(address indexed delegator, address indexed delegate);
    event DelegationCleared(address indexed delegator);
    
    error NotASafeWallet();
    
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
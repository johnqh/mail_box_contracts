// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MailService.sol";

contract SafeDelegateHelper {
    MailService public mailService;
    uint256 private threshold = 2;
    
    constructor(address _mailService) {
        mailService = MailService(_mailService);
    }
    
    function getThreshold() external view returns (uint256) {
        return threshold;
    }
    
    function setThreshold(uint256 _threshold) external {
        threshold = _threshold;
    }
    
    function testDelegation(address delegate) external {
        mailService.delegateTo(delegate);
    }
}
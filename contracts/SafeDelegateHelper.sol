// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MailService.sol";

contract SafeDelegateHelper {
    MailService public mailService;
    IERC20 public usdcToken;
    uint256 private threshold = 2;
    
    constructor(address _mailService, address _usdcToken) {
        mailService = MailService(_mailService);
        usdcToken = IERC20(_usdcToken);
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
    }
}
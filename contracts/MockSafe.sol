// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockSafe {
    uint256 private threshold;
    
    constructor(uint256 _threshold) {
        threshold = _threshold;
    }
    
    function getThreshold() external view returns (uint256) {
        return threshold;
    }
    
    function setThreshold(uint256 _threshold) external {
        threshold = _threshold;
    }
}
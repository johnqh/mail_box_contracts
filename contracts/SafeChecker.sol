// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGnosisSafe {
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function isOwner(address owner) external view returns (bool);
    function nonce() external view returns (uint256);
    function domainSeparator() external view returns (bytes32);
}

/// @title SafeChecker - Utility contract to verify Gnosis Safe multi-sig wallets
/// @notice Provides comprehensive verification that an address is a legitimate Gnosis Safe contract
contract SafeChecker {
    
    /// @notice Verifies that an address is a valid Gnosis Safe multi-sig wallet
    /// @param account The address to verify
    /// @return isValid True if the address is a valid Safe, false otherwise
    function isSafe(address account) external view returns (bool isValid) {
        // Check if account has code (not an EOA)
        if (account.code.length == 0) {
            return false;
        }
        
        try IGnosisSafe(account).getThreshold() returns (uint256 threshold) {
            // Threshold must be greater than 0
            if (threshold == 0) {
                return false;
            }
            
            try IGnosisSafe(account).getOwners() returns (address[] memory owners) {
                // Must have at least one owner
                if (owners.length == 0) {
                    return false;
                }
                
                // Threshold cannot exceed number of owners
                if (threshold > owners.length) {
                    return false;
                }
                
                // Verify at least one owner is valid (not zero address)
                bool hasValidOwner = false;
                for (uint256 i = 0; i < owners.length; i++) {
                    if (owners[i] != address(0)) {
                        hasValidOwner = true;
                        break;
                    }
                }
                
                if (!hasValidOwner) {
                    return false;
                }
                
                // Additional Safe-specific checks
                try IGnosisSafe(account).nonce() returns (uint256) {
                    // If nonce call succeeds, it's likely a Safe
                    try IGnosisSafe(account).domainSeparator() returns (bytes32 domain) {
                        // Domain separator should not be zero for a properly initialized Safe
                        return domain != bytes32(0);
                    } catch {
                        // Some Safe versions might not have domainSeparator, so accept nonce success
                        return true;
                    }
                } catch {
                    return false;
                }
                
            } catch {
                return false;
            }
            
        } catch {
            return false;
        }
    }
    
    /// @notice Gets basic Safe information for verification purposes
    /// @param account The Safe address to query
    /// @return threshold The required signature threshold
    /// @return ownerCount The number of owners
    /// @return isValidSafe Whether this is a valid Safe
    function getSafeInfo(address account) 
        external 
        view 
        returns (
            uint256 threshold, 
            uint256 ownerCount, 
            bool isValidSafe
        ) 
    {
        if (!this.isSafe(account)) {
            return (0, 0, false);
        }
        
        threshold = IGnosisSafe(account).getThreshold();
        ownerCount = IGnosisSafe(account).getOwners().length;
        isValidSafe = true;
    }
    
    /// @notice Verifies that a specific address is an owner of the Safe
    /// @param safeAccount The Safe contract address
    /// @param potentialOwner The address to check ownership for
    /// @return isOwner True if the address is an owner of the Safe
    function isOwnerOfSafe(address safeAccount, address potentialOwner) 
        external 
        view 
        returns (bool isOwner) 
    {
        if (!this.isSafe(safeAccount)) {
            return false;
        }
        
        try IGnosisSafe(safeAccount).isOwner(potentialOwner) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }
}
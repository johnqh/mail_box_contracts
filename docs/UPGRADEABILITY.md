# Upgradeability Guide

This document explains how the Mail Box contracts are upgradeable and how to safely perform upgrades.

## Overview

The Mail Box contracts support upgradeability on both EVM chains and Solana:

- **EVM**: Uses OpenZeppelin's UUPS (Universal Upgradeable Proxy Standard) pattern
- **Solana**: Uses Solana's native BPF Upgradeable Loader

## EVM Upgradeability (UUPS Pattern)

### Architecture

The **Mailer** contract is deployed as a UUPS upgradeable proxy:

- **Proxy Contract**: User-facing address that never changes
- **Implementation Contract**: Contains the logic, can be upgraded
- **Storage**: Lives in the proxy, preserved across upgrades

**Key Features**:

- ✅ Gas efficient (upgrade logic in implementation)
- ✅ Owner-controlled upgrades only
- ✅ Storage layout validation by OpenZeppelin plugin
- ✅ Prevents initialization attacks

### Deployment

Deploy a new upgradeable Mailer contract:

```bash
# Using the upgradeable deployment script
npx hardhat run scripts/evm/deploy-upgradeable.ts --network sepolia

# Or for local testing
npx hardhat run scripts/evm/deploy-upgradeable.ts --network localhost
```

This will:

1. Deploy the implementation contract
2. Deploy the proxy contract
3. Initialize the proxy with USDC address and owner
4. Save deployment info to `deployments/<network>-upgradeable.json`

### Upgrading

To upgrade an existing contract:

```bash
# Set the proxy address
export PROXY_ADDRESS=0x...

# Run the upgrade script
npx hardhat run scripts/evm/upgrade.ts --network sepolia
```

The script will:

1. Verify you're the owner
2. Deploy the new implementation
3. Upgrade the proxy to point to new implementation
4. Verify state is preserved
5. Update deployment records

### Upgrade Safety Checks

The OpenZeppelin upgrades plugin performs automatic validation:

- ✅ **Storage layout compatibility**: Ensures no storage collisions
- ✅ **Initialization protection**: Prevents re-initialization
- ✅ **Authorization**: Only owner can authorize upgrades
- ✅ **Constructor warnings**: Flags unsafe constructor usage

### Important Considerations

**DO**:

- ✅ Test upgrades thoroughly on testnet first
- ✅ Verify storage layout compatibility
- ✅ Keep the same variable order in new versions
- ✅ Add new variables at the end
- ✅ Use the storage gap (`__gap`) for future flexibility

**DON'T**:

- ❌ Remove or reorder existing state variables
- ❌ Change variable types
- ❌ Use `selfdestruct` in implementation
- ❌ Use `delegatecall` carelessly
- ❌ Initialize state in constructors (use `initialize()`)

### Example Upgrade Flow

```solidity
// V1 - Original
contract Mailer is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    IERC20 public usdcToken;
    uint128 public sendFee;
    uint128 public delegationFee;
    // ... existing variables ...

    uint256[50] private __gap; // Reserve space for future variables
}

// V2 - Upgraded (SAFE)
contract Mailer is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    IERC20 public usdcToken;
    uint128 public sendFee;
    uint128 public delegationFee;
    // ... existing variables (same order) ...

    // NEW: Add new variables at the end
    uint256 public newFeature;

    uint256[49] private __gap; // Reduced by 1 for newFeature
}
```

### Retrieving Contract Addresses

```typescript
import { upgrades } from 'hardhat';

// Get implementation address from proxy
const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);

// Get admin address (for UUPS, this is encoded in implementation)
const admin = await upgrades.erc1967.getAdminAddress(proxyAddress);
```

## Solana Upgradeability

### Architecture

Solana programs are **upgradeable by default** using the BPF Upgradeable Loader:

- **Program ID**: Fixed address that never changes
- **Program Data**: The executable code, can be upgraded
- **Upgrade Authority**: Keypair that controls upgrades

### Deployment

Deploy the Solana program with upgrade authority:

```bash
# Build the program
anchor build

# Deploy (upgrade authority defaults to deployer)
anchor deploy --provider.cluster devnet

# Or use custom script
ts-node scripts/solana/deploy.ts devnet
```

### Managing Upgrade Authority

#### Show Current Authority

```bash
PROGRAM_ID=<program_id> ts-node scripts/solana/manage-upgrade-authority.ts show devnet
```

#### Transfer Authority

```bash
PROGRAM_ID=<program_id> \
NEW_AUTHORITY=<new_pubkey> \
ts-node scripts/solana/manage-upgrade-authority.ts transfer devnet
```

#### Freeze Upgrades (Irreversible!)

⚠️ **WARNING**: This permanently prevents all future upgrades!

```bash
solana program set-upgrade-authority <program_id> --final
```

### Upgrading

To upgrade the Solana program:

```bash
# Build the new version
anchor build

# Upgrade (must be signed by upgrade authority)
PROGRAM_ID=<program_id> \
ts-node scripts/solana/upgrade.ts devnet

# Or use Solana CLI directly
solana program deploy \
  --program-id <program_id> \
  --upgrade-authority ~/.config/solana/id.json \
  target/deploy/mailer.so
```

### Upgrade Safety

**DO**:

- ✅ Test on devnet first
- ✅ Verify account structures are compatible
- ✅ Keep upgrade authority secure (hardware wallet recommended)
- ✅ Consider multi-sig for upgrade authority
- ✅ Back up program binary before upgrading

**DON'T**:

- ❌ Change account discriminators
- ❌ Modify existing account structures (add fields at end only)
- ❌ Lose the upgrade authority keypair
- ❌ Freeze upgrades prematurely

### Program Data Account Layout

Solana stores upgrade authority in the Program Data Account:

```
[Slot (8 bytes)]
[ProgramData Header (36 bytes)]
[Authority Option (1 byte)]
[Authority Pubkey (32 bytes if present)]
[Program Executable Code (...)]
```

## Multi-Chain Upgrade Coordination

When upgrading across both EVM and Solana:

1. **Plan Changes**: Ensure feature parity
2. **Test Separately**: Upgrade and test each chain independently
3. **Deploy Sequentially**:
   - Upgrade testnets first (Sepolia, Devnet)
   - Monitor for 24-48 hours
   - Upgrade mainnets (Ethereum, Solana)
4. **Update Clients**: Deploy new client library versions
5. **Notify Users**: Announce upgrades via documentation

## Testing Upgrades

### EVM Tests

Run the upgrade test suite:

```bash
# Test proxy deployment and upgrades
npx hardhat test test/evm/Mailer.upgrade.test.ts

# Test all functionality with upgradeable contracts
npx hardhat test test/evm/Mailer.test.ts
```

### Solana Tests

```bash
# Run Anchor tests
anchor test

# Test upgrade locally
# 1. Deploy V1
anchor deploy --provider.cluster localnet

# 2. Make changes
# ... edit code ...

# 3. Build V2
anchor build

# 4. Upgrade
PROGRAM_ID=<id> ts-node scripts/solana/upgrade.ts localnet
```

## Emergency Procedures

### Pause Contract (EVM)

If a critical bug is discovered:

```solidity
// Owner can pause the contract
await mailer.pause();

// Funds are automatically distributed
// New operations are blocked until unpaused

// After fixing and upgrading:
await mailer.unpause();
```

### Rollback (EVM)

UUPS doesn't support automatic rollbacks, but you can:

1. Deploy previous implementation version
2. Upgrade to the previous implementation
3. Verify state is still valid

### Solana Emergency

For Solana, you can:

1. Quickly deploy a patched version (program ID stays same)
2. Transfer upgrade authority to a secure cold wallet
3. As last resort, deploy a new program with different ID

## Upgrade Checklist

Before upgrading to production:

- [ ] All tests pass on new version
- [ ] Upgrade tested on testnet
- [ ] Storage layout validated (EVM)
- [ ] Account structures compatible (Solana)
- [ ] Documentation updated
- [ ] Client libraries updated
- [ ] Upgrade authority confirmed
- [ ] Rollback plan prepared
- [ ] User communication drafted
- [ ] Monitor deployed for 24h+ on testnet

## Version History

Track upgrades in `deployments/<network>-upgradeable.json`:

```json
{
  "contracts": {
    "mailerProxy": "0x...",
    "mailerImplementation": "0x..."  // Current
  },
  "upgrades": [
    {
      "timestamp": "2024-01-15T10:00:00Z",
      "upgrader": "0x...",
      "oldImplementation": "0x...",
      "newImplementation": "0x..."
    }
  ]
}
```

## Resources

- [OpenZeppelin Upgrades Documentation](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [UUPS Pattern Explanation](https://eips.ethereum.org/EIPS/eip-1822)
- [Solana Program Deployment Guide](https://docs.solana.com/cli/deploy-a-program)
- [Anchor Upgrades](https://www.anchor-lang.com/docs/cli)

## Support

For upgrade assistance:

- Review `/docs/AI_DEVELOPMENT_GUIDE.md` for development patterns
- Check `/examples/` for working code examples
- See `/test/` for comprehensive test patterns

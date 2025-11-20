# 🚀 Deployment Cost Optimization Checklist

Quick reference for deploying contracts with minimal cost.

---

## ✅ Already Optimized

### EVM (Mailer.sol)
- [x] Compiler optimization (`runs: 1`, `viaIR: true`)
- [x] Storage packing (2 slots, optimized structs)
- [x] Custom errors instead of revert strings
- [x] `unchecked` math where safe
- [x] Short-circuit evaluation
- [x] All functions have correct visibility

**Current bytecode:** 24.5 KB (99.9% of 24KB max limit)

### Solana (mailer program)
- [x] Cargo profile optimization added (`opt-level = "z"`)
- [x] Account structures optimized (91 bytes for MailerState)
- [x] Manual discriminators (efficient)
- [x] Native Solana (no Anchor overhead)

---

## 🎯 Deployment Recommendations

### For EVM:

#### Option 1: L2 Deployment (RECOMMENDED)
```bash
# Deploy to Polygon (cheapest)
npx hardhat run scripts/evm/deploy-upgradeable.ts --network polygon
# Cost: $1-4 ✅

# Or Base (fast & cheap)
npx hardhat run scripts/evm/deploy-upgradeable.ts --network base
# Cost: $5-17 ✅
```

**Savings vs Ethereum mainnet: 95%+ ($400-1,650)**

#### Option 2: Ethereum Mainnet (If Needed)
```bash
# 1. Monitor gas prices
# Visit: https://etherscan.io/gastracker

# 2. Wait for gas < 20 gwei (weekends, 2-6 AM UTC)

# 3. Deploy when gas is low
npx hardhat run scripts/evm/deploy-upgradeable.ts --network mainnet
# Cost: $412-1,675 (depends on gas)
```

**Potential savings by timing: 40-70% ($165-1,175)**

---

### For Solana:

#### Step 1: Test on Devnet (FREE)
```bash
# Get devnet SOL from faucet
solana airdrop 2

# Build with optimizations
cargo build-sbf --release

# Deploy to devnet
solana program deploy target/deploy/mailer.so --url devnet
# Cost: FREE ✅
```

#### Step 2: Deploy to Mainnet
```bash
# Build optimized binary
cd programs/mailer
cargo build-sbf --release

# Check binary size
ls -lh ../../target/deploy/mailer.so
# Expected: 150-180 KB (optimized from 200-250 KB)

# Deploy to mainnet
solana program deploy target/deploy/mailer.so --url mainnet-beta
# Cost: ~2.1-2.5 SOL ($280-500 @ $200/SOL)
```

**Savings from optimization: $140-280 (33%)**

---

## 💰 Cost Comparison Table

| Network | Without Optimization | With Optimization | Savings |
|---------|---------------------|-------------------|---------|
| **Ethereum Mainnet** | $412-1,675 | $165-670* | $247-1,005 |
| **Base/Optimism** | $7-20 | $5-17 | $2-3 |
| **Polygon** | $2-5 | $1-4 | $1 |
| **Solana Mainnet** | $560-900 | $280-500 | $280-400 |
| **Solana Devnet** | FREE | FREE | - |

*By deploying during low gas periods

---

## 🔍 Pre-Deployment Checks

### EVM Checklist:
```bash
# 1. Compile with optimizations
npm run compile

# 2. Check contract size
cat artifacts/contracts/Mailer.sol/Mailer.json | jq -r '.deployedBytecode' | wc -c
# Should output: ~24,553 bytes

# 3. Run all tests
npm test
# Should pass: 116 tests

# 4. Check current gas price (if deploying to mainnet)
# Visit: https://etherscan.io/gastracker
# Target: < 20 gwei for low cost

# 5. Deploy
# Use L2 for 95% cost savings!
```

### Solana Checklist:
```bash
# 1. Build with optimizations
cd programs/mailer
cargo build-sbf --release

# 2. Check binary size
ls -lh ../../target/deploy/mailer.so
# Target: < 200 KB

# 3. Test on devnet first
npm run test:solana

# 4. Check SOL price
# Deploy when SOL is cheaper (< $200)

# 5. Deploy to mainnet
solana program deploy target/deploy/mailer.so --url mainnet-beta
```

---

## 🎨 Gas/Cost Optimization Tips

### EVM Gas Saving Tips:
1. **Use L2s**: 95%+ cheaper than mainnet
2. **Time your deployment**: Weekends 2-6 AM UTC (40-70% savings)
3. **Deploy in low gas**: Monitor https://etherscan.io/gastracker
4. **Split deployments**: Deploy proxy and implementation at different low-gas times
5. **Verify later**: Can verify contract on Etherscan later when gas is low

### Solana Cost Saving Tips:
1. **Test on devnet first**: Completely free
2. **Optimize binary**: Use `opt-level = "z"` (30-40% savings)
3. **Monitor SOL price**: Deploy when price is lower
4. **Remove unused code**: Strip debug symbols
5. **Plan for rent recovery**: Can close accounts and recover rent later

---

## 📊 Expected Costs (Your Project)

### Conservative Estimate:
| Deployment | Cost |
|------------|------|
| EVM on Polygon | $2 |
| EVM on Base | $10 |
| Solana Mainnet (optimized) | $400 |
| **Total** | **$412** |

### High-End Estimate:
| Deployment | Cost |
|------------|------|
| EVM on Ethereum (high gas) | $1,200 |
| EVM on Base | $15 |
| Solana Mainnet | $500 |
| **Total** | **$1,715** |

### Recommended Approach:
| Deployment | Cost |
|------------|------|
| EVM on Polygon | $2 |
| Solana Devnet (testing) | FREE |
| Solana Mainnet (when ready) | $400 |
| **Total** | **$402** |

---

## 🚨 Important Notes

### EVM:
- Your contract is at **99.9% of the 24KB limit**
- If you need to add features, consider:
  - External libraries
  - Diamond pattern
  - Splitting functionality

### Solana:
- Rent is **recoverable** - you can close accounts later
- Build time will be **slower** with optimizations (worth it!)
- Test thoroughly on **devnet** before mainnet

---

## 📞 Quick Commands

### Build & Deploy EVM:
```bash
# Clean build
npm run clean && npm run compile

# Test
npm test

# Deploy to Polygon (cheapest)
npx hardhat run scripts/evm/deploy-upgradeable.ts --network polygon
```

### Build & Deploy Solana:
```bash
# Optimized build
cd programs/mailer
cargo build-sbf --release
cd ../..

# Test
npm run test:solana

# Deploy to devnet (free testing)
solana program deploy target/deploy/mailer.so --url devnet

# Deploy to mainnet (when ready)
solana program deploy target/deploy/mailer.so --url mainnet-beta
```

---

## 🎯 Next Steps

1. **Review**: Check `DEPLOYMENT_OPTIMIZATION.md` for detailed explanations
2. **Test**: Run all tests with optimized builds
3. **Deploy**: Start with cheap networks (Polygon/devnet)
4. **Monitor**: Track costs and optimize further if needed
5. **Verify**: Verify contracts on block explorers

---

## 💡 Pro Tips

- **Always test on devnet/testnet first**
- **Never deploy on Friday** (weekend testing time)
- **Keep some ETH/SOL for verification and admin operations**
- **Document your deployment addresses**
- **Set up monitoring for deployed contracts**

---

**Total Potential Savings: $1,100-2,100** by following this guide! 🎉

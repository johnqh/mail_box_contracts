# mail_box_contracts - AI Development Guide

## Overview

Multi-chain decentralized messaging system published as `@sudobility/contracts`. Supports EVM chains (Ethereum, Polygon, Optimism, Base, Arbitrum, Avalanche, BSC, and more) and Solana with USDC-based fees, revenue sharing, delegation management, and a unified TypeScript client. The system uses a two-tier fee model (Priority and Standard) with a 90/10 revenue split and 60-day claim periods.

- **Package**: `@sudobility/contracts` v1.17.63
- **License**: BUSL-1.1
- **Package manager**: Bun
- **Node requirement**: >=20.18.0

## Project Structure

```
mail_box_contracts/
├── contracts/                      # EVM smart contracts (Solidity 0.8.24)
│   ├── Mailer.sol                  # Core messaging contract (UUPS upgradeable)
│   ├── MockUSDC.sol                # Mock ERC20 token for testing (6 decimals)
│   ├── interfaces/
│   │   ├── IERC20.sol              # Minimal ERC20 interface
│   │   └── IMailer.sol             # Mailer interface for CPI
│   └── examples/                   # Integration example contracts
├── programs/                       # Solana programs (Rust, native - no Anchor)
│   ├── mailer/
│   │   ├── Cargo.toml              # solana-program 1.16, borsh 1.5, spl-token 3.5
│   │   ├── src/
│   │   │   ├── lib.rs              # Full program: state, instructions, processing
│   │   │   └── cpi.rs              # Cross-program invocation helpers
│   │   └── tests/
│   │       └── integration_tests.rs
│   └── mailer-integration-example/ # CPI integration example
├── src/                            # TypeScript client library
│   ├── index.ts                    # Root re-exports (unified + EVM + Solana + utils)
│   ├── unified/
│   │   ├── index.ts                # Exports OnchainMailerClient, WalletDetector, types
│   │   ├── onchain-mailer-client.ts # Stateless multi-chain client (dynamic imports)
│   │   ├── wallet-detector.ts      # Auto-detect EVM vs Solana wallet/address
│   │   └── types.ts                # UnifiedTransaction, Wallet, ChainConfig types
│   ├── evm/
│   │   ├── index.ts                # Exports EVMMailerClient, Mailer__factory, types
│   │   └── evm-mailer-client.ts    # Stateless EVM client (viem-based)
│   ├── solana/
│   │   ├── index.ts                # Exports SolanaMailerClient, types
│   │   ├── solana-mailer-client.ts # Stateless Solana client (@solana/web3.js)
│   │   └── types.ts                # ClaimableInfo, MailerFees, DelegationInfo
│   ├── react/
│   │   ├── index.ts                # Exports MailerProvider, hooks (queries + mutations)
│   │   ├── context/
│   │   │   └── MailerProvider.tsx   # React Context wrapping OnchainMailerClient
│   │   └── hooks/
│   │       ├── useMailerQueries.ts  # TanStack React Query hooks (fees, claims, state)
│   │       └── useMailerMutations.ts # Mutation hooks (send, claim, delegate, etc.)
│   ├── react-native/
│   │   ├── index.ts                # Re-exports with RN-compatible paths
│   │   └── polyfills.ts            # Buffer, URL, crypto polyfills for RN
│   ├── types/
│   │   └── common.ts               # Shared types: Message, FeeStructure, ChainType, etc.
│   └── utils/
│       ├── index.ts                # Re-exports validation + chain-config
│       ├── chain-config.ts         # NETWORK_CONFIGS, createChainConfig()
│       ├── validation.ts           # validateDomain, validateMessage, validateAddress, validateAmount
│       └── currency.ts             # USDC_DECIMALS, formatUSDC, parseUSDC
├── test/
│   ├── evm/
│   │   ├── Mailer.test.ts          # Main EVM test suite (~75 tests)
│   │   ├── Mailer.upgrade.test.ts  # UUPS upgrade tests
│   │   └── MailerIntegration.test.ts
│   └── unified/
│       ├── stateless-client.test.ts # OnchainMailerClient tests
│       ├── validation.test.ts       # Validation utility tests
│       └── wallet-detector.test.ts  # WalletDetector tests
├── scripts/
│   ├── evm/
│   │   ├── deploy.ts               # Standard EVM deployment
│   │   ├── deploy-upgradeable.ts   # UUPS proxy deployment
│   │   ├── upgrade.ts              # Contract upgrade script
│   │   └── verify.ts               # Etherscan verification
│   ├── solana/
│   │   ├── init-native.ts          # Initialize Solana program state
│   │   ├── upgrade.ts              # Program upgrade
│   │   └── manage-upgrade-authority.ts
│   └── unified/
│       └── deploy-all.ts           # Multi-chain deployment orchestrator
├── examples/                       # Usage examples
│   ├── evm-usage.ts                # EVM-specific example
│   ├── solana-usage.ts             # Solana-specific example
│   ├── unified-usage.ts            # Cross-chain unified example
│   ├── react-usage.tsx             # React hooks example
│   ├── stateless-usage.ts          # Stateless client pattern
│   ├── gas-estimation-demo.ts      # EVM gas optimization
│   ├── solana-compute-units-demo.ts # Solana compute unit optimization
│   ├── wagmi-integration.ts        # wagmi library integration
│   └── wallet-adapter-integration.ts # Solana wallet adapter integration
├── typechain-types/                # Auto-generated TS types from Solidity (ethers-v6)
├── deployments/                    # Deployment address records per network
├── artifacts/                      # Compiled contract artifacts
├── dist/                           # Built output (unified + react-native targets)
├── hardhat.config.cts              # Hardhat config (multi-network, Alchemy, Etherscan)
├── Cargo.toml                      # Workspace Cargo config
├── tsconfig.unified.json           # TS config for unified build (ESNext, node10 resolution)
├── tsconfig.react-native.json      # TS config for React Native build
├── tsconfig.evm.json               # TS config for EVM-only build
├── tsconfig.solana.json            # TS config for Solana-only build
├── DEPLOYED.json                   # Deployment tracking with addresses and features
└── .env / .env.local               # Environment variables (API keys, private keys)
```

## Key Exports

The package exposes multiple entry points via the `exports` field in package.json:

| Entry point | Import path | Contents |
|---|---|---|
| Default / Node / Browser | `@sudobility/contracts` | `OnchainMailerClient`, `WalletDetector`, unified types |
| EVM | `@sudobility/contracts/evm` | `EVMMailerClient`, `Mailer__factory`, `Mailer` type |
| Solana | `@sudobility/contracts/solana` | `SolanaMailerClient`, `SolanaWallet`, Solana types |
| React | `@sudobility/contracts/react` | `MailerProvider`, query hooks, mutation hooks |
| React Native | `@sudobility/contracts/react-native` | Same as unified + polyfills |
| Web | `@sudobility/contracts/web` | Same as unified |

### OnchainMailerClient (unified)

Stateless multi-chain client. No constructor config needed. Uses dynamic imports to lazy-load the EVM or Solana client based on `chainInfo.chainType`. Key methods:

- `sendMessage(wallet, chainInfo, subject, body, options?)` -- send inline message
- `sendPrepared(wallet, chainInfo, to, mailId, options?)` -- send with off-chain content ref
- `sendThroughWebhook(wallet, chainInfo, to, webhookId, options?)` -- webhook-triggered send
- `sendToEmailAddress(wallet, chainInfo, toEmail, subject, body, options?)` -- send to email
- `sendPreparedToEmailAddress(wallet, chainInfo, toEmail, mailId, options?)` -- prepared to email
- `delegateTo(wallet, chainInfo, delegate, options?)` -- set delegation (costs 10 USDC)
- `rejectDelegation(wallet, chainInfo, delegatingAddress, options?)` -- reject incoming delegation
- `claimRevenue(wallet, chainInfo, options?)` -- claim 90% revenue share
- `claimOwnerShare(wallet, chainInfo, options?)` -- owner claims accumulated fees
- `claimExpiredShares(wallet, chainInfo, recipient, options?)` -- owner reclaims expired shares
- `setFees(wallet, chainInfo, sendFee, delegationFee?, options?)` -- owner sets fees
- `setFeePaused(wallet, chainInfo, paused, options?)` -- toggle fee collection
- `setCustomFeePercentage(wallet, chainInfo, account, percentage, options?)` -- per-address discount
- `pause(wallet, chainInfo, options?)` / `unpause(...)` / `emergencyUnpause(...)`
- `setPermission(wallet, chainInfo, contractAddress, options?)` -- authorize contract to send on behalf
- `removePermission(wallet, chainInfo, contractAddress, options?)`
- `getSendFee(chainInfo)` / `getDelegationFee(chainInfo)` / `getRecipientClaimable(chainInfo, address)` / `getOwnerClaimable(chainInfo)` / `getDelegation(chainInfo, address)` / `isPaused(chainInfo)` / `getOwner(chainInfo)` / `getCustomFeePercentage(chainInfo, address)` / `hasPermission(chainInfo, contract, wallet)`

### Contract ABIs

- `Mailer__factory` from `@sudobility/contracts/evm` -- contains `.abi` and `.bytecode` (generated by TypeChain from ethers-v6)
- `Mailer` type -- fully typed contract interface

### Solana Client

- `SolanaMailerClient` -- stateless, all methods take `(wallet, chainInfo, ...)` parameters
- Program ID: `9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF`
- Uses Borsh serialization, native `solana-program` (no Anchor)

## Smart Contracts

### EVM -- Mailer.sol (Solidity 0.8.24)

**Architecture**: UUPS upgradeable proxy pattern (OpenZeppelin v5.4)

- Inherits: `Initializable`, `OwnableUpgradeable`, `UUPSUpgradeable`
- Compiler: solc 0.8.24, optimizer 200 runs

**Storage layout** (gas-optimized, 2 slots for all scalars):
- Slot 0: `sendFee` (uint128, default 100000 = 0.1 USDC) + `delegationFee` (uint128, default 10000000 = 10 USDC)
- Slot 1: `ownerClaimable` (uint128) + `_status` (uint8) + `paused` (bool) + `feePaused` (bool)
- `ClaimableAmount` struct: `amount` (uint192) + `timestamp` (uint64) = 1 slot

**Mappings**:
- `recipientClaims`: address => ClaimableAmount (90% revenue shares)
- `customFeeDiscount`: address => uint8 (0-100 discount percentage)
- `permissions`: address => address => bool (contract-to-wallet authorization)

**Fee model**:
- Priority (revenueShareToReceiver=true): payer pays full `sendFee` (0.1 USDC), receiver gets 90% claimable within 60 days
- Standard (revenueShareToReceiver=false): payer pays 10% of `sendFee` (0.01 USDC), no revenue share
- Delegation: 10 USDC flat fee
- Custom discounts: per-address 0-100% discount off base fee

**Soft-fail behavior**: `send`, `sendPrepared`, `sendToEmailAddress`, `sendPreparedToEmailAddress`, `sendThroughWebhook` do NOT revert on fee payment failure. They emit the event with `feePaid=false`. This enables composability with other contracts.

**Key functions**:
- `initialize(address _usdcToken, address _owner)` -- proxy initializer
- `send(to, subject, body, payer, revenueShareToReceiver, resolveSenderToName)`
- `sendPrepared(to, mailId, payer, revenueShareToReceiver, resolveSenderToName)`
- `sendToEmailAddress(toEmail, subject, body, payer)`
- `sendPreparedToEmailAddress(toEmail, mailId, payer)`
- `sendThroughWebhook(to, webhookId, payer, revenueShareToReceiver, resolveSenderToName)`
- `claimRecipientShare()` / `claimOwnerShare()` / `claimExpiredShares(recipient)`
- `delegateTo(delegate)` / `rejectDelegation(delegatingAddress)`
- `setFee(usdcAmount)` / `setDelegationFee(usdcAmount)` / `setCustomFeePercentage(account, percentage)` / `clearCustomFeePercentage(account)`
- `setPermission(contractAddress)` / `removePermission(contractAddress)`
- `pause()` / `unpause()` / `emergencyUnpause()` / `setFeePaused(bool)` / `distributeClaimableFunds(recipient)`

**Events**: `MailSent`, `PreparedMailSent`, `MailSentToEmail`, `PreparedMailSentToEmail`, `WebhookMailSent`, `FeeUpdated`, `SharesRecorded`, `RecipientClaimed`, `OwnerClaimed`, `ExpiredSharesClaimed`, `DelegationSet`, `DelegationFeeUpdated`, `ContractPaused`, `ContractUnpaused`, `EmergencyUnpaused`, `FeePauseToggled`, `FundsDistributed`, `CustomFeePercentageSet`, `PermissionGranted`, `PermissionRevoked`

**Custom errors**: `OnlyOwner`, `NoClaimableAmount`, `ClaimPeriodNotExpired`, `FeePaymentRequired`, `TransferFailed`, `ReentrancyGuard`, `InvalidAddress`, `MathOverflow`, `ContractIsPaused`, `ContractNotPaused`, `InvalidPercentage`, `UnpermittedPayer`

### Solana -- Native Mailer Program (Rust)

**Architecture**: Native Solana program (no Anchor framework), uses Borsh serialization.

**Program state accounts** (PDAs):
- `MailerState` [seed: `b"mailer"`]: owner, usdc_mint, send_fee, delegation_fee, owner_claimable, paused, fee_paused, bump (91 bytes)
- `RecipientClaim` [seed: `b"claim", &[1], recipient`]: recipient, amount, timestamp, bump (49 bytes)
- `Delegation` [seed: `b"delegation", &[1], delegator`]: delegator, delegate (Option), bump (66 bytes)
- `FeeDiscount` [seed: `b"discount", &[1], account`]: account, discount (0-100), bump (34 bytes)

PDA version byte (`PDA_VERSION = 1`) used for forward compatibility.

**Instructions** (enum `MailerInstruction`):
- `Initialize { usdc_mint }` -- set up program state
- `Send { to, subject, _body, revenue_share_to_receiver, resolve_sender_to_name }` -- inline message
- `SendPrepared { to, mail_id, revenue_share_to_receiver, resolve_sender_to_name }` -- prepared message
- `SendToEmail { to_email, subject, _body }` -- email recipient
- `SendPreparedToEmail { to_email, mail_id }` -- prepared email
- `SendThroughWebhook { to, webhook_id, revenue_share_to_receiver, resolve_sender_to_name }`
- `DelegateTo { delegate }` / `RejectDelegation { delegating_address }`
- `ClaimRecipientShare` / `ClaimOwnerShare` / `ClaimExpiredShares { recipient }`
- `SetFees { send_fee, delegation_fee }` / `SetCustomFeePercentage { account, percentage }` / `ClearCustomFeePercentage { account }`
- `Pause` / `Unpause` / `EmergencyUnpause` / `SetFeePaused { fee_paused }`
- `DistributeClaimableFunds { recipient }`

Same soft-fail behavior as EVM: fee payment failure does not cause program error.

**Crate features**: `cpi` (enables cross-program invocation module), `no-entrypoint` (library mode)

## Development Commands

```bash
# Install dependencies
bun install

# Compile EVM contracts (generates typechain-types/)
bun run compile              # alias for compile:evm
bun run compile:evm          # npx hardhat compile
bun run compile:solana       # anchor build

# Build all targets
bun run build                # build:evm + build:solana + build:unified + build:react-native
bun run build:evm            # hardhat compile + tsc (tsconfig.evm.json)
bun run build:solana         # cargo build + tsc (tsconfig.solana.json)
bun run build:unified        # tsc (tsconfig.unified.json) -> dist/unified/
bun run build:react-native   # tsc (tsconfig.react-native.json) -> dist/react-native/
bun run build:ci             # build:unified + build:react-native (no compile step)

# Run tests
bun test                     # test:evm + test:solana + test:unified:direct
bun run test:evm             # Hardhat test via tsx (test/evm/Mailer.test.ts)
bun run test:solana          # cargo test in programs/mailer/
bun run test:unified:direct  # node scripts/run-unified-tests.mjs
bun run test:ci              # build:unified + test:unified:direct

# Deploy EVM contracts
bun run deploy:evm:localhost     # Local Hardhat node
bun run deploy:evm:sepolia       # Sepolia testnet
bun run deploy:evm:mainnet       # Ethereum mainnet
bun run deploy:evm:polygon       # Polygon
bun run deploy:evm:optimism      # Optimism
bun run deploy:evm:base          # Base
bun run deploy:evm:arbitrum      # Arbitrum
# ... and many more (BSC, Fantom, zkSync, Linea, Scroll, Mantle, Gnosis, Moonbeam, Celo)

# Deploy Solana program
bun run deploy:solana:local      # anchor deploy --provider.cluster localnet
bun run deploy:solana:devnet     # anchor deploy --provider.cluster devnet
bun run deploy:solana:mainnet    # anchor deploy --provider.cluster mainnet-beta

# UUPS upgradeable deployment (EVM)
npx hardhat run scripts/evm/deploy-upgradeable.ts --network sepolia
PROXY_ADDRESS=0x... npx hardhat run scripts/evm/upgrade.ts --network sepolia

# Verify on block explorers
bun run verify:evm:mainnet       # Etherscan verification
bun run verify:evm:sepolia
bun run verify:evm:polygon
bun run verify:evm:base
# ... (available for all supported networks)

# Lint, format, type-check
bun run lint                 # ESLint (excludes examples/)
bun run lint:fix
bun run lint:md              # Markdown lint
bun run typecheck            # tsc --noEmit
bun run format               # Prettier
bun run format:check

# Clean
bun run clean                # npx hardhat clean

# Security
bun run security:audit       # bash scripts/security-audit.sh

# Contract size check
bash scripts/check-contract-size.sh
```

## Architecture / Patterns

### Multi-chain stateless client

`OnchainMailerClient` is fully stateless -- no constructor config, no stored wallet references. Every method receives `(wallet, chainInfo, ...)` as parameters. Internally it lazy-loads `EVMMailerClient` or `SolanaMailerClient` via dynamic `import()` and caches them as static class properties. This pattern:
- Avoids bundling both chain implementations when only one is needed
- Supports tree-shaking in bundlers
- Makes the client safe for server-side and multi-tenant usage

### Wallet type detection

`WalletDetector.detectWalletType(wallet)` inspects the wallet object shape to determine EVM vs Solana:
- Solana: has `publicKey` + `signTransaction`, no `address`
- EVM: has `address` + `request`, no `publicKey`
- Also detects from address format: `isEVMAddress()` / `isSolanaAddress()`

### EVM contract interaction (viem)

`EVMMailerClient` uses **viem** (not ethers) for all blockchain interactions. The ABI and bytecode come from `Mailer__factory` (generated by TypeChain with ethers-v6 target, but the ABI is format-agnostic). Gas estimation with configurable multiplier (default 1.2x) is built in via `GasOptions`.

### Solana instruction building

`SolanaMailerClient` manually constructs `TransactionInstruction` objects with Borsh-serialized data. Compute unit optimization via `ComputeUnitOptions` with auto-simulate capability. Uses `getAssociatedTokenAddressSync` for USDC token accounts.

### UUPS upgradeable proxy (EVM)

Contracts deploy behind ERC1967 proxies. The proxy address is stable; the implementation can be upgraded by the owner via `_authorizeUpgrade`. Storage layout is preserved across upgrades. The `deploy-upgradeable.ts` script handles proxy creation, and `upgrade.ts` handles implementation replacement.

### React integration

React hooks are built on TanStack React Query v5. Two patterns:
1. **Grouped hooks** (preferred): `useFees()`, `useClaimableAmounts()`, `useDelegationAndPermissions()`, `useContractState()`, `useMessaging()`, `useClaims()`, `useDelegation()`, `usePermissions()`, `useContractControl()`, `useOwnerOperations()`
2. **Legacy individual hooks** (deprecated): `useGetSendFee()`, `useSendMessage()`, etc.

`MailerProvider` wraps the app with `OnchainMailerClient` context.

### React Native support

Dedicated build target with polyfills for `Buffer`, `URL`, and `crypto.getRandomValues`. Import polyfills before any other imports:
```typescript
import '@sudobility/contracts/react-native/polyfills';
import { OnchainMailerClient } from '@sudobility/contracts/react-native';
```

### Soft-fail fee pattern

Both EVM and Solana implementations use a soft-fail pattern for fee processing. If USDC transfer fails (insufficient balance, no approval), the transaction does NOT revert. Instead, the event/log is emitted with `feePaid=false`. This is designed for composability so calling contracts do not fail when message fees cannot be collected.

### Permission system (EVM)

Smart contracts can send messages through the Mailer. A wallet calls `setPermission(contractAddress)` to authorize that contract to send messages while the wallet pays fees. The `permissions[contractAddress][walletAddress]` mapping tracks this. When `msg.sender` is a contract, the `payer` parameter must be an authorized wallet.

## Common Tasks

### Deploying to a new EVM chain

1. Add network config in `hardhat.config.cts` (RPC URL, chain ID, accounts)
2. Add Etherscan API key for verification in the `etherscan.apiKey` section
3. Add deploy/verify scripts in `package.json` if not already present
4. Set environment variables in `.env.local`: `EVM_PRIVATE_KEY`, `ALCHEMY_API_KEY`, relevant `*_RPC_URL`
5. Run: `npx hardhat run scripts/evm/deploy-upgradeable.ts --network <name>`
6. Verify: `npx hardhat run scripts/evm/verify.ts --network <name>`
7. Update `DEPLOYED.json` and `deployments/` with new addresses

### Adding a new contract function (EVM)

1. Add the function to `contracts/Mailer.sol` with NatSpec documentation
2. Run `bun run compile` to regenerate typechain-types
3. Add corresponding method to `src/evm/evm-mailer-client.ts`
4. Add corresponding method to `src/unified/onchain-mailer-client.ts`
5. Add tests in `test/evm/Mailer.test.ts`
6. Run `bun test` to verify

### Adding a new Solana instruction

1. Add new variant to `MailerInstruction` enum in `programs/mailer/src/lib.rs`
2. Add handler function and wire it in `process_instruction`
3. Run `bun run test:solana` (cargo test)
4. Add corresponding method to `src/solana/solana-mailer-client.ts`
5. Add corresponding method to `src/unified/onchain-mailer-client.ts`

### Upgrading a deployed EVM contract

1. Make changes to `Mailer.sol` (preserve storage layout -- never reorder or remove existing storage variables)
2. Run `bun run compile` and `bun test`
3. Set `PROXY_ADDRESS` env variable to the deployed proxy address
4. Run: `PROXY_ADDRESS=0x... npx hardhat run scripts/evm/upgrade.ts --network <name>`

### Adding React hooks for a new feature

1. Add query hook in `src/react/hooks/useMailerQueries.ts` (for read operations)
2. Add mutation hook in `src/react/hooks/useMailerMutations.ts` (for write operations)
3. Export from `src/react/index.ts`
4. Follow the grouped hook pattern (e.g., add to `useFees()` or create a new group)

### Testing patterns

```typescript
// Fund test accounts with MockUSDC
await mockUSDC.mint(addr1.address, ethers.parseUnits("100", 6));
await mockUSDC.connect(addr1).approve(contractAddress, ethers.parseUnits("100", 6));

// Test with event verification
await expect(contract.connect(addr1).send(to, "subject", "body", addr1.address, true, false))
  .to.emit(contract, "MailSent")
  .withArgs(addr1.address, addr1.address, to, "subject", "body", true, false, true);

// Fee calculation verification
const initialBalance = await mockUSDC.balanceOf(contractAddress);
await contract.someFunction();
const finalBalance = await mockUSDC.balanceOf(contractAddress);
expect(finalBalance - initialBalance).to.equal(expectedFee);
```

## Key Dependencies

### Runtime (dependencies)

| Package | Purpose |
|---|---|
| `@openzeppelin/contracts` ^5.4.0 | ERC20, upgradeable base contracts |
| `@sudobility/configs` ^0.0.63 | Chain configuration, RPC helpers, ChainInfo type |
| `@sudobility/types` ^1.9.51 | Shared types: ChainType, Chain enum, validation functions |

### Peer dependencies (optional, consumer-provided)

| Package | Purpose |
|---|---|
| `viem` >=2.0.0 | EVM blockchain interaction (used by EVMMailerClient) |
| `@solana/web3.js` >=1.95.0 | Solana interaction (used by SolanaMailerClient) |
| `@solana/spl-token` >=0.4.0 | SPL token operations (USDC transfers on Solana) |
| `@sudobility/mail_box_types` ^1.0.10 | Response types: MessageSendResponse, etc. |
| `react` ^18 or ^19 | React hooks integration |
| `@tanstack/react-query` >=5.0.0 | React Query hooks |
| `react-native` >=0.70.0 | React Native support |

### Dev dependencies (key ones)

| Package | Purpose |
|---|---|
| `hardhat` ^2.26.3 | EVM development framework |
| `@nomicfoundation/hardhat-viem` ^2.0.0 | Hardhat viem plugin |
| `@openzeppelin/hardhat-upgrades` ^3.9.1 | UUPS proxy deployment/upgrades |
| `@typechain/hardhat` ^9.1.0 | TypeScript type generation from ABIs |
| `ethers` ^6.16.0 | Used by Hardhat tests (not the client library) |
| `typescript` ^5.9.3 | TypeScript compiler |
| `mocha` ^11.7.4 | Test runner (unified tests) |
| `chai` ^4.5.0 | Assertion library |
| `tsx` ^4.21.0 | TypeScript execution for Hardhat tests |

### Solana program dependencies (Cargo.toml)

| Crate | Version | Purpose |
|---|---|---|
| `solana-program` | 1.16 | Solana runtime interface |
| `spl-token` | 3.5 | SPL token program interface |
| `borsh` | 1.5 | Binary serialization |
| `thiserror` | 1.0 | Error derive macros |

# Testing Patterns for MailBox Multi-Chain System

## 🎯 Overview
Comprehensive testing patterns for the multi-chain messaging system covering EVM contracts, Solana programs, and unified client functionality.

## 🧪 EVM Testing Patterns

### Basic Test Setup
```typescript
describe('EVM Feature', () => {
  let contract: Mailer;
  let mockUSDC: MockUSDC;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;

  beforeEach(async () => {
    [owner, addr1] = await ethers.getSigners();
    
    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    
    // Deploy main contract
    const Mailer = await ethers.getContractFactory("Mailer");
    contract = await Mailer.deploy(mockUSDC.address, owner.address);
    
    // Fund test accounts
    await mockUSDC.mint(addr1.address, ethers.parseUnits("1000", 6));
    await mockUSDC.connect(addr1).approve(contract.address, ethers.parseUnits("100", 6));
  });
});
```

### Event Testing Pattern
```typescript
it('Should emit correct events', async () => {
  await expect(contract.connect(addr1).sendPriority("Subject", "Body"))
    .to.emit(contract, "MailSent")
    .withArgs(addr1.address, addr1.address, "Subject", "Body");
});
```

### Fee Calculation Testing
```typescript
it('Should transfer correct fee amounts', async () => {
  const initialBalance = await mockUSDC.balanceOf(contract.address);
  
  await contract.connect(addr1).sendPriority("Subject", "Body");
  
  const finalBalance = await mockUSDC.balanceOf(contract.address);
  const expectedFee = ethers.parseUnits("0.1", 6); // 0.1 USDC
  
  expect(finalBalance - initialBalance).to.equal(expectedFee);
});
```

### Revenue Sharing Testing
```typescript
it('Should handle revenue sharing correctly', async () => {
  // Send priority message
  await contract.connect(addr1).sendPriority("Subject", "Body");
  
  // Check claimable amount (90% of fee)
  const claimable = await contract.getRecipientClaimable(addr1.address);
  const expectedClaimable = ethers.parseUnits("0.09", 6); // 90% of 0.1 USDC
  
  expect(claimable.amount).to.equal(expectedClaimable);
  expect(claimable.isExpired).to.be.false;
});
```

### Time-based Testing
```typescript
it('Should handle claim expiration', async () => {
  await contract.connect(addr1).sendPriority("Subject", "Body");
  
  // Fast forward 61 days
  await network.provider.send("evm_increaseTime", [61 * 24 * 60 * 60]);
  await network.provider.send("evm_mine");
  
  const claimable = await contract.getRecipientClaimable(addr1.address);
  expect(claimable.isExpired).to.be.true;
});
```

## 🦀 Solana Testing Patterns (Conceptual)

### Basic Program Test Setup
```typescript
describe('Solana Program', () => {
  let program: Program<MailService>;
  let provider: AnchorProvider;
  
  beforeEach(async () => {
    provider = AnchorProvider.env();
    anchor.setProvider(provider);
    
    program = anchor.workspace.MailService as Program<MailService>;
  });
});
```

### Account Initialization Test
```typescript
it('Should initialize service account', async () => {
  const [mailServicePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mail_service")],
    program.programId
  );
  
  await program.methods
    .initialize(usdcMint)
    .accounts({
      mailService: mailServicePda,
      owner: provider.wallet.publicKey,
    })
    .rpc();
    
  const serviceAccount = await program.account.mailServiceState.fetch(mailServicePda);
  expect(serviceAccount.owner.toString()).to.equal(provider.wallet.publicKey.toString());
});
```

## 🔗 Unified Client Testing Patterns

### Chain Detection Testing
```typescript
describe('WalletDetector', () => {
  it('should detect EVM wallet correctly', () => {
    const evmWallet = {
      address: '0x1234567890123456789012345678901234567890',
      request: async () => {},
      signTransaction: async (tx: any) => tx
    };
    
    expect(WalletDetector.detectWalletType(evmWallet)).to.equal('evm');
  });
  
  it('should detect Solana wallet correctly', () => {
    const solanaKeypair = Keypair.generate();
    const solanaWallet = new Wallet(solanaKeypair);
    
    expect(WalletDetector.detectWalletType(solanaWallet)).to.equal('solana');
  });
});
```

### Unified Client Routing Tests
```typescript
describe('UnifiedMailBoxClient', () => {
  it('should route to EVM implementation', async () => {
    const evmClient = new UnifiedMailBoxClient(evmWallet, testConfig);
    
    expect(evmClient.getChainType()).to.equal('evm');
    
    // Mock the EVM implementation to verify routing
    const spy = jest.spyOn(evmClient as any, 'sendEVMMessage');
    
    await evmClient.sendMessage('Test', 'Body', true);
    
    expect(spy).toHaveBeenCalledWith('Test', 'Body', true);
  });
  
  it('should route to Solana implementation', async () => {
    const solanaClient = new UnifiedMailBoxClient(solanaWallet, testConfig);
    
    expect(solanaClient.getChainType()).to.equal('solana');
    
    // Mock the Solana implementation to verify routing
    const spy = jest.spyOn(solanaClient as any, 'sendSolanaMessage');
    
    await solanaClient.sendMessage('Test', 'Body', true);
    
    expect(spy).toHaveBeenCalledWith('Test', 'Body', true);
  });
});
```

### Address Validation Testing
```typescript
describe('Address Validation', () => {
  it('should validate EVM addresses correctly', () => {
    const validEVMAddress = '0x1234567890123456789012345678901234567890';
    const invalidEVMAddress = '0x123'; // too short
    
    expect(WalletDetector.isEVMAddress(validEVMAddress)).to.be.true;
    expect(WalletDetector.isEVMAddress(invalidEVMAddress)).to.be.false;
  });
  
  it('should validate Solana addresses correctly', () => {
    const validSolanaAddress = 'DQf2W8p7L5Q8r3K1mN6x9V7z2B4c3H8j5E6nYpRtUiOp';
    const invalidSolanaAddress = '123invalid';
    
    expect(WalletDetector.isSolanaAddress(validSolanaAddress)).to.be.true;
    expect(WalletDetector.isSolanaAddress(invalidSolanaAddress)).to.be.false;
  });
});
```

### Error Handling Testing
```typescript
describe('Error Handling', () => {
  it('should handle insufficient balance gracefully', async () => {
    // Don't fund the account or approve
    const unfundedClient = new UnifiedMailBoxClient(unfundedWallet, testConfig);
    
    await expect(unfundedClient.sendMessage('Test', 'Body', true))
      .to.be.rejectedWith('Insufficient USDC balance');
  });
  
  it('should handle invalid address formats', async () => {
    const client = new UnifiedMailBoxClient(evmWallet, testConfig);
    
    await expect(client.delegateTo('invalid-address'))
      .to.be.rejectedWith('Invalid EVM address format');
  });
  
  it('should handle network timeouts', async () => {
    // Mock network delay
    jest.setTimeout(15000);
    
    const client = new UnifiedMailBoxClient(wallet, {
      ...testConfig,
      evm: { ...testConfig.evm, rpc: 'http://localhost:9999' } // non-existent RPC
    });
    
    await expect(client.sendMessage('Test', 'Body', true))
      .to.be.rejectedWith('Connection timeout');
  });
});
```

## 🎨 Test Utilities and Helpers

### Mock Wallet Factory
```typescript
export const createMockEVMWallet = (address?: string) => ({
  address: address || '0x1234567890123456789012345678901234567890',
  request: async () => {},
  signTransaction: async (tx: any) => tx
});

export const createMockSolanaWallet = () => {
  const keypair = Keypair.generate();
  return new Wallet(keypair);
};
```

### Test Configuration Factory
```typescript
export const createTestConfig = (overrides?: Partial<ChainConfig>): ChainConfig => ({
  evm: {
    rpc: 'http://localhost:8545',
    chainId: 31337,
    contracts: {
      mailService: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      mailer: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      usdc: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'
    }
  },
  solana: {
    rpc: 'http://localhost:8899',
    programs: {
      mailService: 'MailServ1ceProgram1d1111111111111111111111111',
      mailer: 'Mailer1Program1d1111111111111111111111111111',
      mailBoxFactory: 'Factory1Program1d111111111111111111111111'
    },
    usdcMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
  },
  ...overrides
});
```

### Assertion Helpers
```typescript
export const expectUSDCTransfer = async (
  token: MockUSDC,
  from: string,
  to: string,
  amount: bigint,
  operation: () => Promise<any>
) => {
  const initialFromBalance = await token.balanceOf(from);
  const initialToBalance = await token.balanceOf(to);
  
  await operation();
  
  const finalFromBalance = await token.balanceOf(from);
  const finalToBalance = await token.balanceOf(to);
  
  expect(initialFromBalance - finalFromBalance).to.equal(amount);
  expect(finalToBalance - initialToBalance).to.equal(amount);
};
```

## 📊 Test Coverage Guidelines

### Required Test Categories
1. **Happy Path Tests**: Normal successful operations
2. **Error Cases**: Invalid inputs, insufficient funds, network errors
3. **Edge Cases**: Boundary conditions, zero amounts, address validation
4. **Security Tests**: Unauthorized access, reentrancy protection
5. **Integration Tests**: Cross-chain functionality, wallet detection
6. **Performance Tests**: Timeout handling, large data processing

### Test Organization
```
test/
├── evm/                    # EVM-specific tests
│   ├── Mailer.test.ts     # 54 tests - messaging functionality
│   ├── MailService.test.ts # 27 tests - delegation management
│   └── MailBoxClient.test.ts # Client wrapper tests
├── solana/                 # Solana-specific tests  
│   ├── mailer.test.ts     # Program functionality tests
│   └── types-utils.test.ts # Type and utility tests
└── unified/                # Cross-chain tests
    ├── mailbox-client.test.ts # Unified client tests
    ├── wallet-detector.test.ts # Wallet detection tests
    └── validation.test.ts   # Cross-chain validation tests
```

### Success Criteria
- **EVM Tests**: 105+ tests passing (comprehensive contract coverage)
- **Unified Tests**: 30+ tests passing (cross-chain functionality)
- **Integration Tests**: All deployment and verification scripts working
- **Error Coverage**: All error conditions tested and handled gracefully
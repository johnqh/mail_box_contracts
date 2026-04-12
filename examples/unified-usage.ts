/**
 * @title Unified Multi-Chain Usage Examples for Mailer Contracts
 * @description Comprehensive examples showing how to use the unified Mailer client
 * @notice Demonstrates automatic chain detection and seamless cross-chain functionality
 */

import { OnchainMailerClient, WalletDetector } from '../src/unified';
import { DEFAULT_CHAIN_CONFIG, TESTNET_CHAIN_CONFIG } from '../src/utils';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Wallet } from '../src/solana';

// Simple wallet wrapper for Keypair
function createWallet(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction>(tx: T): Promise<T> => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction>(
      txs: T[]
    ): Promise<T[]> => {
      txs.forEach(tx => tx.partialSign(keypair));
      return txs;
    },
  };
}

async function unifiedUsageExamples() {
  console.log('🚀 Mailer Unified Multi-Chain Client - Usage Examples');

  // ===== EXAMPLE 1: Automatic Wallet Detection =====
  console.log('\n🔍 Example 1: Automatic Wallet Detection');

  // Mock EVM wallet (MetaMask-like)
  const evmWallet = {
    address: '0x1234567890123456789012345678901234567890',
    request: async () => {},
    signTransaction: async (tx: any) => tx,
  };

  // Mock Solana wallet (Phantom-like)
  const solanaKeypair = Keypair.generate();
  const solanaWallet = createWallet(solanaKeypair);

  console.log(
    '🔍 EVM wallet detected as:',
    WalletDetector.detectWalletType(evmWallet)
  );
  console.log(
    '🔍 Solana wallet detected as:',
    WalletDetector.detectWalletType(solanaWallet)
  );

  // ===== EXAMPLE 2: Unified Client with Solana =====
  console.log('\n🌐 Example 2: Unified Client with Solana Wallet');

  try {
    const unifiedClient = new OnchainMailerClient(
      solanaWallet,
      TESTNET_CHAIN_CONFIG
    );
    console.log(
      '✅ Unified client initialized for:',
      unifiedClient.getChainType()
    );
    console.log('📍 Wallet address:', unifiedClient.getWalletAddress());

    // Send a message (will automatically use Solana implementation)
    console.log('\nSending message via unified client...');
    // const messageResult = await unifiedClient.sendMessage(
    //   'Cross-Chain Message',
    //   'This message was sent through the unified client!',
    //   true // priority
    // );
    // console.log('✅ Message sent:', messageResult);
    console.log(
      '💡 Message sending would automatically route to Solana implementation'
    );

    // Delegate to another address
    console.log('\nDelegating via unified client...');
    const delegateAddress = Keypair.generate().publicKey.toString();
    // const delegationResult = await unifiedClient.delegateTo(delegateAddress);
    // console.log('✅ Delegation complete:', delegationResult);
    console.log(
      '💡 Delegation would automatically route to Solana implementation'
    );
    console.log('📍 Would delegate to:', delegateAddress);
  } catch (error) {
    console.log('⚠️ Unified client example failed:', error.message);
  }

  // ===== EXAMPLE 3: Unified Client with EVM =====
  console.log('\n🌐 Example 3: Unified Client with EVM Wallet');

  try {
    const unifiedClient = new OnchainMailerClient(
      evmWallet,
      TESTNET_CHAIN_CONFIG
    );
    console.log(
      '✅ Unified client initialized for:',
      unifiedClient.getChainType()
    );
    console.log('📍 Wallet address:', unifiedClient.getWalletAddress());

    // Send a message (will automatically use EVM implementation)
    console.log('\nSending message via unified EVM client...');
    // const messageResult = await unifiedClient.sendMessage(
    //   'EVM Cross-Chain Message',
    //   'This message was sent through the unified client to EVM!',
    //   true // priority
    // );
    // console.log('✅ Message sent:', messageResult);
    console.log(
      '💡 Message sending would automatically route to EVM implementation'
    );

    // Delegate to another address
    console.log('\nDelegating via unified EVM client...');
    const delegateAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    // const delegationResult = await unifiedClient.delegateTo(delegateAddress);
    // console.log('✅ Delegation complete:', delegationResult);
    console.log(
      '💡 Delegation would automatically route to EVM implementation'
    );
    console.log('📍 Would delegate to:', delegateAddress);
  } catch (error) {
    console.log('⚠️ EVM unified client example failed:', error.message);
  }

  // ===== EXAMPLE 4: Address Validation =====
  console.log('\n✅ Example 4: Cross-Chain Address Validation');

  const evmAddress = '0x1234567890123456789012345678901234567890';
  const solanaAddress = 'DQf2W8p7L5Q8r3K1mN6x9V7z2B4c3H8j5E6nYpRtUiOp';

  console.log('🔍 Address validation results:');
  console.log(
    `EVM address (${evmAddress}):`,
    WalletDetector.isEVMAddress(evmAddress)
  );
  console.log(
    `Solana address (${solanaAddress}):`,
    WalletDetector.isSolanaAddress(solanaAddress)
  );

  console.log('🔍 Chain detection from address:');
  console.log(
    `${evmAddress} ->`,
    WalletDetector.detectChainFromAddress(evmAddress)
  );
  console.log(
    `${solanaAddress} ->`,
    WalletDetector.detectChainFromAddress(solanaAddress)
  );

  // ===== EXAMPLE 5: Configuration Examples =====
  console.log('\n⚙️ Example 5: Multi-Chain Configuration');

  console.log('📋 Default configuration:', {
    hasEVM: !!DEFAULT_CHAIN_CONFIG.evm,
    hasSolana: !!DEFAULT_CHAIN_CONFIG.solana,
    evmChainId: DEFAULT_CHAIN_CONFIG.evm?.chainId,
    solanaRPC: DEFAULT_CHAIN_CONFIG.solana?.rpc,
  });

  console.log('📋 Testnet configuration:', {
    hasEVM: !!TESTNET_CHAIN_CONFIG.evm,
    hasSolana: !!TESTNET_CHAIN_CONFIG.solana,
    evmChainId: TESTNET_CHAIN_CONFIG.evm?.chainId,
    solanaRPC: TESTNET_CHAIN_CONFIG.solana?.rpc,
  });

  // ===== EXAMPLE 6: Error Handling =====
  console.log('\n🚨 Example 6: Error Handling');

  try {
    const invalidWallet = { someProperty: 'value' };
    const chainType = WalletDetector.detectWalletType(invalidWallet);
    console.log('Unexpected success:', chainType);
  } catch (error) {
    console.log('✅ Expected error for invalid wallet:', error.message);
  }

  try {
    const invalidAddress = 'invalid-address-format';
    const chainType = WalletDetector.detectChainFromAddress(invalidAddress);
    console.log('Chain type for invalid address:', chainType);
  } catch (error) {
    console.log('✅ Invalid address correctly returned null');
  }

  console.log('\n🎉 Unified multi-chain examples completed!');
  console.log('\n💡 Key Benefits of Unified Client:');
  console.log('   • Automatic wallet detection');
  console.log('   • Single API for both chains');
  console.log('   • Seamless chain switching');
  console.log('   • Unified error handling');
  console.log('   • Cross-chain address validation');
}

// Run examples if called directly
if (require.main === module) {
  unifiedUsageExamples().catch(console.error);
}

export { unifiedUsageExamples };

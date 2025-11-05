/**
 * Example: Using OnchainMailerClient with wagmi (EVM)
 *
 * This example shows how to use the refactored OnchainMailerClient
 * with wagmi's WalletClient and PublicClient for EVM chains.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient
} from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { OnchainMailerClient } from '../src/unified/onchain-mailer-client';

async function main() {
  // ===== Setup wagmi clients =====

  // Option 1: Using a private key (for development/testing)
  const account = privateKeyToAccount('0x...'); // Your private key

  const walletClient: WalletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http('https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY')
  });

  const publicClient: PublicClient = createPublicClient({
    chain: sepolia,
    transport: http('https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY')
  });

  // Option 2: Using window.ethereum (browser)
  // const walletClient = createWalletClient({
  //   chain: mainnet,
  //   transport: custom(window.ethereum)
  // });

  // ===== Create OnchainMailerClient for EVM =====
  const mailerClient = OnchainMailerClient.forEVM(
    walletClient,
    publicClient,
    '0xYourMailerContractAddress', // Deployed Mailer contract
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC address
  );

  console.log('✅ Mailer client initialized for:', mailerClient.getChainType());

  // Get wallet address
  const walletAddress = await mailerClient.getWalletAddressAsync();
  console.log('📍 Wallet address:', walletAddress);

  // ===== Send a message =====
  try {
    console.log('\n📨 Sending message...');
    const result = await mailerClient.sendMessage(
      '0xRecipientAddress', // to
      'Hello from wagmi!',  // subject
      'This message was sent using wagmi integration', // body
      true, // priority (true = full fee with revenue share)
      false // resolveSenderToName
    );

    console.log('✅ Message sent!');
    console.log('   Transaction hash:', result.transactionHash);
    console.log('   Fee paid:', result.fee?.toString(), 'USDC (micro-units)');
    console.log('   Gas used:', result.gasUsed?.toString());
  } catch (error) {
    console.error('❌ Failed to send message:', error);
  }

  // ===== Delegate to another address =====
  try {
    console.log('\n🤝 Setting up delegation...');
    const delegationResult = await mailerClient.delegateTo('0xDelegateAddress');

    console.log('✅ Delegation set!');
    console.log('   Transaction hash:', delegationResult.transactionHash);
    console.log('   Delegate:', delegationResult.delegate);
  } catch (error) {
    console.error('❌ Failed to delegate:', error);
  }

  // ===== Check claimable revenue =====
  try {
    console.log('\n💰 Checking send fee...');
    const fee = await mailerClient.getSendFee();
    console.log('   Current send fee:', fee.toString(), 'USDC (micro-units)');
  } catch (error) {
    console.error('❌ Failed to get fee:', error);
  }

  // ===== Claim revenue share =====
  try {
    console.log('\n💸 Claiming revenue share...');
    const claimResult = await mailerClient.claimRevenue();

    console.log('✅ Revenue claimed!');
    console.log('   Transaction hash:', claimResult.hash);
    console.log('   Block number:', claimResult.blockNumber);
  } catch (error) {
    console.error('❌ Failed to claim revenue:', error);
  }
}

// ===== Advanced: Using with React and wagmi hooks =====
export function ReactComponent() {
  // This would be in a React component using wagmi hooks
  /*
  import { useWalletClient, usePublicClient } from 'wagmi';

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const mailerClient = useMemo(() => {
    if (!walletClient || !publicClient) return null;

    return OnchainMailerClient.forEVM(
      walletClient,
      publicClient,
      process.env.NEXT_PUBLIC_MAILER_ADDRESS!,
      process.env.NEXT_PUBLIC_USDC_ADDRESS
    );
  }, [walletClient, publicClient]);

  const sendMessage = async () => {
    if (!mailerClient) return;

    const result = await mailerClient.sendMessage(
      recipientAddress,
      subject,
      body,
      isPriority
    );
    // Handle result
  };
  */
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
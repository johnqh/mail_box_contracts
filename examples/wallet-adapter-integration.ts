/**
 * Example: Using OnchainMailerClient with @solana/wallet-adapter (Solana)
 *
 * This example shows how to use the refactored OnchainMailerClient
 * with Solana wallet-adapter for Solana blockchain.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { OnchainMailerClient } from '../src/unified/onchain-mailer-client';

async function main() {
  // ===== Setup Solana connection and wallet =====

  // Create connection to Solana
  const connection = new Connection(
    'https://api.devnet.solana.com',
    'confirmed'
  );

  // Option 1: Using Phantom wallet adapter
  const wallet = new PhantomWalletAdapter();
  await wallet.connect();

  // Option 2: In React, you would use the useWallet hook
  // const wallet = useWallet();

  // ===== Create OnchainMailerClient for Solana =====
  const mailerClient = OnchainMailerClient.forSolana(
    wallet,
    connection,
    '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF', // Mailer program ID
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC mint
  );

  console.log('✅ Mailer client initialized for:', mailerClient.getChainType());

  // Get wallet address
  const walletAddress = wallet.publicKey?.toString();
  console.log('📍 Wallet address:', walletAddress);

  // ===== Send a message =====
  try {
    console.log('\n📨 Sending message...');
    const result = await mailerClient.sendMessage(
      'RecipientPublicKeyBase58', // to (Solana public key)
      'Hello from Solana!', // subject
      'This message was sent using wallet-adapter', // body
      true, // priority
      false // resolveSenderToName
    );

    console.log('✅ Message sent!');
    console.log('   Transaction signature:', result.transactionHash);
    console.log('   Fee paid:', result.fee?.toString(), 'USDC (micro-units)');
    console.log('   Priority:', result.isPriority);
  } catch (error) {
    console.error('❌ Failed to send message:', error);
  }

  // ===== Delegate to another address =====
  try {
    console.log('\n🤝 Setting up delegation...');
    const delegationResult = await mailerClient.delegateTo('DelegatePublicKeyBase58');

    console.log('✅ Delegation set!');
    console.log('   Transaction signature:', delegationResult.transactionHash);
    console.log('   Delegate:', delegationResult.delegate);
  } catch (error) {
    console.error('❌ Failed to delegate:', error);
  }

  // ===== Check send fee =====
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
    console.log('   Transaction signature:', claimResult.hash);
    console.log('   Slot:', claimResult.slot);
  } catch (error) {
    console.error('❌ Failed to claim revenue:', error);
  }

  // Disconnect wallet
  await wallet.disconnect();
}

// ===== React Component Example =====
export function SolanaReactComponent() {
  // This would be in a React component using wallet-adapter hooks
  /*
  import { useWallet } from '@solana/wallet-adapter-react';
  import { useConnection } from '@solana/wallet-adapter-react';
  import { useMemo } from 'react';

  const wallet = useWallet();
  const { connection } = useConnection();

  const mailerClient = useMemo(() => {
    if (!wallet.connected || !wallet.publicKey) return null;

    return OnchainMailerClient.forSolana(
      wallet,
      connection,
      process.env.NEXT_PUBLIC_MAILER_PROGRAM_ID!,
      process.env.NEXT_PUBLIC_USDC_MINT!
    );
  }, [wallet, connection]);

  const sendMessage = async () => {
    if (!mailerClient) return;

    const result = await mailerClient.sendMessage(
      recipientPublicKey,
      subject,
      body,
      isPriority
    );
    // Handle result
  };

  return (
    <div>
      <h2>Solana Mailer</h2>
      {wallet.connected ? (
        <div>
          <p>Connected: {wallet.publicKey?.toString()}</p>
          <button onClick={sendMessage}>Send Message</button>
        </div>
      ) : (
        <button onClick={() => wallet.connect()}>Connect Wallet</button>
      )}
    </div>
  );
  */
}

// ===== Example: Full React Setup with Wallet Adapter =====
export function WalletProviderExample() {
  /*
  import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
  import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
  import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
  import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
  import { clusterApiUrl } from '@solana/web3.js';

  const network = WalletAdapterNetwork.Devnet;
  const endpoint = clusterApiUrl(network);

  const wallets = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter()
  ];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <YourApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
  */
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
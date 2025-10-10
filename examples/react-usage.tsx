/**
 * Complete React Integration Example
 *
 * This example demonstrates how to use the React Query hooks with
 * the OnchainMailerClient for both EVM and Solana chains.
 */

import React, { useState } from 'react';
import {
  MailerProvider,
  useGetSendFee,
  useGetClaimableAmount,
  useGetDelegation,
  useIsPaused,
  useSendMessage,
  useClaimRevenue,
  useDelegateTo,
  usePause,
  useUnpause,
  useWalletAddress,
  useChainType,
  useGetOwnerClaimable,
  useClaimOwnerShare,
  useSendToEmail,
  useSetFee,
  useRejectDelegation,
  useDistributeClaimableFunds,
} from '../src/react';

// ====================
// App Setup with Provider
// ====================

function App() {
  // Example: Using MetaMask (EVM) or Phantom (Solana)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wallet = (window as any).ethereum || (window as any).solana;

  const config = {
    evm: {
      rpc: 'https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY',
      chainId: 11155111, // Sepolia
      contracts: {
        mailer: '0x123...', // Your deployed Mailer contract
        usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      },
    },
    solana: {
      rpc: 'https://api.devnet.solana.com',
      programs: {
        mailer: '9FLkBDGpZBcR8LMsQ7MwwV6X9P4TDFgN3DeRh5qYyHJF',
      },
      usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    },
  };

  return (
    <MailerProvider wallet={wallet} config={config}>
      <Dashboard />
    </MailerProvider>
  );
}

// ====================
// Main Dashboard Component
// ====================

function Dashboard() {
  const chainType = useChainType();
  const walletAddress = useWalletAddress();

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Onchain Mailer Dashboard</h1>
      <div style={{ marginBottom: '20px', padding: '10px', background: '#f0f0f0' }}>
        <div>Chain: <strong>{chainType}</strong></div>
        <div>Wallet: <strong>{walletAddress}</strong></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <ContractInfo />
          <SendMessageForm />
          <SendToEmailForm />
          <ClaimSection />
        </div>
        <div>
          <DelegationSection />
          <OwnerSection />
          <PauseControlSection />
        </div>
      </div>
    </div>
  );
}

// ====================
// Contract Info Display
// ====================

function ContractInfo() {
  const { data: sendFee, isLoading: feeLoading } = useGetSendFee();
  const { data: isPaused, isLoading: pauseLoading } = useIsPaused();

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '20px' }}>
      <h2>Contract Info</h2>
      <div>
        <strong>Send Fee:</strong>{' '}
        {feeLoading ? 'Loading...' : `${Number(sendFee || 0n) / 1_000_000} USDC`}
      </div>
      <div>
        <strong>Status:</strong>{' '}
        {pauseLoading ? 'Loading...' : (isPaused ? '⏸️ Paused' : '✅ Active')}
      </div>
    </div>
  );
}

// ====================
// Send Message Form
// ====================

function SendMessageForm() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState(false);

  const sendMessage = useSendMessage({
    onSuccess: (result) => {
      alert(`Message sent! TX: ${result.transactionHash}`);
      setSubject('');
      setBody('');
    },
    onError: (error) => {
      alert(`Failed to send: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage.mutate({ subject, body, priority });
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '20px' }}>
      <h2>Send Message</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
            required
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <textarea
            placeholder="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ width: '100%', padding: '8px', minHeight: '100px' }}
            required
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>
            <input
              type="checkbox"
              checked={priority}
              onChange={(e) => setPriority(e.target.checked)}
            />{' '}
            Priority (90% revenue share to recipient)
          </label>
        </div>
        <button
          type="submit"
          disabled={sendMessage.isPending}
          style={{ padding: '10px 20px', cursor: 'pointer' }}
        >
          {sendMessage.isPending ? 'Sending...' : 'Send Message'}
        </button>
      </form>
    </div>
  );
}

// ====================
// Send to Email Form
// ====================

function SendToEmailForm() {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const sendToEmail = useSendToEmail({
    onSuccess: (result) => {
      alert(`Email sent! TX: ${result.transactionHash}`);
      setEmail('');
      setSubject('');
      setBody('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendToEmail.mutate({ toEmail: email, subject, body });
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '20px' }}>
      <h2>Send to Email</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
            required
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ width: '100%', padding: '8px' }}
            required
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <textarea
            placeholder="Message body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ width: '100%', padding: '8px', minHeight: '80px' }}
            required
          />
        </div>
        <button
          type="submit"
          disabled={sendToEmail.isPending}
          style={{ padding: '10px 20px' }}
        >
          {sendToEmail.isPending ? 'Sending...' : 'Send to Email'}
        </button>
      </form>
    </div>
  );
}

// ====================
// Claim Revenue Section
// ====================

function ClaimSection() {
  const { data: claimable, isLoading } = useGetClaimableAmount();
  const claimRevenue = useClaimRevenue({
    onSuccess: () => alert('Revenue claimed successfully!'),
    onError: (error) => alert(`Claim failed: ${error.message}`),
  });

  const claimableUSDC = Number(claimable || 0n) / 1_000_000;

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '20px' }}>
      <h2>Claimable Revenue</h2>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>
            <strong>{claimableUSDC.toFixed(6)} USDC</strong>
          </div>
          <button
            onClick={() => claimRevenue.mutate()}
            disabled={claimRevenue.isPending || claimableUSDC === 0}
            style={{
              padding: '10px 20px',
              cursor: claimableUSDC === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {claimRevenue.isPending ? 'Claiming...' : 'Claim Revenue'}
          </button>
        </div>
      )}
    </div>
  );
}

// ====================
// Delegation Section
// ====================

function DelegationSection() {
  const [delegateAddress, setDelegateAddress] = useState('');
  const { data: currentDelegate } = useGetDelegation();

  const delegate = useDelegateTo({
    onSuccess: () => {
      alert('Delegation set successfully!');
      setDelegateAddress('');
    },
  });

  const rejectDelegation = useRejectDelegation({
    onSuccess: () => alert('Delegation rejected!'),
  });

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '20px' }}>
      <h2>Delegation</h2>
      <div style={{ marginBottom: '10px' }}>
        <strong>Current Delegate:</strong>{' '}
        {currentDelegate || 'None'}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Delegate address"
          value={delegateAddress}
          onChange={(e) => setDelegateAddress(e.target.value)}
          style={{ width: '100%', padding: '8px' }}
        />
      </div>
      <button
        onClick={() => delegate.mutate({ delegate: delegateAddress })}
        disabled={delegate.isPending || !delegateAddress}
        style={{ padding: '10px 20px', marginRight: '10px' }}
      >
        {delegate.isPending ? 'Setting...' : 'Set Delegate'}
      </button>

      <div style={{ marginTop: '10px' }}>
        <input
          type="text"
          placeholder="Delegator address to reject"
          style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
          id="reject-address"
        />
        <button
          onClick={() => {
            const input = document.getElementById('reject-address') as HTMLInputElement;
            if (input?.value) {
              rejectDelegation.mutate({ delegatorAddress: input.value });
            }
          }}
          style={{ padding: '10px 20px' }}
        >
          Reject Delegation
        </button>
      </div>
    </div>
  );
}

// ====================
// Owner Section
// ====================

function OwnerSection() {
  const [newFee, setNewFee] = useState('');
  const { data: ownerClaimable } = useGetOwnerClaimable();
  const claimOwner = useClaimOwnerShare({
    onSuccess: () => alert('Owner fees claimed!'),
  });
  const setFee = useSetFee({
    onSuccess: () => {
      alert('Fee updated!');
      setNewFee('');
    },
  });

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '20px' }}>
      <h2>Owner Controls</h2>
      <div style={{ marginBottom: '15px' }}>
        <strong>Owner Claimable:</strong>{' '}
        {Number(ownerClaimable || 0n) / 1_000_000} USDC
        <button
          onClick={() => claimOwner.mutate()}
          disabled={claimOwner.isPending}
          style={{ marginLeft: '10px', padding: '5px 10px' }}
        >
          Claim
        </button>
      </div>

      <div>
        <input
          type="number"
          placeholder="New fee (USDC micro-units)"
          value={newFee}
          onChange={(e) => setNewFee(e.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
        />
        <button
          onClick={() => setFee.mutate({ newFee: BigInt(newFee) })}
          disabled={setFee.isPending || !newFee}
          style={{ padding: '10px 20px' }}
        >
          Update Fee
        </button>
      </div>
    </div>
  );
}

// ====================
// Pause Control Section
// ====================

function PauseControlSection() {
  const { data: isPaused } = useIsPaused();
  const pause = usePause({
    onSuccess: () => alert('Contract paused!'),
  });
  const unpause = useUnpause({
    onSuccess: () => alert('Contract unpaused!'),
  });

  const distribute = useDistributeClaimableFunds({
    onSuccess: () => alert('Funds distributed!'),
  });

  return (
    <div style={{ border: '1px solid #ccc', padding: '15px' }}>
      <h2>Emergency Controls</h2>
      <div style={{ marginBottom: '15px' }}>
        <strong>Status:</strong> {isPaused ? '⏸️ Paused' : '✅ Active'}
      </div>

      {!isPaused ? (
        <button
          onClick={() => pause.mutate()}
          disabled={pause.isPending}
          style={{ padding: '10px 20px', background: '#ff4444', color: 'white' }}
        >
          {pause.isPending ? 'Pausing...' : 'Pause Contract'}
        </button>
      ) : (
        <>
          <button
            onClick={() => unpause.mutate()}
            disabled={unpause.isPending}
            style={{ padding: '10px 20px', background: '#44ff44', marginRight: '10px' }}
          >
            {unpause.isPending ? 'Unpausing...' : 'Unpause Contract'}
          </button>

          <div style={{ marginTop: '10px' }}>
            <input
              type="text"
              placeholder="Recipient address"
              id="distribute-recipient"
              style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
            />
            <button
              onClick={() => {
                const input = document.getElementById('distribute-recipient') as HTMLInputElement;
                if (input?.value) {
                  distribute.mutate({ recipient: input.value });
                }
              }}
              style={{ padding: '10px 20px' }}
            >
              Distribute Funds
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;

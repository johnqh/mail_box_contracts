import React, { createContext, useContext, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainMailerClient } from '../../unified/onchain-mailer-client';
import type { ChainConfig } from '../../unified/types';

/**
 * Context for OnchainMailerClient
 */
const MailerClientContext = createContext<OnchainMailerClient | null>(null);

/**
 * Props for MailerProvider
 */
export interface MailerProviderProps {
  /** Child components */
  children: ReactNode;
  /** Wallet instance (EVM or Solana) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
  /** Chain configuration */
  config: ChainConfig;
  /** Optional React Query client (creates default if not provided) */
  queryClient?: QueryClient;
}

/**
 * Default React Query client with sensible defaults for blockchain queries
 */
const defaultQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000, // 30 seconds default
    },
    mutations: {
      retry: 1,
    },
  },
});

/**
 * Provider component for Mailer client and React Query
 *
 * Wraps your app with OnchainMailerClient and React Query context.
 * All Mailer hooks must be used within this provider.
 *
 * @example
 * ```tsx
 * import { MailerProvider } from '@johnqh/mail_box_contracts/react';
 *
 * function App() {
 *   const wallet = useWallet(); // Your wallet hook
 *   const config = {
 *     evm: {
 *       rpc: 'https://eth-mainnet.g.alchemy.com/v2/YOUR-KEY',
 *       chainId: 1,
 *       contracts: {
 *         mailer: '0x123...',
 *         usdc: '0x456...'
 *       }
 *     }
 *   };
 *
 *   return (
 *     <MailerProvider wallet={wallet} config={config}>
 *       <YourApp />
 *     </MailerProvider>
 *   );
 * }
 * ```
 *
 * @example With custom QueryClient
 * ```tsx
 * import { QueryClient } from '@tanstack/react-query';
 *
 * const customQueryClient = new QueryClient({
 *   defaultOptions: {
 *     queries: {
 *       staleTime: 60 * 1000, // 1 minute
 *     },
 *   },
 * });
 *
 * function App() {
 *   return (
 *     <MailerProvider
 *       wallet={wallet}
 *       config={config}
 *       queryClient={customQueryClient}
 *     >
 *       <YourApp />
 *     </MailerProvider>
 *   );
 * }
 * ```
 */
export function MailerProvider({ children, wallet, config, queryClient }: MailerProviderProps) {
  // Create OnchainMailerClient instance
  const client = React.useMemo(
    () => new OnchainMailerClient(wallet, config),
    [wallet, config]
  );

  const qc = queryClient || defaultQueryClient;

  return (
    <QueryClientProvider client={qc}>
      <MailerClientContext.Provider value={client}>
        {children}
      </MailerClientContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * Hook to access the OnchainMailerClient instance
 *
 * Must be used within a MailerProvider component.
 *
 * @throws {Error} When used outside of MailerProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const client = useMailerClient();
 *
 *   const handleDirectCall = async () => {
 *     // Direct API call (not recommended, use hooks instead)
 *     const fee = await client.getSendFee();
 *     console.log('Fee:', fee);
 *   };
 *
 *   return <button onClick={handleDirectCall}>Get Fee</button>;
 * }
 * ```
 */
export function useMailerClient(): OnchainMailerClient {
  const client = useContext(MailerClientContext);

  if (!client) {
    throw new Error('useMailerClient must be used within a MailerProvider');
  }

  return client;
}

/**
 * Re-export QueryClientProvider for convenience
 */
export { QueryClientProvider, QueryClient } from '@tanstack/react-query';

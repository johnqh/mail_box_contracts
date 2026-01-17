import React, { createContext, useContext, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainMailerClient } from '../../unified/onchain-mailer-client';
import type { ChainConfig, ChainInfo } from '../../unified/types';
import type { Wallet } from '../../unified/types';

/**
 * Context for Mailer client and configuration
 */
interface MailerContextValue {
  client: OnchainMailerClient;
  wallet: Wallet;
  chainInfo: ChainInfo;
}

const MailerClientContext = createContext<MailerContextValue | null>(null);

/**
 * Props for MailerProvider
 */
export interface MailerProviderProps {
  /** Child components */
  children: ReactNode;
  /** Wallet instance (EVM or Solana) */
  wallet: Wallet;
  /** Chain information */
  chainInfo: ChainInfo;
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
 * import { getChainInfo } from '@sudobility/configs';
 *
 * function App() {
 *   const wallet = useWallet(); // Your wallet hook
 *   const chainInfo = getChainInfo('ethereum'); // Get chain configuration
 *
 *   return (
 *     <MailerProvider wallet={wallet} chainInfo={chainInfo}>
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
 *       chainInfo={chainInfo}
 *       queryClient={customQueryClient}
 *     >
 *       <YourApp />
 *     </MailerProvider>
 *   );
 * }
 * ```
 */
export function MailerProvider({ children, wallet, chainInfo, queryClient }: MailerProviderProps) {
  // Create OnchainMailerClient instance (stateless, no constructor params)
  const client = React.useMemo(
    () => new OnchainMailerClient(),
    []
  );

  // Create context value with client, wallet, and chainInfo
  const contextValue = React.useMemo(
    () => ({ client, wallet, chainInfo }),
    [client, wallet, chainInfo]
  );

  const qc = queryClient || defaultQueryClient;

  return (
    <QueryClientProvider client={qc}>
      <MailerClientContext.Provider value={contextValue}>
        {children}
      </MailerClientContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * Hook to access the Mailer context
 *
 * Must be used within a MailerProvider component.
 *
 * @throws {Error} When used outside of MailerProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { client, wallet, chainInfo } = useMailerContext();
 *
 *   const handleDirectCall = async () => {
 *     // Direct API call (not recommended, use hooks instead)
 *     const fee = await client.getSendFee(wallet, chainInfo);
 *     console.log('Fee:', fee);
 *   };
 *
 *   return <button onClick={handleDirectCall}>Get Fee</button>;
 * }
 * ```
 */
export function useMailerContext(): MailerContextValue {
  const context = useContext(MailerClientContext);

  if (!context) {
    throw new Error('useMailerContext must be used within a MailerProvider');
  }

  return context;
}

/**
 * Hook to access the OnchainMailerClient instance
 * @deprecated Use useMailerContext() instead to get client, wallet, and chainInfo
 */
export function useMailerClient(): OnchainMailerClient {
  const { client } = useMailerContext();
  return client;
}


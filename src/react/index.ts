/**
 * React integration for @johnqh/mail_box_contracts
 *
 * Provides React Query hooks and context for interacting with the
 * OnchainMailerClient across EVM and Solana chains.
 *
 * @module @johnqh/mail_box_contracts/react
 *
 * @example
 * ```tsx
 * import { MailerProvider, useGetSendFee, useSendMessage } from '@johnqh/mail_box_contracts/react';
 *
 * function App() {
 *   return (
 *     <MailerProvider wallet={wallet} config={config}>
 *       <MessageSender />
 *     </MailerProvider>
 *   );
 * }
 *
 * function MessageSender() {
 *   const { data: fee } = useGetSendFee();
 *   const sendMessage = useSendMessage();
 *
 *   return (
 *     <button onClick={() => sendMessage.mutate({ subject: 'Hi', body: 'Hello!' })}>
 *       Send (Fee: {Number(fee) / 1_000_000} USDC)
 *     </button>
 *   );
 * }
 * ```
 */

// Context and Provider
export { MailerProvider, useMailerClient, QueryClient, QueryClientProvider } from './context/MailerProvider';

// Query Hooks (Read Operations)
export {
  useGetSendFee,
  useGetDelegationFee,
  useGetClaimableAmount,
  useGetOwnerClaimable,
  useGetDelegation,
  useIsPaused,
  useWalletAddress,
  useChainType,
  mailerQueryKeys,
} from './hooks/useMailerQueries';

// Mutation Hooks (Write Operations)
export {
  useSendMessage,
  useSendPrepared,
  useSendToEmail,
  useSendPreparedToEmail,
  useClaimRevenue,
  useClaimOwnerShare,
  useClaimExpiredShares,
  useDelegateTo,
  useRejectDelegation,
  useSetFee,
  useSetDelegationFee,
  usePause,
  useUnpause,
  useEmergencyUnpause,
  useDistributeClaimableFunds,
} from './hooks/useMailerMutations';

// Re-export types from unified client
export type { ChainConfig, MessageResult, UnifiedTransaction } from '../unified/types';

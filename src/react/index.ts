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
export { MailerProvider, useMailerClient, useMailerContext } from './context/MailerProvider';

// Grouped Query Hooks (Preferred - no context dependency)
export {
  useFees,
  useClaimableAmounts,
  useDelegationAndPermissions,
  useContractState,
  mailerQueryKeys,
} from './hooks/useMailerQueries';

// Grouped Mutation Hooks (Preferred - no context dependency)
export {
  useMessaging,
  useClaims,
  useDelegation,
  usePermissions,
  useContractControl,
  useOwnerOperations,
} from './hooks/useMailerMutations';

// Legacy Individual Query Hooks (Deprecated - use grouped hooks above)
export {
  useGetSendFee,
  useGetDelegationFee,
  useGetClaimableAmount,
  useGetOwnerClaimable,
  useGetDelegation,
  useIsPaused,
  useWalletAddress,
  useChainType,
  useHasPermission,
} from './hooks/useMailerQueries';

// Legacy Individual Mutation Hooks (Deprecated - use grouped hooks above)
export {
  useSendMessage,
  useSendPrepared,
  useClaimRevenue,
  useClaimOwnerShare,
  useClaimExpiredShares,
  useDelegateTo,
  useRejectDelegation,
  useSetFees,
  useSetPermission,
  useRemovePermission,
  usePause,
  useUnpause,
  useEmergencyUnpause,
  useDistributeClaimableFunds,
} from './hooks/useMailerMutations';

// Re-export types from unified client
export type { ChainConfig, MessageResult, UnifiedTransaction } from '../unified/types';

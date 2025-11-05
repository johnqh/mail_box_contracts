import { useMutation, UseMutationOptions, UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { mailerQueryKeys } from './useMailerQueries';
import type { MessageResult, UnifiedTransaction, DelegationResult, Wallet } from '../../unified/types';
import type { ChainInfo } from '@sudobility/configs';
import type { OnchainMailerClient } from '../../unified/onchain-mailer-client';

/**
 * Hook for message-related operations
 *
 * @example
 * ```tsx
 * function MessageSender() {
 *   const client = useMailerClient(); // Get client from context or create it
 *   const { sendMessage, sendPrepared } = useMessaging(client, wallet, chainInfo);
 *
 *   const handleSend = () => {
 *     sendMessage.mutate({
 *       subject: 'Hello',
 *       body: 'World!',
 *       priority: true
 *     });
 *   };
 *
 *   return (
 *     <button onClick={handleSend} disabled={sendMessage.isPending}>
 *       Send Message
 *     </button>
 *   );
 * }
 * ```
 */
export function useMessaging(
  client: OnchainMailerClient,
  connectedWallet: Wallet,
  chainInfo: ChainInfo,
  options?: {
    sendMessage?: UseMutationOptions<MessageResult, Error, { subject: string; body: string; priority?: boolean; resolveSenderToName?: boolean }>;
    sendPrepared?: UseMutationOptions<MessageResult, Error, { to: string; mailId: string; priority?: boolean; resolveSenderToName?: boolean }>;
  }
) {
  const queryClient = useQueryClient();

  const sendMessage = useMutation({
    mutationFn: async ({ subject, body, priority = false, resolveSenderToName = false }) =>
      client.sendMessage(connectedWallet, chainInfo, subject, body, { priority, resolveSenderToName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount() });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options?.sendMessage,
  });

  const sendPrepared = useMutation({
    mutationFn: async ({ to, mailId, priority = false, resolveSenderToName = false }) =>
      client.sendPrepared(connectedWallet, chainInfo, to, mailId, { priority, resolveSenderToName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount() });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options?.sendPrepared,
  });

  return {
    sendMessage,
    sendPrepared,
  };
}

/**
 * Hook for claim-related operations
 *
 * @example
 * ```tsx
 * function ClaimPanel() {
 *   const { claimRevenue, claimOwnerShare, claimExpiredShares } = useClaims(client, wallet, chainInfo);
 *
 *   return (
 *     <div>
 *       <button onClick={() => claimRevenue.mutate()}>
 *         Claim Revenue
 *       </button>
 *       <button onClick={() => claimOwnerShare.mutate()}>
 *         Claim Owner Share
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useClaims(
  client: OnchainMailerClient,
  connectedWallet: Wallet,
  chainInfo: ChainInfo,
  options?: {
    claimRevenue?: UseMutationOptions<UnifiedTransaction, Error, void>;
    claimOwnerShare?: UseMutationOptions<UnifiedTransaction, Error, void>;
    claimExpiredShares?: UseMutationOptions<UnifiedTransaction, Error, { recipient: string }>;
  }
) {
  const queryClient = useQueryClient();

  const claimRevenue = useMutation({
    mutationFn: () => client.claimRevenue(connectedWallet, chainInfo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount() });
    },
    ...options?.claimRevenue,
  });

  const claimOwnerShare = useMutation({
    mutationFn: () => client.claimOwnerShare(connectedWallet, chainInfo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options?.claimOwnerShare,
  });

  const claimExpiredShares = useMutation({
    mutationFn: async ({ recipient }) => client.claimExpiredShares(connectedWallet, chainInfo, recipient),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount(variables.recipient) });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options?.claimExpiredShares,
  });

  return {
    claimRevenue,
    claimOwnerShare,
    claimExpiredShares,
  };
}

/**
 * Hook for delegation-related operations
 *
 * @example
 * ```tsx
 * function DelegationManager() {
 *   const { delegateTo, rejectDelegation } = useDelegation(client, wallet, chainInfo);
 *
 *   return (
 *     <>
 *       <button onClick={() => delegateTo.mutate({ delegate: '0xABC...' })}>
 *         Delegate
 *       </button>
 *       <button onClick={() => rejectDelegation.mutate({ delegatorAddress: '0xDEF...' })}>
 *         Reject Delegation
 *       </button>
 *     </>
 *   );
 * }
 * ```
 */
export function useDelegation(
  client: OnchainMailerClient,
  connectedWallet: Wallet,
  chainInfo: ChainInfo,
  options?: {
    delegateTo?: UseMutationOptions<DelegationResult, Error, { delegate: string }>;
    rejectDelegation?: UseMutationOptions<UnifiedTransaction, Error, { delegatorAddress: string }>;
  }
) {
  const queryClient = useQueryClient();

  const delegateTo = useMutation({
    mutationFn: async ({ delegate }) => client.delegateTo(connectedWallet, chainInfo, delegate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.delegation() });
    },
    ...options?.delegateTo,
  });

  const rejectDelegation = useMutation({
    mutationFn: async ({ delegatorAddress }) => client.rejectDelegation(connectedWallet, chainInfo, delegatorAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.delegation() });
    },
    ...options?.rejectDelegation,
  });

  return {
    delegateTo,
    rejectDelegation,
  };
}

/**
 * Hook for permission-related operations (EVM only)
 *
 * @example
 * ```tsx
 * function PermissionManager() {
 *   const { setPermission, removePermission } = usePermissions(client, wallet, chainInfo);
 *
 *   return (
 *     <>
 *       <button onClick={() => setPermission.mutate({ contractAddress: '0xABC...' })}>
 *         Grant Permission
 *       </button>
 *       <button onClick={() => removePermission.mutate({ contractAddress: '0xABC...' })}>
 *         Revoke Permission
 *       </button>
 *     </>
 *   );
 * }
 * ```
 */
export function usePermissions(
  client: OnchainMailerClient,
  connectedWallet: Wallet,
  chainInfo: ChainInfo,
  options?: {
    setPermission?: UseMutationOptions<UnifiedTransaction, Error, { contractAddress: string }>;
    removePermission?: UseMutationOptions<UnifiedTransaction, Error, { contractAddress: string }>;
  }
) {
  const queryClient = useQueryClient();

  const setPermission = useMutation({
    mutationFn: async ({ contractAddress }) => client.setPermission(connectedWallet, chainInfo, contractAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.permissions() });
    },
    ...options?.setPermission,
  });

  const removePermission = useMutation({
    mutationFn: async ({ contractAddress }) => client.removePermission(connectedWallet, chainInfo, contractAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.permissions() });
    },
    ...options?.removePermission,
  });

  return {
    setPermission,
    removePermission,
  };
}

/**
 * Hook for contract control operations (owner only)
 *
 * @example
 * ```tsx
 * function ContractControls() {
 *   const { pause, unpause, emergencyUnpause } = useContractControl(client, wallet, chainInfo);
 *
 *   return (
 *     <>
 *       <button onClick={() => pause.mutate()}>Pause</button>
 *       <button onClick={() => unpause.mutate()}>Unpause</button>
 *       <button onClick={() => emergencyUnpause.mutate()}>Emergency Unpause</button>
 *     </>
 *   );
 * }
 * ```
 */
export function useContractControl(
  client: OnchainMailerClient,
  connectedWallet: Wallet,
  chainInfo: ChainInfo,
  options?: {
    pause?: UseMutationOptions<UnifiedTransaction, Error, void>;
    unpause?: UseMutationOptions<UnifiedTransaction, Error, void>;
    emergencyUnpause?: UseMutationOptions<UnifiedTransaction, Error, void>;
  }
) {
  const queryClient = useQueryClient();

  const pause = useMutation({
    mutationFn: () => client.pause(connectedWallet, chainInfo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.isPaused() });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options?.pause,
  });

  const unpause = useMutation({
    mutationFn: () => client.unpause(connectedWallet, chainInfo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.isPaused() });
    },
    ...options?.unpause,
  });

  const emergencyUnpause = useMutation({
    mutationFn: () => client.emergencyUnpause(connectedWallet, chainInfo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.isPaused() });
    },
    ...options?.emergencyUnpause,
  });

  return {
    pause,
    unpause,
    emergencyUnpause,
  };
}

/**
 * Hook for owner-specific operations
 *
 * @example
 * ```tsx
 * function OwnerPanel() {
 *   const { setFees, distributeClaimableFunds } = useOwnerOperations(client, wallet, chainInfo);
 *
 *   return (
 *     <>
 *       <button onClick={() => setFees.mutate({ sendFee: 200000n, delegationFee: 10000000n })}>
 *         Update Fees
 *       </button>
 *       <button onClick={() => distributeClaimableFunds.mutate({ recipient: '0xABC...' })}>
 *         Distribute Funds
 *       </button>
 *     </>
 *   );
 * }
 * ```
 */
export function useOwnerOperations(
  client: OnchainMailerClient,
  connectedWallet: Wallet,
  chainInfo: ChainInfo,
  options?: {
    setFees?: UseMutationOptions<UnifiedTransaction, Error, { sendFee: bigint; delegationFee: bigint }>;
    distributeClaimableFunds?: UseMutationOptions<UnifiedTransaction, Error, { recipient: string }>;
  }
) {
  const queryClient = useQueryClient();

  const setFees = useMutation({
    mutationFn: async ({ sendFee, delegationFee }) => client.setFees(connectedWallet, chainInfo, sendFee, delegationFee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.sendFee() });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.delegationFee() });
    },
    ...options?.setFees,
  });

  const distributeClaimableFunds = useMutation({
    mutationFn: async ({ recipient }) => client.distributeClaimableFunds(connectedWallet, chainInfo, recipient),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount(variables.recipient) });
    },
    ...options?.distributeClaimableFunds,
  });

  return {
    setFees,
    distributeClaimableFunds,
  };
}

// ========== Legacy individual hooks for backward compatibility ==========
// These use context for convenience but the grouped hooks above are preferred

import { useMailerContext } from '../context/MailerProvider';

/**
 * @deprecated Use useMessaging() instead
 */
export function useSendMessage(
  options?: UseMutationOptions<
    MessageResult,
    Error,
    { subject: string; body: string; priority?: boolean; resolveSenderToName?: boolean }
  >
): UseMutationResult<
  MessageResult,
  Error,
  { subject: string; body: string; priority?: boolean; resolveSenderToName?: boolean }
> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { sendMessage } = useMessaging(client, wallet, chainInfo, { sendMessage: options });
  return sendMessage;
}

/**
 * @deprecated Use useMessaging() instead
 */
export function useSendPrepared(
  options?: UseMutationOptions<
    MessageResult,
    Error,
    { to: string; mailId: string; priority?: boolean; resolveSenderToName?: boolean }
  >
): UseMutationResult<
  MessageResult,
  Error,
  { to: string; mailId: string; priority?: boolean; resolveSenderToName?: boolean }
> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { sendPrepared } = useMessaging(client, wallet, chainInfo, { sendPrepared: options });
  return sendPrepared;
}

/**
 * @deprecated Use useClaims() instead
 */
export function useClaimRevenue(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { claimRevenue } = useClaims(client, wallet, chainInfo, { claimRevenue: options });
  return claimRevenue;
}

/**
 * @deprecated Use useClaims() instead
 */
export function useClaimOwnerShare(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { claimOwnerShare } = useClaims(client, wallet, chainInfo, { claimOwnerShare: options });
  return claimOwnerShare;
}

/**
 * @deprecated Use useClaims() instead
 */
export function useClaimExpiredShares(
  options?: UseMutationOptions<UnifiedTransaction, Error, { recipient: string }>
): UseMutationResult<UnifiedTransaction, Error, { recipient: string }> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { claimExpiredShares } = useClaims(client, wallet, chainInfo, { claimExpiredShares: options });
  return claimExpiredShares;
}

/**
 * @deprecated Use useDelegation() instead
 */
export function useDelegateTo(
  options?: UseMutationOptions<DelegationResult, Error, { delegate: string }>
): UseMutationResult<DelegationResult, Error, { delegate: string }> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { delegateTo } = useDelegation(client, wallet, chainInfo, { delegateTo: options });
  return delegateTo;
}

/**
 * @deprecated Use useDelegation() instead
 */
export function useRejectDelegation(
  options?: UseMutationOptions<UnifiedTransaction, Error, { delegatorAddress: string }>
): UseMutationResult<UnifiedTransaction, Error, { delegatorAddress: string }> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { rejectDelegation } = useDelegation(client, wallet, chainInfo, { rejectDelegation: options });
  return rejectDelegation;
}

/**
 * @deprecated Use usePermissions() instead
 */
export function useSetPermission(
  options?: UseMutationOptions<UnifiedTransaction, Error, { contractAddress: string }>
): UseMutationResult<UnifiedTransaction, Error, { contractAddress: string }> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { setPermission } = usePermissions(client, wallet, chainInfo, { setPermission: options });
  return setPermission;
}

/**
 * @deprecated Use usePermissions() instead
 */
export function useRemovePermission(
  options?: UseMutationOptions<UnifiedTransaction, Error, { contractAddress: string }>
): UseMutationResult<UnifiedTransaction, Error, { contractAddress: string }> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { removePermission } = usePermissions(client, wallet, chainInfo, { removePermission: options });
  return removePermission;
}

/**
 * @deprecated Use useOwnerOperations() instead
 */
export function useSetFees(
  options?: UseMutationOptions<UnifiedTransaction, Error, { sendFee: bigint; delegationFee: bigint }>
): UseMutationResult<UnifiedTransaction, Error, { sendFee: bigint; delegationFee: bigint }> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { setFees } = useOwnerOperations(client, wallet, chainInfo, { setFees: options });
  return setFees;
}

/**
 * @deprecated Use useContractControl() instead
 */
export function usePause(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { pause } = useContractControl(client, wallet, chainInfo, { pause: options });
  return pause;
}

/**
 * @deprecated Use useContractControl() instead
 */
export function useUnpause(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { unpause } = useContractControl(client, wallet, chainInfo, { unpause: options });
  return unpause;
}

/**
 * @deprecated Use useContractControl() instead
 */
export function useEmergencyUnpause(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { emergencyUnpause } = useContractControl(client, wallet, chainInfo, { emergencyUnpause: options });
  return emergencyUnpause;
}

/**
 * @deprecated Use useOwnerOperations() instead
 */
export function useDistributeClaimableFunds(
  options?: UseMutationOptions<UnifiedTransaction, Error, { recipient: string }>
): UseMutationResult<UnifiedTransaction, Error, { recipient: string }> {
  const { client, wallet, chainInfo } = useMailerContext();
  const { distributeClaimableFunds } = useOwnerOperations(client, wallet, chainInfo, { distributeClaimableFunds: options });
  return distributeClaimableFunds;
}
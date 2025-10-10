import { useMutation, UseMutationOptions, UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { useMailerClient } from '../context/MailerProvider';
import { mailerQueryKeys } from './useMailerQueries';
import type { MessageResult, UnifiedTransaction, DelegationResult } from '../../unified/types';

/**
 * Hook to send a message
 *
 * @example
 * ```tsx
 * function SendMessageForm() {
 *   const sendMessage = useSendMessage();
 *
 *   const handleSend = () => {
 *     sendMessage.mutate({
 *       subject: 'Hello',
 *       body: 'World!',
 *       priority: true,
 *       resolveSenderToName: false
 *     });
 *   };
 *
 *   return (
 *     <button onClick={handleSend} disabled={sendMessage.isPending}>
 *       {sendMessage.isPending ? 'Sending...' : 'Send Message'}
 *     </button>
 *   );
 * }
 * ```
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
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subject, body, priority = false, resolveSenderToName = false }) =>
      client.sendMessage(subject, body, priority, resolveSenderToName),
    onSuccess: () => {
      // Invalidate claimable amounts as sending affects balances
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount() });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options,
  });
}

/**
 * Hook to send a prepared message
 *
 * @example
 * ```tsx
 * function SendPreparedButton() {
 *   const sendPrepared = useSendPrepared();
 *
 *   return (
 *     <button
 *       onClick={() => sendPrepared.mutate({
 *         to: '0x123...',
 *         mailId: 'template-001',
 *         priority: true
 *       })}
 *       disabled={sendPrepared.isPending}
 *     >
 *       Send Prepared
 *     </button>
 *   );
 * }
 * ```
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
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ to, mailId, priority = false, resolveSenderToName = false }) =>
      client.sendPrepared(to, mailId, priority, resolveSenderToName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount() });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options,
  });
}

/**
 * Hook to send message to email address
 *
 * @example
 * ```tsx
 * function SendToEmailForm() {
 *   const sendToEmail = useSendToEmail();
 *
 *   return (
 *     <button
 *       onClick={() => sendToEmail.mutate({
 *         toEmail: 'user@example.com',
 *         subject: 'Hello',
 *         body: 'Welcome!'
 *       })}
 *     >
 *       Send to Email
 *     </button>
 *   );
 * }
 * ```
 */
export function useSendToEmail(
  options?: UseMutationOptions<
    MessageResult,
    Error,
    { toEmail: string; subject: string; body: string }
  >
): UseMutationResult<MessageResult, Error, { toEmail: string; subject: string; body: string }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ toEmail, subject, body }) => client.sendToEmail(toEmail, subject, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options,
  });
}

/**
 * Hook to send prepared message to email address
 */
export function useSendPreparedToEmail(
  options?: UseMutationOptions<MessageResult, Error, { toEmail: string; mailId: string }>
): UseMutationResult<MessageResult, Error, { toEmail: string; mailId: string }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ toEmail, mailId }) => client.sendPreparedToEmail(toEmail, mailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options,
  });
}

/**
 * Hook to claim revenue share
 *
 * @example
 * ```tsx
 * function ClaimButton() {
 *   const { data: claimable } = useGetClaimableAmount();
 *   const claimRevenue = useClaimRevenue();
 *
 *   if (!claimable || claimable === 0n) return null;
 *
 *   return (
 *     <button
 *       onClick={() => claimRevenue.mutate()}
 *       disabled={claimRevenue.isPending}
 *     >
 *       Claim {Number(claimable) / 1_000_000} USDC
 *     </button>
 *   );
 * }
 * ```
 */
export function useClaimRevenue(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.claimRevenue(),
    onSuccess: () => {
      // Invalidate claimable amount after successful claim
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount() });
    },
    ...options,
  });
}

/**
 * Hook to claim owner share (owner only)
 *
 * @example
 * ```tsx
 * function OwnerClaimButton() {
 *   const { data: ownerClaimable } = useGetOwnerClaimable();
 *   const claimOwner = useClaimOwnerShare();
 *
 *   return (
 *     <button onClick={() => claimOwner.mutate()}>
 *       Claim Owner Fees: {Number(ownerClaimable) / 1_000_000} USDC
 *     </button>
 *   );
 * }
 * ```
 */
export function useClaimOwnerShare(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.claimOwnerShare(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options,
  });
}

/**
 * Hook to claim expired shares (owner only, EVM only)
 */
export function useClaimExpiredShares(
  options?: UseMutationOptions<UnifiedTransaction, Error, { recipient: string }>
): UseMutationResult<UnifiedTransaction, Error, { recipient: string }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipient }) => client.claimExpiredShares(recipient),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount(variables.recipient) });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options,
  });
}

/**
 * Hook to delegate to another address
 *
 * @example
 * ```tsx
 * function DelegateButton() {
 *   const delegate = useDelegateTo();
 *
 *   return (
 *     <button
 *       onClick={() => delegate.mutate({ delegate: '0xABC...' })}
 *       disabled={delegate.isPending}
 *     >
 *       Delegate
 *     </button>
 *   );
 * }
 * ```
 */
export function useDelegateTo(
  options?: UseMutationOptions<DelegationResult, Error, { delegate: string }>
): UseMutationResult<DelegationResult, Error, { delegate: string }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ delegate }) => client.delegateTo(delegate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.delegation() });
    },
    ...options,
  });
}

/**
 * Hook to reject a delegation made to you
 *
 * @example
 * ```tsx
 * function RejectDelegationButton({ delegatorAddress }: { delegatorAddress: string }) {
 *   const rejectDelegation = useRejectDelegation();
 *
 *   return (
 *     <button
 *       onClick={() => rejectDelegation.mutate({ delegatorAddress })}
 *     >
 *       Reject Delegation
 *     </button>
 *   );
 * }
 * ```
 */
export function useRejectDelegation(
  options?: UseMutationOptions<UnifiedTransaction, Error, { delegatorAddress: string }>
): UseMutationResult<UnifiedTransaction, Error, { delegatorAddress: string }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ delegatorAddress }) => client.rejectDelegation(delegatorAddress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.delegation() });
    },
    ...options,
  });
}

/**
 * Hook to set send fee (owner only)
 *
 * @example
 * ```tsx
 * function SetFeeForm() {
 *   const setFee = useSetFee();
 *
 *   return (
 *     <button onClick={() => setFee.mutate({ newFee: 200000n })}>
 *       Update Fee to 0.2 USDC
 *     </button>
 *   );
 * }
 * ```
 */
export function useSetFee(
  options?: UseMutationOptions<UnifiedTransaction, Error, { newFee: bigint }>
): UseMutationResult<UnifiedTransaction, Error, { newFee: bigint }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ newFee }) => client.setFee(newFee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.sendFee() });
    },
    ...options,
  });
}

/**
 * Hook to set delegation fee (owner only)
 */
export function useSetDelegationFee(
  options?: UseMutationOptions<UnifiedTransaction, Error, { newFee: bigint }>
): UseMutationResult<UnifiedTransaction, Error, { newFee: bigint }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ newFee }) => client.setDelegationFee(newFee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.delegationFee() });
    },
    ...options,
  });
}

/**
 * Hook to pause the contract (owner only)
 *
 * @example
 * ```tsx
 * function PauseButton() {
 *   const pause = usePause();
 *
 *   return (
 *     <button
 *       onClick={() => pause.mutate()}
 *       disabled={pause.isPending}
 *     >
 *       Pause Contract
 *     </button>
 *   );
 * }
 * ```
 */
export function usePause(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.pause(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.isPaused() });
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.ownerClaimable() });
    },
    ...options,
  });
}

/**
 * Hook to unpause the contract (owner only)
 *
 * @example
 * ```tsx
 * function UnpauseButton() {
 *   const unpause = useUnpause();
 *
 *   return (
 *     <button onClick={() => unpause.mutate()}>
 *       Unpause Contract
 *     </button>
 *   );
 * }
 * ```
 */
export function useUnpause(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.unpause(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.isPaused() });
    },
    ...options,
  });
}

/**
 * Hook to emergency unpause (owner only)
 */
export function useEmergencyUnpause(
  options?: UseMutationOptions<UnifiedTransaction, Error, void>
): UseMutationResult<UnifiedTransaction, Error, void> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.emergencyUnpause(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.isPaused() });
    },
    ...options,
  });
}

/**
 * Hook to distribute claimable funds (anyone can call when paused)
 *
 * @example
 * ```tsx
 * function DistributeFundsButton({ recipient }: { recipient: string }) {
 *   const distribute = useDistributeClaimableFunds();
 *
 *   return (
 *     <button onClick={() => distribute.mutate({ recipient })}>
 *       Distribute Funds to {recipient}
 *     </button>
 *   );
 * }
 * ```
 */
export function useDistributeClaimableFunds(
  options?: UseMutationOptions<UnifiedTransaction, Error, { recipient: string }>
): UseMutationResult<UnifiedTransaction, Error, { recipient: string }> {
  const client = useMailerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipient }) => client.distributeClaimableFunds(recipient),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: mailerQueryKeys.claimableAmount(variables.recipient) });
    },
    ...options,
  });
}

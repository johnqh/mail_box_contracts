import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { useMailerClient } from '../context/MailerProvider';

/**
 * Query keys for React Query cache management
 */
export const mailerQueryKeys = {
  all: ['mailer'] as const,
  sendFee: () => [...mailerQueryKeys.all, 'sendFee'] as const,
  delegationFee: () => [...mailerQueryKeys.all, 'delegationFee'] as const,
  claimableAmount: (address?: string) => [...mailerQueryKeys.all, 'claimableAmount', address] as const,
  ownerClaimable: () => [...mailerQueryKeys.all, 'ownerClaimable'] as const,
  delegation: (address?: string) => [...mailerQueryKeys.all, 'delegation', address] as const,
  isPaused: () => [...mailerQueryKeys.all, 'isPaused'] as const,
};

/**
 * Hook to get the current send fee
 *
 * @example
 * ```tsx
 * function FeeDisplay() {
 *   const { data: fee, isLoading } = useGetSendFee();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   return <div>Send Fee: {Number(fee) / 1_000_000} USDC</div>;
 * }
 * ```
 */
export function useGetSendFee(
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const client = useMailerClient();

  return useQuery({
    queryKey: mailerQueryKeys.sendFee(),
    queryFn: () => client.getSendFee(),
    staleTime: 5 * 60 * 1000, // 5 minutes - fees don't change often
    ...options,
  });
}

/**
 * Hook to get the current delegation fee
 *
 * @example
 * ```tsx
 * function DelegationFeeDisplay() {
 *   const { data: fee, isLoading } = useGetDelegationFee();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   return <div>Delegation Fee: {Number(fee) / 1_000_000} USDC</div>;
 * }
 * ```
 */
export function useGetDelegationFee(
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const client = useMailerClient();

  return useQuery({
    queryKey: mailerQueryKeys.delegationFee(),
    queryFn: () => client.getDelegationFee(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Hook to get claimable amount for an address
 *
 * @param address - Address to check (defaults to connected wallet)
 * @example
 * ```tsx
 * function ClaimableBalance() {
 *   const { data: amount, isLoading } = useGetClaimableAmount();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (!amount || amount === 0n) return <div>No claimable balance</div>;
 *   return <div>Claimable: {Number(amount) / 1_000_000} USDC</div>;
 * }
 * ```
 */
export function useGetClaimableAmount(
  address?: string,
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const client = useMailerClient();

  return useQuery({
    queryKey: mailerQueryKeys.claimableAmount(address),
    queryFn: () => client.getClaimableAmount(address),
    staleTime: 30 * 1000, // 30 seconds - balances change more frequently
    ...options,
  });
}

/**
 * Hook to get owner's claimable fee balance
 *
 * @example
 * ```tsx
 * function OwnerDashboard() {
 *   const { data: amount, isLoading } = useGetOwnerClaimable();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   return <div>Owner Fees: {Number(amount) / 1_000_000} USDC</div>;
 * }
 * ```
 */
export function useGetOwnerClaimable(
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const client = useMailerClient();

  return useQuery({
    queryKey: mailerQueryKeys.ownerClaimable(),
    queryFn: () => client.getOwnerClaimable(),
    staleTime: 30 * 1000, // 30 seconds
    ...options,
  });
}

/**
 * Hook to get delegation information for an address
 *
 * @param address - Address to check delegation for (defaults to connected wallet)
 * @example
 * ```tsx
 * function DelegationStatus() {
 *   const { data: delegate, isLoading } = useGetDelegation();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   if (!delegate) return <div>No delegation set</div>;
 *   return <div>Delegated to: {delegate}</div>;
 * }
 * ```
 */
export function useGetDelegation(
  address?: string,
  options?: Omit<UseQueryOptions<string | null, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<string | null, Error> {
  const client = useMailerClient();

  return useQuery({
    queryKey: mailerQueryKeys.delegation(address),
    queryFn: () => client.getDelegation(address),
    staleTime: 1 * 60 * 1000, // 1 minute
    ...options,
  });
}

/**
 * Hook to check if contract is currently paused
 *
 * @example
 * ```tsx
 * function PauseStatus() {
 *   const { data: isPaused, isLoading } = useIsPaused();
 *
 *   if (isLoading) return <div>Loading...</div>;
 *   return (
 *     <div>
 *       Contract Status: {isPaused ? '⏸️ Paused' : '✅ Active'}
 *     </div>
 *   );
 * }
 * ```
 */
export function useIsPaused(
  options?: Omit<UseQueryOptions<boolean, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<boolean, Error> {
  const client = useMailerClient();

  return useQuery({
    queryKey: mailerQueryKeys.isPaused(),
    queryFn: () => client.isPaused(),
    staleTime: 10 * 1000, // 10 seconds - pause status is critical
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
    ...options,
  });
}

/**
 * Hook to get wallet address from the client
 *
 * @example
 * ```tsx
 * function WalletAddress() {
 *   const address = useWalletAddress();
 *   return <div>Connected: {address}</div>;
 * }
 * ```
 */
export function useWalletAddress(): string {
  const client = useMailerClient();
  return client.getWalletAddress();
}

/**
 * Hook to get chain type (EVM or Solana)
 *
 * @example
 * ```tsx
 * function ChainBadge() {
 *   const chainType = useChainType();
 *   return <div>Chain: {chainType}</div>;
 * }
 * ```
 */
export function useChainType() {
  const client = useMailerClient();
  return client.getChainType();
}

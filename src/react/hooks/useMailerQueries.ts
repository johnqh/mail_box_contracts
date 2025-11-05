import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { ChainType } from '@sudobility/types';
import type { ChainInfo } from '@sudobility/configs';
import type { OnchainMailerClient } from '../../unified/onchain-mailer-client';
import type { PublicClient } from 'viem';
import type { Connection } from '@solana/web3.js';
import type { Wallet } from '../../unified/types';

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
  permissions: (contractAddress?: string, walletAddress?: string) =>
    [...mailerQueryKeys.all, 'permissions', contractAddress, walletAddress] as const,
};

/**
 * Hook for fee-related queries
 *
 * @example
 * ```tsx
 * function FeeDisplay() {
 *   const { sendFee, delegationFee } = useFees(client, chainInfo);
 *
 *   if (sendFee.isLoading) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       Send Fee: {Number(sendFee.data) / 1_000_000} USDC
 *       Delegation Fee: {Number(delegationFee.data) / 1_000_000} USDC
 *     </div>
 *   );
 * }
 * ```
 */
export function useFees(
  client: OnchainMailerClient,
  chainInfo: ChainInfo,
  publicClientOrConnection?: PublicClient | Connection,
  options?: {
    sendFee?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>;
    delegationFee?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>;
  }
) {
  const sendFee = useQuery({
    queryKey: mailerQueryKeys.sendFee(),
    queryFn: () => {
      if (chainInfo.chainType === ChainType.EVM) {
        return client.getSendFee(chainInfo, publicClientOrConnection as PublicClient | undefined);
      } else {
        return client.getSendFee(chainInfo, undefined, publicClientOrConnection as Connection | undefined);
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - fees don't change often
    ...options?.sendFee,
  });

  const delegationFee = useQuery({
    queryKey: mailerQueryKeys.delegationFee(),
    queryFn: () => {
      if (chainInfo.chainType === ChainType.EVM) {
        return client.getDelegationFee(chainInfo, publicClientOrConnection as PublicClient | undefined);
      } else {
        return client.getDelegationFee(chainInfo, undefined, publicClientOrConnection as Connection | undefined);
      }
    },
    staleTime: 5 * 60 * 1000,
    ...options?.delegationFee,
  });

  return {
    sendFee,
    delegationFee,
  };
}

/**
 * Hook for claimable amount queries
 *
 * @example
 * ```tsx
 * function ClaimableDisplay({ address }: { address?: string }) {
 *   const { claimableAmount, ownerClaimable } = useClaimableAmounts(
 *     client,
 *     chainInfo,
 *     address
 *   );
 *
 *   return (
 *     <div>
 *       User Claimable: {Number(claimableAmount.data) / 1_000_000} USDC
 *       Owner Claimable: {Number(ownerClaimable.data) / 1_000_000} USDC
 *     </div>
 *   );
 * }
 * ```
 */
export function useClaimableAmounts(
  client: OnchainMailerClient,
  chainInfo: ChainInfo,
  address?: string,
  publicClientOrConnection?: PublicClient | Connection,
  options?: {
    claimableAmount?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>;
    ownerClaimable?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>;
  }
) {
  const claimableAmount = useQuery({
    queryKey: mailerQueryKeys.claimableAmount(address),
    queryFn: async () => {
      if (!address) return BigInt(0);
      let result;
      if (chainInfo.chainType === ChainType.EVM) {
        result = await client.getRecipientClaimable(address, chainInfo, publicClientOrConnection as PublicClient | undefined);
      } else {
        result = await client.getRecipientClaimable(address, chainInfo, undefined, publicClientOrConnection as Connection | undefined);
      }
      // Extract just the amount from the result
      return result ? result.amount : BigInt(0);
    },
    enabled: Boolean(address),
    staleTime: 30 * 1000, // 30 seconds
    ...options?.claimableAmount,
  });

  const ownerClaimable = useQuery({
    queryKey: mailerQueryKeys.ownerClaimable(),
    queryFn: () => {
      if (chainInfo.chainType === ChainType.EVM) {
        return client.getOwnerClaimable(chainInfo, publicClientOrConnection as PublicClient | undefined);
      } else {
        return client.getOwnerClaimable(chainInfo, undefined, publicClientOrConnection as Connection | undefined);
      }
    },
    staleTime: 30 * 1000,
    ...options?.ownerClaimable,
  });

  return {
    claimableAmount,
    ownerClaimable,
  };
}

/**
 * Hook for delegation and permission queries
 *
 * @example
 * ```tsx
 * function DelegationStatus({ address }: { address: string }) {
 *   const { delegation, hasPermission } = useDelegationAndPermissions(
 *     client,
 *     chainInfo,
 *     {
 *       delegationAddress: address,
 *       contractAddress: '0xContract...',
 *       walletAddress: address
 *     }
 *   );
 *
 *   return (
 *     <div>
 *       Delegated to: {delegation.data}
 *       Has Permission: {hasPermission.data ? 'Yes' : 'No'}
 *     </div>
 *   );
 * }
 * ```
 */
export function useDelegationAndPermissions(
  client: OnchainMailerClient,
  chainInfo: ChainInfo,
  params?: {
    delegationAddress?: string;
    contractAddress?: string;
    walletAddress?: string;
  },
  publicClientOrConnection?: PublicClient | Connection,
  options?: {
    delegation?: Omit<UseQueryOptions<string | null, Error>, 'queryKey' | 'queryFn'>;
    hasPermission?: Omit<UseQueryOptions<boolean, Error>, 'queryKey' | 'queryFn'>;
  }
) {
  const delegation = useQuery({
    queryKey: mailerQueryKeys.delegation(params?.delegationAddress),
    queryFn: async () => {
      if (!params?.delegationAddress) return null;
      if (chainInfo.chainType === ChainType.EVM) {
        return client.getDelegation(params.delegationAddress, chainInfo, publicClientOrConnection as PublicClient | undefined);
      } else {
        return client.getDelegation(params.delegationAddress, chainInfo, undefined, publicClientOrConnection as Connection | undefined);
      }
    },
    enabled: Boolean(params?.delegationAddress),
    staleTime: 30 * 1000,
    ...options?.delegation,
  });

  const hasPermission = useQuery({
    queryKey: mailerQueryKeys.permissions(params?.contractAddress, params?.walletAddress),
    queryFn: async () => {
      if (!params?.contractAddress || !params?.walletAddress) {
        return false;
      }
      return client.hasPermission(
        chainInfo,
        params.contractAddress,
        params.walletAddress,
        publicClientOrConnection as PublicClient | undefined
      );
    },
    enabled: Boolean(params?.contractAddress && params?.walletAddress),
    staleTime: 30 * 1000,
    ...options?.hasPermission,
  });

  return {
    delegation,
    hasPermission,
  };
}

/**
 * Hook for contract state queries
 *
 * @example
 * ```tsx
 * function ContractStatus() {
 *   const { isPaused } = useContractState(client, chainInfo);
 *
 *   return (
 *     <div>
 *       Contract: {isPaused.data ? 'Paused' : 'Active'}
 *     </div>
 *   );
 * }
 * ```
 */
export function useContractState(
  client: OnchainMailerClient,
  chainInfo: ChainInfo,
  publicClientOrConnection?: PublicClient | Connection,
  options?: {
    isPaused?: Omit<UseQueryOptions<boolean, Error>, 'queryKey' | 'queryFn'>;
  }
) {
  const isPaused = useQuery({
    queryKey: mailerQueryKeys.isPaused(),
    queryFn: () => {
      if (chainInfo.chainType === ChainType.EVM) {
        return client.isPaused(chainInfo, publicClientOrConnection as PublicClient | undefined);
      } else {
        return client.isPaused(chainInfo, undefined, publicClientOrConnection as Connection | undefined);
      }
    },
    staleTime: 30 * 1000,
    ...options?.isPaused,
  });

  return {
    isPaused,
  };
}

/**
 * Helper hook to get wallet address from different wallet types
 *
 * @example
 * ```tsx
 * function WalletDisplay({ wallet }: { wallet: Wallet }) {
 *   const address = useWalletAddress(wallet);
 *   return <div>Address: {address}</div>;
 * }
 * ```
 */
export function useWalletAddress(wallet?: Wallet): string | undefined {
  if (!wallet) return undefined;

  // For EVM wallets
  if ('walletClient' in wallet && wallet.walletClient) {
    return wallet.walletClient.account?.address;
  }

  // For Solana wallets
  if ('wallet' in wallet && wallet.wallet) {
    return wallet.wallet.publicKey?.toString();
  }

  return undefined;
}

/**
 * Helper hook to get chain type from ChainInfo
 *
 * @example
 * ```tsx
 * function ChainBadge({ chainInfo }: { chainInfo: ChainInfo }) {
 *   const chainType = useChainType(chainInfo);
 *   return <div>Chain: {chainType}</div>;
 * }
 * ```
 */
export function useChainType(chainInfo: ChainInfo): ChainType {
  return chainInfo.chainType || ChainType.EVM;
}

// ========== Legacy individual hooks for backward compatibility ==========
// These use context for convenience but the grouped hooks above are preferred

import { useMailerContext } from '../context/MailerProvider';

/**
 * @deprecated Use useFees() instead
 */
export function useGetSendFee(
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const { client, chainInfo } = useMailerContext();
  const { sendFee } = useFees(client, chainInfo, undefined, { sendFee: options });
  return sendFee;
}

/**
 * @deprecated Use useFees() instead
 */
export function useGetDelegationFee(
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const { client, chainInfo } = useMailerContext();
  const { delegationFee } = useFees(client, chainInfo, undefined, { delegationFee: options });
  return delegationFee;
}

/**
 * @deprecated Use useClaimableAmounts() instead
 */
export function useGetClaimableAmount(
  address?: string,
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const { client, chainInfo } = useMailerContext();
  const { claimableAmount } = useClaimableAmounts(client, chainInfo, address, undefined, { claimableAmount: options });
  return claimableAmount;
}

/**
 * @deprecated Use useClaimableAmounts() instead
 */
export function useGetOwnerClaimable(
  options?: Omit<UseQueryOptions<bigint, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<bigint, Error> {
  const { client, chainInfo } = useMailerContext();
  const { ownerClaimable } = useClaimableAmounts(client, chainInfo, undefined, undefined, { ownerClaimable: options });
  return ownerClaimable;
}

/**
 * @deprecated Use useDelegationAndPermissions() instead
 */
export function useGetDelegation(
  address?: string,
  options?: Omit<UseQueryOptions<string | null, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<string | null, Error> {
  const { client, chainInfo } = useMailerContext();
  const { delegation } = useDelegationAndPermissions(
    client,
    chainInfo,
    { delegationAddress: address },
    undefined,
    { delegation: options }
  );
  return delegation;
}

/**
 * @deprecated Use useContractState() instead
 */
export function useIsPaused(
  options?: Omit<UseQueryOptions<boolean, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<boolean, Error> {
  const { client, chainInfo } = useMailerContext();
  const { isPaused } = useContractState(client, chainInfo, undefined, { isPaused: options });
  return isPaused;
}

/**
 * @deprecated Use useDelegationAndPermissions() instead
 */
export function useHasPermission(
  contractAddress?: string,
  walletAddress?: string,
  options?: Omit<UseQueryOptions<boolean, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<boolean, Error> {
  const { client, chainInfo } = useMailerContext();
  const { hasPermission } = useDelegationAndPermissions(
    client,
    chainInfo,
    { contractAddress, walletAddress },
    undefined,
    { hasPermission: options }
  );
  return hasPermission;
}
import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { paymentService } from '@/lib/api/paymentService';
import type { BridgeNumberResult } from '@/lib/api/paymentService';

/**
 * useBridgeNumber — Fetches the user's assigned bridge phone number.
 *
 * Single Responsibility: Only manages bridge number server state via React Query.
 * Only enabled for representatives with completed registration.
 */
export function useBridgeNumber(enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery<BridgeNumberResult>({
    queryKey: QUERY_KEYS.PAYMENTS.BRIDGE_NUMBER,
    queryFn: () => paymentService.getBridgeNumber(),
    enabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  return {
    bridgeNumber: data?.bridgeNumber ?? null,
    status: data?.status ?? 'provisioning',
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

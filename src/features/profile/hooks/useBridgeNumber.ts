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
    queryFn: async () => {
      const current = await paymentService.getBridgeNumber();
      if (current.bridgeNumber) return current;
      // No number yet. A plan can grant one without a payment, and then
      // nothing else ever requests it, so ask here. A plan without the
      // feature answers 403 and the plain result stands.
      try {
        return await paymentService.claimBridgeNumber();
      } catch {
        return current;
      }
    },
    enabled,
    // Provisioning lands a few seconds after the claim: keep asking until the
    // number shows up, then settle into the normal cache window.
    refetchInterval: (query) => (query.state.data?.bridgeNumber ? false : 4000),
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

import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { paymentService } from '@/lib/api/paymentService';
import type { BridgeNumberResult } from '@/lib/api/paymentService';
import { useAuthStore } from '@/stores/authStore';
import { createBridgeNumberWatch, onItsWay } from './bridgeNumberWatch';

// One watch for the app: Settings and the profile share the query, and the
// waits it keeps are per account.
const watch = createBridgeNumberWatch({
  get: () => paymentService.getBridgeNumber(),
  claim: () => paymentService.claimBridgeNumber(),
});

/**
 * useBridgeNumber — Fetches the user's assigned bridge phone number.
 *
 * Single Responsibility: Only manages bridge number server state via React
 * Query. When and how often the server is asked lives in bridgeNumberWatch.
 */
export function useBridgeNumber(enabled: boolean = true) {
  const account = useAuthStore((s) => (s.user?.id != null ? String(s.user.id) : ''));
  const { data, isLoading, error, refetch } = useQuery<BridgeNumberResult>({
    queryKey: QUERY_KEYS.PAYMENTS.BRIDGE_NUMBER,
    queryFn: () => watch.load(account),
    enabled: enabled && !!account,
    refetchInterval: (query) => watch.pollMs(account, query.state.data),
    // While a number is on its way every opening of the screen looks again;
    // any other answer keeps for five minutes.
    staleTime: (query) => (onItsWay(query.state.data) ? 0 : 1000 * 60 * 5),
    gcTime: 1000 * 60 * 30,
    retry: 2,
  });

  return {
    bridgeNumber: data?.bridgeNumber ?? null,
    // Unknown while loading reads as "on its way" (the row shows its
    // spinner); unknown after a failed load reads as none, never as a
    // number being set up.
    status: data?.status ?? (isLoading ? 'provisioning' : 'unavailable'),
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

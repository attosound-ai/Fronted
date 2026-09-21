import { useQuery } from '@tanstack/react-query';
import { paymentService } from '@/lib/api/paymentService';
import { QUERY_KEYS } from '@/constants/queryKeys';

/**
 * Is there still something to sell? The admin dashboard assigns features to
 * plans; while at least one feature is granted only by a paid plan the app
 * shows its subscription surfaces. When the free plan grants everything they
 * hide. Unknown (loading or failed) reads as `true`: a missing paywall must
 * never come from a network hiccup.
 */
export function usePaywallRequired(): boolean {
  const query = useQuery({
    queryKey: QUERY_KEYS.PAYWALL.CONFIG,
    queryFn: () => paymentService.getPaywall(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return query.data?.required ?? true;
}

/** Testing period switch: the profile shows a plan picker while this is on. */
export function useFreePlanSwitching(): boolean {
  const query = useQuery({
    queryKey: QUERY_KEYS.PAYWALL.CONFIG,
    queryFn: () => paymentService.getPaywall(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  return query.data?.freeSwitching === true;
}

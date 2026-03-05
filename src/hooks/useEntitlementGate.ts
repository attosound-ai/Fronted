import { useState, useCallback } from 'react';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import type { Entitlement } from '@/types';

export function useEntitlementGate(entitlement: Entitlement) {
  const hasEntitlement = useSubscriptionStore((s) => s.hasEntitlement);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const guard = useCallback(() => {
    if (hasEntitlement(entitlement)) return true;
    setPaywallVisible(true);
    return false;
  }, [entitlement, hasEntitlement]);

  return {
    allowed: hasEntitlement(entitlement),
    guard,
    paywallVisible,
    dismissPaywall: () => setPaywallVisible(false),
  };
}

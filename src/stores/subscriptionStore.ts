import { create } from 'zustand';
import { paymentService } from '@/lib/api/paymentService';
import type { UserSubscription, Entitlement, PlanId } from '@/types';

/** Map legacy backend plan values to new PlanId values. */
const LEGACY_PLAN_MAP: Record<string, PlanId> = {
  free: 'connect_free',
  basic: 'record',
  premium: 'record_pro',
  artist_pro: 'record_pro',
  annual: 'record',
  monthly: 'record',
};

function normalizePlan(plan: string): PlanId {
  return (LEGACY_PLAN_MAP[plan] ?? plan) as PlanId;
}

const FREE_SUBSCRIPTION: UserSubscription = {
  id: '',
  plan: 'connect_free',
  status: 'active',
  startsAt: '',
  expiresAt: '',
  entitlements: ['browse_search', 'listen', 'comment'],
};

interface SubscriptionState {
  subscription: UserSubscription | null;
  isLoading: boolean;
}

interface SubscriptionActions {
  fetchSubscription: () => Promise<void>;
  hasEntitlement: (entitlement: Entitlement) => boolean;
  getPlan: () => PlanId;
  getPendingChange: () => UserSubscription['pendingChange'];
  clear: () => void;
}

export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>(
  (set, get) => ({
    subscription: null,
    isLoading: false,

    fetchSubscription: async () => {
      set({ isLoading: true });
      try {
        const sub = await paymentService.getMySubscription();
        set({ subscription: sub, isLoading: false });
      } catch {
        // 404 or error → default to free tier
        set({ subscription: FREE_SUBSCRIPTION, isLoading: false });
      }
    },

    hasEntitlement: (entitlement: Entitlement) => {
      const sub = get().subscription;
      if (!sub?.entitlements) return false;
      return sub.entitlements.includes(entitlement);
    },

    getPlan: () => normalizePlan(get().subscription?.plan ?? 'connect_free'),

    getPendingChange: () => get().subscription?.pendingChange ?? null,

    clear: () => set({ subscription: null, isLoading: false }),
  })
);

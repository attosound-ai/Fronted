import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';
import { paymentService } from '@/lib/api/paymentService';
import { useAuthStore } from './authStore';
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

/** The id of the currently-authenticated account (call-time; circular-safe). */
function activeUserId(): number | null {
  return useAuthStore.getState().user?.id ?? null;
}

// Backoff schedule for NON-404 fetch errors. A transient network/5xx/timeout on
// the one populating fetch used to strand the plan at "—" forever (no retry, no
// self-heal); these delays give it a chance to recover before giving up.
const FETCH_RETRY_DELAYS_MS = [500, 1500, 4000];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * In-flight dedup so the multiple fetch triggers (tabs mount, account switch,
 * profile focus, active-account-id change) coalesce into ONE round-trip instead
 * of interleaving retry loops. Keyed by the account the fetch is FOR, so a switch
 * to a different account is never coalesced onto the previous account's fetch.
 */
let inFlightFetch: { userId: number | null; promise: Promise<void> } | null = null;

interface SubscriptionState {
  subscription: UserSubscription | null;
  /**
   * The account id the cached `subscription` belongs to. The store is a single
   * global object but subscriptions are PER-ACCOUNT, and it is MMKV-persisted, so
   * on launch (or in the window before a fetch completes) the rehydrated value
   * could belong to a DIFFERENT account than the one now active — which showed a
   * paying rep "Connect (Free)" until an account round-trip forced a refetch. We
   * tag every cached subscription with its owner and NEVER honor it for a
   * different account (see `validSubscription`).
   */
  ownerUserId: number | null;
  isLoading: boolean;
  /** Whether the persisted store has rehydrated from disk yet. */
  hasHydrated: boolean;
  /**
   * True when the LAST fetch exhausted its retries on a non-404 error (or couldn't
   * tag an owner). Distinct from "unknown" (nothing fetched yet): a genuine error
   * state that the focus/mount self-heal effects use to know a refetch is worth it.
   * Runtime-only — never persisted (see partialize).
   */
  lastFetchFailed: boolean;
}

interface SubscriptionActions {
  fetchSubscription: () => Promise<void>;
  hasEntitlement: (entitlement: Entitlement) => boolean;
  getPlan: () => PlanId;
  /**
   * The plan for the active account, or null when it isn't loaded yet (owner
   * mismatch / pre-fetch). UI should render a loading state on null rather than
   * defaulting to "Connect Free" (which flashed the wrong plan on launch/switch).
   */
  getResolvedPlan: () => PlanId | null;
  getPendingChange: () => UserSubscription['pendingChange'];
  /**
   * Tri-state entitlement for navigation decisions: true (definitely has it),
   * false (definitely does NOT — a subscription for THIS account is loaded and
   * lacks it), or null (unknown — nothing loaded for the active account yet, so
   * callers must not assume free). Used by the /call → /recording hand-off.
   */
  entitlementState: (entitlement: Entitlement) => boolean | null;
  clear: () => void;
}

// MMKV-backed adapter for zustand persist (sync native storage → fast rehydrate).
const mmkvPersistAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>()(
  persist(
    (set, get) => {
      /**
       * The cached subscription ONLY if it belongs to the currently-active
       * account. Returns null on any owner mismatch (stale cross-account value)
       * so no reader ever shows another account's plan.
       */
      const validSubscription = (): UserSubscription | null => {
        const { subscription, ownerUserId } = get();
        if (subscription == null) return null;
        const active = activeUserId();
        // ownerUserId null = legacy/pre-tag cache → treat as not-for-this-account.
        return ownerUserId != null && ownerUserId === active ? subscription : null;
      };

      return {
        subscription: null,
        ownerUserId: null,
        isLoading: false,
        hasHydrated: false,
        lastFetchFailed: false,

        fetchSubscription: async () => {
          // The account we're fetching FOR (the active session token decides which
          // account getMySubscription returns).
          const startId = activeUserId();

          // Coalesce concurrent fetches for the SAME active account so the four
          // triggers don't spin up interleaving retry loops.
          if (inFlightFetch && inFlightFetch.userId === startId) {
            return inFlightFetch.promise;
          }

          const run = async (): Promise<void> => {
            set({ isLoading: true });

            // Re-derive the owner at WRITE time (not fetch-start): if the account
            // switched mid-flight, drop the write and let the new account's fetch
            // populate; if auth isn't resolved yet, mark failed so a self-heal
            // effect retries once the user id exists — never tag with null.
            const writeOwned = (sub: UserSubscription): boolean => {
              const endId = activeUserId();
              // Drop the write whenever the active account no longer matches the one
              // we fetched FOR — a mid-flight switch (endId=other) OR a logout
              // (endId=null, clear() already wiped the store). Falling back to
              // owner=startId in the logout case would RESURRECT the just-fetched sub
              // into the cleared store, so guard on endId!==startId, not both-non-null.
              if (startId != null && endId !== startId) {
                set({ isLoading: false });
                return false;
              }
              const owner = endId ?? startId;
              if (owner == null) {
                set({ isLoading: false, lastFetchFailed: true });
                return false;
              }
              set({
                subscription: sub,
                ownerUserId: owner,
                isLoading: false,
                lastFetchFailed: false,
              });
              return true;
            };

            for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
              try {
                const sub = await paymentService.getMySubscription();
                writeOwned(sub);
                return;
              } catch (err: unknown) {
                const status = (err as { response?: { status?: number } })?.response
                  ?.status;
                if (status === 404) {
                  // Genuinely no subscription → free tier (definitive for this account).
                  writeOwned(FREE_SUBSCRIPTION);
                  return;
                }
                // Transient network/5xx/timeout — retry with backoff. We must NOT
                // fabricate "free" here (that turned a paid account into Connect-Free
                // on a flaky launch), so on the LAST attempt we leave the cache as-is
                // and flag the failure so the tabs/profile effects re-drive a refetch.
                if (attempt < FETCH_RETRY_DELAYS_MS.length) {
                  await sleep(FETCH_RETRY_DELAYS_MS[attempt]);
                }
              }
            }
            set({ isLoading: false, lastFetchFailed: true });
          };

          const promise = run().finally(() => {
            // Key teardown on THIS promise's identity, not userId: a slow STALE
            // same-user fetch (user1→user2→user1 while pA is in flight) must not
            // clear the newer live entry and reopen a dedup gap.
            if (inFlightFetch && inFlightFetch.promise === promise) inFlightFetch = null;
          });
          inFlightFetch = { userId: startId, promise };
          return promise;
        },

        hasEntitlement: (entitlement: Entitlement) => {
          const sub = validSubscription();
          if (!sub?.entitlements) return false;
          return sub.entitlements.includes(entitlement);
        },

        getPlan: () => normalizePlan(validSubscription()?.plan ?? 'connect_free'),

        getResolvedPlan: () => {
          const sub = validSubscription();
          return sub ? normalizePlan(sub.plan) : null;
        },

        getPendingChange: () => validSubscription()?.pendingChange ?? null,

        entitlementState: (entitlement: Entitlement) => {
          const sub = validSubscription();
          // A subscription IS loaded for the active account → definitive answer.
          // (A genuinely-free account holds FREE_SUBSCRIPTION, which lacks paid
          // entitlements, so this correctly returns false for them.)
          if (sub?.entitlements) return sub.entitlements.includes(entitlement);
          // Nothing loaded for the active account yet → unknown. Callers (the /call
          // hand-off) treat null as "optimistically record-capable" so a paying rep
          // is never bounced to the feed during the pre-fetch window.
          return null;
        },

        clear: () =>
          set({
            subscription: null,
            ownerUserId: null,
            isLoading: false,
            lastFetchFailed: false,
          }),
      };
    },
    {
      name: 'atto_subscription',
      storage: createJSONStorage(() => mmkvPersistAdapter),
      // Persist the subscription AND its owner so a cross-account stale value is
      // detectable on rehydrate. isLoading/hasHydrated are runtime flags.
      partialize: (state) => ({
        subscription: state.subscription,
        ownerUserId: state.ownerUserId,
      }),
      onRehydrateStorage: () => (state) => {
        useSubscriptionStore.setState({ hasHydrated: true });
        void state; // may be undefined if nothing was stored
      },
    }
  )
);

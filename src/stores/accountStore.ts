import { create } from 'zustand';
import { AxiosError } from 'axios';
import { authService } from '@/lib/api/authService';
import { authStorage } from '@/lib/auth/storage';
import { getSessionEpoch, bumpSessionEpoch } from '@/lib/auth/sessionEpoch';
import { getTokenUserId } from '@/lib/auth/jwt';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  getAccountIds,
  setAccountIds,
  getAccountTokens,
  setAccountTokens,
  getAccountUser,
  setAccountUser,
  clearAccount,
  clearAllAccountData,
  setActiveAccountId,
  getActiveAccountId,
} from '@/lib/auth/storage';
import { queryClient } from '@/lib/queryClient';
import { pauseRequests, resumeRequests, clearRefreshQueue } from '@/lib/api/client';
import type { TokenPair, User } from '@/types';

export interface AccountEntry {
  user: User;
  tokens: TokenPair;
}

/**
 * The backend's "forbidden: accounts are not linked" rejection. Reaching it
 * from the switcher means either the link is truly gone, or — the Aug 1 2026
 * incident — our own identity drifted (UI says account A, token is account
 * B, so the switch became a self-switch the server rightly refuses).
 */
function isNotLinkedError(error: unknown): boolean {
  if (!(error instanceof AxiosError)) return false;
  if (error.response?.status !== 403) return false;
  const body = error.response?.data as { error?: string } | undefined;
  return typeof body?.error === 'string' && body.error.includes('not linked');
}

interface AccountState {
  accounts: AccountEntry[];
  activeAccountId: number | null;
  previousAccountId: number | null;
}

interface AccountActions {
  addAccount: (entry: AccountEntry) => Promise<void>;
  setActive: (userId: number) => Promise<void>;
  /**
   * `allowHealRetry` (default true) permits ONE identity reconciliation +
   * retry when the backend answers 403 "accounts are not linked" — the
   * signature of a UI/token identity desync, not of a user mistake.
   */
  switchToAccount: (userId: number, allowHealRetry?: boolean) => Promise<void>;
  /**
   * System-initiated switch in response to an incoming call invite whose
   * TargetUserId differs from activeAccountId. Bypasses the
   * CANNOT_SWITCH_DURING_ACTIVE_CALL preflight (the invite is pre-accept,
   * not a live call yet), skips the flip animation (would clash with
   * CallKit's native ring), and skips the subscription fetch / Phase B
   * fire-and-forget — those are latency-sensitive and the call screen
   * triggers its own data fetches.
   *
   * Throws `TARGET_ACCOUNT_NOT_LINKED` if the target id is not in the
   * device's linked account list — caller decides whether to proceed
   * with the call on the current account or reject.
   */
  switchToAccountForIncomingCall: (userId: number) => Promise<void>;
  removeAccount: (userId: number) => Promise<void>;
  loadAccounts: () => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useAccountStore = create<AccountState & AccountActions>((set, get) => {
  /**
   * Phase A core — the synchronous tail of any account swap. Reused by
   * the user-initiated `switchToAccount` (which wraps it with animation,
   * rollback, and Phase B background sync) and the system-initiated
   * `switchToAccountForIncomingCall` (which uses only the core).
   *
   * Contract: assumes the caller has already obtained fresh tokens via
   * `authService.switchAccount(userId)` and registered the entry via
   * `addAccount`. Always pairs `pauseRequests()` with `resumeRequests()`
   * inside the same call so the request queue can never leak open.
   */
  const applyAccountSwitchCore = async (
    userId: number,
    user: User,
    tokens: TokenPair,
    prevActiveId: number | null
  ) => {
    // Ownership changes NOW: any in-flight initialize/refresh result from
    // the previous identity becomes stale and must discard itself.
    bumpSessionEpoch();
    pauseRequests();
    clearRefreshQueue();

    await Promise.all([
      authStorage.setToken(tokens.accessToken),
      authStorage.setRefreshToken(tokens.refreshToken),
      authStorage.setUser(user),
      setActiveAccountId(userId),
    ]);

    set({
      activeAccountId: userId,
      previousAccountId:
        prevActiveId !== null && prevActiveId !== userId
          ? prevActiveId
          : get().previousAccountId,
    });

    // Invalidate ALL query caches to prevent stale data from previous account
    queryClient.clear();

    // Reset unread badge immediately so it doesn't flash the old account's count
    const { useChatStore } = await import('@/features/messages/stores/chatStore');
    useChatStore.getState().setTotalUnread(0);

    // Clear follow state from previous account
    const { useFollowStore } = await import('./followStore');
    useFollowStore.getState().clear();

    // Sync authStore with fresh user
    const { useAuthStore } = await import('./authStore');
    useAuthStore.getState().setUser(user);

    // Unblock requests — they will now use the new token
    resumeRequests();
  };

  return {
    accounts: [],
    activeAccountId: null,
    previousAccountId: null,

    /**
     * Persist a new account entry (tokens + user) to SecureStore and in-memory state.
     * If the account already exists, its data is updated.
     */
    addAccount: async (entry: AccountEntry) => {
      const { accounts } = get();
      const id = entry.user.id;

      await setAccountTokens(id, entry.tokens);
      await setAccountUser(id, entry.user);

      const existingIds = await getAccountIds();
      if (!existingIds.includes(id)) {
        await setAccountIds([...new Set([...existingIds, id])]);
      }

      // Deduplicate by user.id (coerce to number for safety)
      const next = accounts.filter((a) => Number(a.user.id) !== Number(id)).concat(entry);
      set({ accounts: next });
    },

    /**
     * Mark an account as the active session. Keeps SecureStore and in-memory
     * state in sync. Used by authStore after login/register so the bottom sheet
     * reflects the currently authenticated user.
     */
    setActive: async (userId: number) => {
      await setActiveAccountId(userId);
      set((s) => ({
        activeAccountId: userId,
        previousAccountId:
          s.activeAccountId && s.activeAccountId !== userId
            ? s.activeAccountId
            : s.previousAccountId,
      }));
    },

    /**
     * Switch active session to the given userId.
     *
     * Optimistic, non-blocking design (Instagram-style):
     *  Phase A — Synchronous swap (~50ms): write cached tokens, update state, end animation
     *  Phase B — Fire-and-forget: getMe, fetchSubscription, WebSocket reconnect in parallel
     *  Phase C — Error handling: if Phase A fails, reconcile identity (403
     *            not-linked) and retry once, else rollback
     */
    switchToAccount: async (userId: number, allowHealRetry: boolean = true) => {
      const { accounts, activeAccountId } = get();

      // No-op when the target is already the authenticated account. The
      // backend treats a self-switch as "accounts are not linked" (403), so
      // reaching it with userId === current would fail pointlessly.
      const { useAuthStore: authStorePreflight } = await import('./authStore');
      const currentId = authStorePreflight.getState().user?.id ?? activeAccountId;
      if (currentId !== null && Number(currentId) === Number(userId)) {
        return;
      }

      // Preflight: do not allow switching while a call is active.
      // Tearing down the Twilio + CallKit + audio session mid-conversation
      // is fragile and degrades the experience for both sides. The bottom
      // sheet handler catches this code and surfaces a toast.
      const { useCallStore } = await import('./callStore');
      if (useCallStore.getState().activeCall != null) {
        const err = new Error('CANNOT_SWITCH_DURING_ACTIVE_CALL');
        (err as Error & { code?: string }).code = 'CANNOT_SWITCH_DURING_ACTIVE_CALL';
        throw err;
      }

      // Save rollback state
      const prevToken = await authStorage.getToken();
      const prevRefreshToken = await authStorage.getRefreshToken();
      const prevUser = await authStorage.getUser<User>();
      const prevActiveId = activeAccountId;

      // Trigger flip animation optimistically using cached user info
      const { useAccountSwitchAnimationStore } =
        await import('./accountSwitchAnimationStore');
      const cachedUser = accounts.find((a) => a.user.id === userId)?.user;
      if (cachedUser) {
        useAccountSwitchAnimationStore
          .getState()
          .startFlip({ username: cachedUser.username, avatar: cachedUser.avatar });
      }

      try {
        // Always get fresh tokens from the backend via the current session.
        // Previously, cached tokens from the accounts array were used directly,
        // but they become stale after access/refresh token expiry and caused
        // session death when the interceptor tried to refresh expired tokens.
        const { user, tokens } = await authService.switchAccount(userId);
        const entry = { user, tokens };
        await get().addAccount(entry);

        if (!cachedUser) {
          useAccountSwitchAnimationStore
            .getState()
            .startFlip({ username: user.username, avatar: user.avatar });
        }

        // ── Phase A: Synchronous swap (target: <50ms) ──
        // Block all API requests while tokens are being swapped to prevent
        // race conditions where requests use the old account's token.
        await applyAccountSwitchCore(userId, user, tokens, activeAccountId);

        // Clear the previous account's subscription cache BEFORE fetching the
        // new one. Otherwise the brief window between swap and fetch shows the
        // stale subscription (e.g. user just paid for the managed creator,
        // switched to it, but momentarily saw "Connect (Free)" from the
        // representative's store).
        const { useSubscriptionStore } = await import('./subscriptionStore');
        useSubscriptionStore.getState().clear();

        // Refresh the subscription BEFORE ending the animation. This trades
        // ~200-400ms of switch latency for correctness — users never see a
        // stale plan after switching. Other state (websocket, unread badge)
        // can still be fire-and-forget below.
        try {
          await useSubscriptionStore.getState().fetchSubscription();
        } catch {
          // Non-fatal. fetchSubscription self-retries (bounded backoff) and never
          // rejects; a persistent failure leaves the plan UNRESOLVED ("—", NOT free
          // — a cleared store does not default to free), and the tabs/profile
          // self-heal effects (keyed on activeAccountId / focus) re-drive it.
        }

        // End animation NOW — user sees the new account with the right plan
        useAccountSwitchAnimationStore.getState().endFlip();

        // ── Phase B: Fire-and-forget background sync ──
        // Tokens are fresh from switchAccount(), so these calls won't trigger
        // 401 cascades that previously nuked the session.
        Promise.allSettled([
          // Reconnect WebSocket (non-blocking)
          import('@/lib/api/phoenixSocket').then(({ phoenixSocket }) => {
            phoenixSocket.disconnect();
            // Tokens are already swapped to the new account at this point, so
            // connect() picks up the right JWT (auth derives the user from it).
            phoenixSocket.connect();
          }),
          // Refresh unread message badge for new account
          Promise.all([
            import('@/features/messages/services/messageService'),
            import('@/features/messages/stores/chatStore'),
          ]).then(async ([{ messageService }, { useChatStore: chatStore }]) => {
            const convos = await messageService.getConversations();
            const unread = convos.reduce(
              (sum: number, c: { unreadCount: number }) => sum + c.unreadCount,
              0
            );
            chatStore.getState().setTotalUnread(unread);
          }),
        ]).catch(() => {
          // All errors are non-fatal — cached data is already displayed
        });

        return; // Skip finally's endFlip — already called above
      } catch (error) {
        // ── Phase C: reconcile-or-rollback ──
        if (isNotLinkedError(error) && allowHealRetry) {
          // The server refused the link. If our own identity drifted (UI
          // user ≠ token subject), the request was really a self-switch —
          // reconcile against the server, then retry the switch ONCE with
          // a coherent identity.
          //
          // Unblock the request pipe FIRST: reconcile runs getMe through
          // apiClient, which would queue forever if a pause leaked from a
          // partial Phase A (deadlock). Resuming when not paused is a no-op.
          resumeRequests();
          const { useAuthStore } = await import('./authStore');
          const healed = await useAuthStore
            .getState()
            .reconcileServerIdentity('switch_not_linked');
          if (healed) {
            useAccountSwitchAnimationStore.getState().endFlip();
            if (Number(healed.id) === Number(userId)) {
              // The heal itself landed us on the requested account.
              return;
            }
            return get().switchToAccount(userId, false);
          }
        }

        // Rollback: restore the previous identity wholesale.
        console.warn('[AccountSwitch] Failed, rolling back:', error);
        bumpSessionEpoch();
        if (prevToken) await authStorage.setToken(prevToken);
        if (prevRefreshToken) await authStorage.setRefreshToken(prevRefreshToken);
        if (prevUser) {
          await authStorage.setUser(prevUser);
          const { useAuthStore } = await import('./authStore');
          useAuthStore.getState().setUser(prevUser);
        }
        if (prevActiveId) {
          await setActiveAccountId(prevActiveId);
          set({ activeAccountId: prevActiveId });
        }
        resumeRequests(); // Unblock requests even on failure
        useAccountSwitchAnimationStore.getState().endFlip();
      }
    },

    switchToAccountForIncomingCall: async (userId: number) => {
      const { accounts, activeAccountId } = get();
      if (activeAccountId === userId) return; // no-op
      if (!accounts.some((a) => Number(a.user.id) === Number(userId))) {
        const err = new Error('TARGET_ACCOUNT_NOT_LINKED');
        (err as Error & { code?: string }).code = 'TARGET_ACCOUNT_NOT_LINKED';
        throw err;
      }

      // No `CANNOT_SWITCH_DURING_ACTIVE_CALL` preflight: this is invoked by
      // the Voice SDK invite handler, which fires BEFORE `setIncomingCall`
      // — the "active call" guard would race against the very thing
      // populating it.
      //
      // No animation: CallKit's native ring UI is already presenting; an
      // overlapping flip would be jarring and possibly invisible anyway.
      //
      // No Phase B (websocket reconnect, unread refresh): not on the
      // critical path for receiving the call; the relevant screens
      // trigger their own data fetches when navigated to post-call.
      //
      // Retry on Network Error specifically: when iOS resumes the app
      // from a suspended-background PushKit invite, the JS thread runs
      // *before* the network stack has finished warming up. The first
      // POST to /auth/switch-account fails synchronously with
      // "Network Error" inside ~100 ms. A short backoff lets the radio
      // come back, then the switch succeeds. CallKit is already
      // ringing/connected on the OS side during this delay, so the
      // extra latency is not user-visible — the upside is that the call
      // lands in the correct account context (subscription, recording,
      // post-call screens). Observed in production cold-launch flows
      // where rep was the last active session but the call routed to
      // the linked creator.
      const COLD_LAUNCH_RETRY_DELAYS_MS = [300, 800];
      let switchedTokens: { user: User; tokens: TokenPair } | null = null;
      let lastSwitchErr: unknown = null;
      for (let attempt = 0; attempt <= COLD_LAUNCH_RETRY_DELAYS_MS.length; attempt++) {
        try {
          switchedTokens = await authService.switchAccount(userId);
          break;
        } catch (err: unknown) {
          lastSwitchErr = err;
          const message = err instanceof Error ? err.message : String(err);
          const isNetworkError =
            message.includes('Network Error') ||
            message.includes('Network request failed');
          if (!isNetworkError || attempt >= COLD_LAUNCH_RETRY_DELAYS_MS.length) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, COLD_LAUNCH_RETRY_DELAYS_MS[attempt]));
        }
      }
      if (!switchedTokens) {
        throw lastSwitchErr ?? new Error('switchAccount failed');
      }
      const { user, tokens } = switchedTokens;
      await get().addAccount({ user, tokens });
      await applyAccountSwitchCore(userId, user, tokens, activeAccountId);

      // Subscription cache belongs to the previous account. Clear it
      // synchronously so subscription-gated UI (recording screen, bridge
      // settings, etc.) never shows the previous account's plan after
      // the auto-switch — early observed bug where a representative's
      // Connect Free state persisted into the creator's session and
      // blocked recording even though the backend had `plan=record`.
      // Fetch is fire-and-forget: by the time the user clears CallKit
      // and lands on the home screen, the correct plan is cached.
      const { useSubscriptionStore } = await import('./subscriptionStore');
      useSubscriptionStore.getState().clear();
      void useSubscriptionStore.getState().fetchSubscription();
    },

    removeAccount: async (userId: number) => {
      const { accounts, activeAccountId } = get();
      await clearAccount(userId);

      const remaining = accounts.filter((a) => a.user.id !== userId);
      const remainingIds = remaining.map((a) => a.user.id);
      await setAccountIds(remainingIds);

      set({
        accounts: remaining,
        activeAccountId: activeAccountId === userId ? null : activeAccountId,
      });
    },

    /**
     * Hydrate accounts from SecureStore on app start.
     * Called from authStore.initialize() after the user session is confirmed.
     *
     * The whole pass is epoch-checked: if the session changes hands while
     * this runs (login, switch, PushKit auto-switch), the computed list
     * belongs to the previous identity and the pass restarts from scratch
     * instead of applying stale results.
     */
    loadAccounts: async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const epochAtStart = getSessionEpoch();

        const ids = await getAccountIds();
        const seen = new Set<number>();
        const uniqueIds: number[] = [];
        for (const id of ids) {
          const numId = Number(id);
          if (!seen.has(numId)) {
            seen.add(numId);
            uniqueIds.push(numId);
          }
        }

        // Parallel SecureStore reads — all accounts at once
        const raw = await Promise.all(
          uniqueIds.map(async (id) => {
            const [tokens, user] = await Promise.all([
              getAccountTokens(id),
              getAccountUser(id),
            ]);
            return { id, tokens, user };
          })
        );

        const entries: AccountEntry[] = [];
        for (const { id, tokens, user } of raw) {
          if (tokens && user && user.id) {
            entries.push({ user, tokens });
          } else {
            await clearAccount(id);
          }
        }

        // Deduplicate by user.id (in case of type mismatches in storage)
        const uniqueEntries: AccountEntry[] = [];
        const seenUserIds = new Set<number>();
        for (const entry of entries) {
          const uid = Number(entry.user.id);
          if (!seenUserIds.has(uid)) {
            seenUserIds.add(uid);
            uniqueEntries.push(entry);
          } else {
            // Duplicate — clean from storage
            await clearAccount(entry.user.id);
          }
        }

        // Validate: only keep the authenticated user + their linked accounts.
        // This purges ghost accounts from previous DB wipes.
        //
        // The purge anchor is the TOKEN's subject, never the UI user: the
        // linked-accounts response describes whoever the Authorization
        // header authenticated as. On Aug 1 2026 the two diverged and the
        // UI-anchored purge deleted a real account from SecureStore. If
        // they disagree, we skip the purge entirely and self-heal instead.
        const { useAuthStore } = await import('./authStore');
        const currentUser = useAuthStore.getState().user;
        let validEntries = uniqueEntries;

        if (currentUser) {
          const accessToken = await authStorage.getToken();
          const tokenUserId = getTokenUserId(accessToken);
          const identityCoherent =
            tokenUserId !== null && Number(currentUser.id) === tokenUserId;

          if (tokenUserId !== null && !identityCoherent) {
            analytics.capture(ANALYTICS_EVENTS.AUTH.IDENTITY_DESYNC_DETECTED, {
              source: 'load_accounts',
              ui_user_id: currentUser.id,
              token_user_id: tokenUserId,
            });
            void useAuthStore.getState().reconcileServerIdentity('load_accounts_desync');
          } else if (identityCoherent) {
            try {
              const linkedUsers = await authService.getLinkedAccounts();
              if (getSessionEpoch() !== epochAtStart) continue; // stale — redo
              const validIds = new Set<number>([
                tokenUserId,
                ...linkedUsers.map((u: { id: number }) => Number(u.id)),
              ]);
              const ghosts = uniqueEntries.filter(
                (e) => !validIds.has(Number(e.user.id))
              );
              validEntries = uniqueEntries.filter((e) => validIds.has(Number(e.user.id)));

              // Clean invalid entries from storage
              for (const ghost of ghosts) {
                await clearAccount(ghost.user.id);
              }
              if (ghosts.length > 0) {
                analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_GHOST_PURGED, {
                  anchor_user_id: tokenUserId,
                  purged_user_ids: ghosts.map((g) => g.user.id),
                });
              }
            } catch {
              // If linked accounts API fails, keep all entries (don't purge blindly)
            }
          }
          // tokenUserId === null (unreadable token) → keep all entries.
        }

        if (getSessionEpoch() !== epochAtStart) continue; // stale — redo

        // Sync storage with cleaned list
        await setAccountIds(validEntries.map((e) => e.user.id));

        let activeId = await getActiveAccountId();
        // Reconcile with the authenticated session. The authStore user is the
        // source of truth for "who is logged in right now"; a stale or mismatched
        // activeAccountId in SecureStore must yield to it.
        //
        // CRITICAL: re-read the user here instead of using the `currentUser`
        // captured at the top of this function. `loadAccounts` runs
        // concurrently with `authStore.initialize()` during cold-launch, and
        // a `switchToAccountForIncomingCall` triggered by a PushKit invite
        // can update `authStore.user` and `setActiveAccountId` (SecureStore)
        // in between the original `currentUser` read and this reconciliation.
        // Using the stale value reverted the just-completed auto-switch and
        // left the Voice SDK + active session in inconsistent states (Bug
        // #12: brief unregister-of-new + register-of-old after cold-launch).
        const latestUser = useAuthStore.getState().user;
        if (latestUser && activeId !== latestUser.id) {
          activeId = latestUser.id;
          await setActiveAccountId(activeId);
        }
        set({ accounts: validEntries, activeAccountId: activeId });
        return;
      }
    },

    clearAll: async () => {
      await clearAllAccountData();
      set({ accounts: [], activeAccountId: null, previousAccountId: null });
    },
  };
});

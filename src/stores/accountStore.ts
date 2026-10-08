import { create } from 'zustand';
import { AxiosError } from 'axios';
import { dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';
import { authService } from '@/lib/api/authService';
import { authStorage } from '@/lib/auth/storage';
import { getSessionEpoch, bumpSessionEpoch } from '@/lib/auth/sessionEpoch';
import { getTokenUserId } from '@/lib/auth/jwt';
import {
  accessIsExpired,
  pickFallbackAccount,
  switchRoute,
  type SwitchRoute,
} from '@/lib/auth/switchRoute';
import { forget, recall, remember, type Recent } from '@/lib/auth/recentByAccount';
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
import {
  apiClient,
  abortSessionReads,
  pauseRequests,
  resumeRequests,
  clearRefreshQueue,
} from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { TokenPair, User } from '@/types';

export interface AccountEntry {
  user: User;
  tokens: TokenPair;
}

// What each account had on screen when the phone left it: its query cache,
// kept apart per account. Coming back to an account shows that at once and
// refreshes it underneath, instead of emptying every screen and loading it
// all again (some 35 requests per switch). Two accounts is the usual case;
// what was kept longer ago than the limit is not shown.
const SCREENS_MAX_ACCOUNTS = 3;
const SCREENS_MAX_AGE_MS = 30 * 60 * 1000;
let screens: Recent<DehydratedState> = {};

// One switch at a time: a second one asked for while the first is still
// swapping the session waits for it, so two can never interleave their
// writes to the keychain and the stores.
let switchQueue: Promise<unknown> = Promise.resolve();

/**
 * The backend's "forbidden: accounts are not linked" rejection. Reaching it
 * from the switcher means either the link is truly gone, or — the Aug 1 2026
 * incident — our own identity drifted (UI says account A, token is account
 * B, so the switch became a self-switch the server rightly refuses).
 */
/** True only when the server answers 404 for that user's public profile. */
async function accountIsGone(userId: number): Promise<boolean> {
  try {
    await apiClient.get(API_ENDPOINTS.USERS.PROFILE(userId));
    return false;
  } catch (err) {
    return err instanceof AxiosError && err.response?.status === 404;
  }
}

/**
 * The server says the account we tried to switch to no longer exists. It is
 * the only definitive signal that a stored account is gone for good: Stephanie
 * (Oct 3 2026) kept the deleted representative arami in the switcher for two
 * weeks and every tap failed in silence, because the ghost purge never runs
 * when the linked-accounts list comes back empty (an orphaned creator).
 */
export function isTargetGoneError(error: unknown): boolean {
  if (!(error instanceof AxiosError)) return false;
  if (error.response?.status !== 404) return false;
  const body = error.response?.data as { error?: string } | undefined;
  return typeof body?.error === 'string' && body.error.includes('target user not found');
}

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
  /**
   * The session of `deadId` is over for good (its refresh token was refused,
   * or the account no longer exists). When another account of this phone has
   * a live session the app moves to it instead of dropping to the sign in
   * screen, and says so. False when there is nowhere to go.
   */
  leaveDeadAccount: (deadId: number, reason: string) => Promise<boolean>;
  removeAccount: (userId: number) => Promise<void>;
  loadAccounts: () => Promise<void>;
  /**
   * Ensure every account the backend reports as linked to the authenticated
   * user is present in the local switcher — fetching tokens for any that are
   * missing WITHOUT changing the active session. Best-effort and non-switching.
   */
  syncLinkedAccounts: () => Promise<void>;
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
    prevActiveId: number | null,
    // Only the switch the person asks for carries screens across and drops
    // the reads of the account being left. The switch made for an incoming
    // call keeps the behaviour it has always had.
    opts: { carryScreens?: boolean } = {}
  ) => {
    // Ownership changes NOW: any in-flight initialize/refresh result from
    // the previous identity becomes stale and must discard itself.
    bumpSessionEpoch();
    pauseRequests();
    clearRefreshQueue();
    if (opts.carryScreens) {
      // The reads of the account being left would only compete with the new
      // account's for the connection; their answers are thrown away anyway.
      abortSessionReads();
    }

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

    // Nothing the previous account loaded may be shown to this one. With
    // carryScreens, what it had is put aside under its own id first, and
    // what THIS account had last time comes back in its place.
    if (opts.carryScreens && prevActiveId !== null && prevActiveId !== userId) {
      screens = remember(
        screens,
        prevActiveId,
        dehydrate(queryClient),
        Date.now(),
        SCREENS_MAX_ACCOUNTS
      );
    }
    queryClient.clear();
    if (opts.carryScreens) {
      const kept = recall(screens, userId, Date.now(), SCREENS_MAX_AGE_MS);
      if (kept) hydrate(queryClient, kept);
    }

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

  /**
   * What follows a switch and never holds it up: the chat socket moves to the
   * new account, its unread badge is counted, and (when the switch used the
   * session stored on the phone) its profile is read again, which also tells
   * whether the account still exists.
   */
  const syncAfterSwitch = (userId: number, route: SwitchRoute) => {
    const epoch = getSessionEpoch();
    const stillOurs = () => getSessionEpoch() === epoch;
    // A stored session may come with an access token that already ran out.
    // Requests renew it by themselves before they go out; the socket does
    // not, and with the old token its join is refused (seen in the
    // simulator: three "unauthorized" before the renewal landed). So the
    // renewal is asked for here and the socket connects after it. It is the
    // same single renewal the first request waits for, not a second one.
    const entry = get().accounts.find((a) => Number(a.user.id) === Number(userId));
    const renewed: Promise<unknown> = accessIsExpired(
      entry?.tokens.accessToken,
      Date.now()
    )
      ? import('./authStore')
          .then(({ useAuthStore }) => useAuthStore.getState().refreshTokens())
          .catch(() => null)
      : Promise.resolve(null);
    void Promise.allSettled([
      Promise.all([import('@/lib/api/phoenixSocket'), renewed]).then(
        ([{ phoenixSocket }]) => {
          if (!stillOurs()) return;
          phoenixSocket.disconnect();
          // The tokens are already the new account's, so connect() picks up the
          // right JWT (auth derives the user from it).
          phoenixSocket.connect();
        }
      ),
      Promise.all([
        import('@/features/messages/services/messageService'),
        import('@/features/messages/stores/chatStore'),
      ]).then(async ([{ messageService }, { useChatStore: chatStore }]) => {
        const convos = await messageService.getConversations();
        if (!stillOurs()) return;
        const unread = convos.reduce(
          (sum: number, c: { unreadCount: number }) => sum + c.unreadCount,
          0
        );
        chatStore.getState().setTotalUnread(unread);
      }),
      route === 'stored'
        ? authService
            .getMe()
            .then(async (me) => {
              if (!stillOurs()) return;
              const { useAuthStore } = await import('./authStore');
              if (Number(me.id) !== Number(userId)) {
                // The stored tokens answer for another account: the server's
                // word wins, as everywhere else.
                void useAuthStore
                  .getState()
                  .reconcileServerIdentity('stored_switch_mismatch');
                return;
              }
              const shown = useAuthStore.getState().user;
              if (JSON.stringify(shown) === JSON.stringify(me)) return;
              useAuthStore.getState().setUser(me);
              await setAccountUser(userId, me);
              set({
                accounts: get().accounts.map((a) =>
                  Number(a.user.id) === Number(userId) ? { ...a, user: me } : a
                ),
              });
            })
            .catch((err: unknown) => {
              if (!stillOurs()) return;
              // The account was deleted while its session sat on this phone.
              if (err instanceof AxiosError && err.response?.status === 404) {
                void get().leaveDeadAccount(userId, 'switch_target_gone');
              }
            })
        : Promise.resolve(),
    ]);
  };

  /**
   * Switch the active session to `userId`.
   *
   *  Stored: the phone holds a live session for the account (see
   *    switchRoute). The swap is local, some tens of milliseconds, and nothing
   *    waits for the network: not the tokens, not the plan. This is every
   *    switch back and forth between two accounts in use.
   *  Link: no live session stored (never issued, older than a week). The
   *    server issues one through the account in use; that one request is the
   *    only thing the switch waits for.
   *  Then, without holding the switch: the plan, the socket, the badge, the
   *    profile (syncAfterSwitch).
   *  If the swap fails: reconcile identity (403 not linked) and retry once,
   *    else roll back to the account the phone was on.
   *
   * Until Oct 7 2026 every switch asked the server for tokens and then for the
   * plan, twice, behind a black screen: 2 s at best, 9 s on the client's
   * connection ("it got stuck").
   */
  const runSwitch = async (userId: number, allowHealRetry: boolean): Promise<void> => {
    const { accounts, activeAccountId } = get();

    // No-op when the target is already the authenticated account. The
    // backend treats a self-switch as "accounts are not linked" (403), so
    // reaching it with userId === current would fail pointlessly.
    const { useAuthStore: authStorePreflight } = await import('./authStore');
    const currentId = authStorePreflight.getState().user?.id ?? activeAccountId;
    if (currentId !== null && Number(currentId) === Number(userId)) {
      return;
    }

    const startedAt = Date.now();
    const stored = accounts.find((a) => Number(a.user.id) === Number(userId));
    const route: SwitchRoute = switchRoute(userId, stored?.tokens, startedAt);

    // First-class switch telemetry (Sep 8 2026 incident): make blocked/failed
    // switches answerable from PostHog, not only inferable from a Sentry
    // unhandled rejection. Gated on allowHealRetry so the heal-retry recursion
    // does not double-count a single user action.
    if (allowHealRetry) {
      analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_SWITCH_ATTEMPTED, {
        from_account_id: activeAccountId,
        to_account_id: userId,
        route,
      });
    }

    // Preflight: do not allow switching while a call is active. Tearing down
    // Twilio + CallKit + the audio session mid-conversation is fragile and
    // degrades the experience for both sides.
    //
    // BUT distinguish a REAL active call from an ORPHANED activeCall — a call
    // that ended without endCall() running. A phantom entry would block
    // switching forever (the Sep 8 2026 "stuck on wrong account" class). We
    // trust the native Voice SDK, not just this JS mirror: if the store thinks
    // a call is active but the SDK holds none, clear the phantom and proceed.
    const { useCallStore } = await import('./callStore');
    if (useCallStore.getState().activeCall != null) {
      const { hasLiveNativeCall } = await import('@/hooks/useTwilioVoice');
      const live = await hasLiveNativeCall();
      if (live) {
        analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_SWITCH_BLOCKED, {
          from_account_id: activeAccountId,
          to_account_id: userId,
          reason: 'active_call',
        });
        const err = new Error('CANNOT_SWITCH_DURING_ACTIVE_CALL');
        (err as Error & { code?: string }).code = 'CANNOT_SWITCH_DURING_ACTIVE_CALL';
        throw err;
      }
      // Orphaned: no live native call behind the store entry. Clear it so the
      // switch is never permanently blocked by stale call state.
      analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_SWITCH_STALE_CALL_CLEARED, {
        from_account_id: activeAccountId,
        to_account_id: userId,
      });
      useCallStore.getState().endCall();
    }

    // Save rollback state
    const prevToken = await authStorage.getToken();
    const prevRefreshToken = await authStorage.getRefreshToken();
    const prevUser = await authStorage.getUser<User>();
    const prevActiveId = activeAccountId;

    // The avatar and the name of the account the phone is moving to.
    const { useAccountSwitchAnimationStore } =
      await import('./accountSwitchAnimationStore');
    const cachedUser = stored?.user;
    if (cachedUser) {
      useAccountSwitchAnimationStore
        .getState()
        .startFlip({ username: cachedUser.username, avatar: cachedUser.avatar });
    }

    try {
      let user: User;
      let tokens: TokenPair;
      if (route === 'stored' && stored) {
        user = stored.user;
        tokens = stored.tokens;
      } else {
        // The stored session is not usable (or there is none): the server
        // issues a new one through the account in use. Using a stale stored
        // pair instead is how sessions used to die on a switch.
        const minted = await authService.switchAccount(userId);
        user = minted.user;
        tokens = minted.tokens;
        await get().addAccount({ user, tokens });
        if (!cachedUser) {
          useAccountSwitchAnimationStore
            .getState()
            .startFlip({ username: user.username, avatar: user.avatar });
        }
      }

      // Block all API requests while tokens are being swapped to prevent
      // race conditions where requests use the old account's token.
      // `currentId`, not activeAccountId: the latter is still empty on a
      // phone that has never switched, and the account being left is the one
      // whose screens are kept and the one a double tap comes back to.
      await applyAccountSwitchCore(
        userId,
        user,
        tokens,
        currentId !== null ? Number(currentId) : activeAccountId,
        { carryScreens: true }
      );

      // The plan: the last one known for THIS account, at once, so the plan
      // of the account just left is never shown and nothing waits; the fresh
      // one arrives underneath. The switch used to wait here for the server
      // (0.2 s on a good connection, 7 s on the client's).
      const { useSubscriptionStore } = await import('./subscriptionStore');
      useSubscriptionStore.getState().adoptCached(userId);
      void useSubscriptionStore.getState().fetchSubscription();

      useAccountSwitchAnimationStore.getState().endFlip();

      syncAfterSwitch(userId, route);

      analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_SWITCH_SUCCEEDED, {
        account_id: userId,
        route,
        duration_ms: Date.now() - startedAt,
      });
    } catch (error) {
      // ── Reconcile or roll back ──
      if (isNotLinkedError(error) && allowHealRetry) {
        // The server refused the link. If our own identity drifted (UI
        // user ≠ token subject), the request was really a self-switch —
        // reconcile against the server, then retry the switch ONCE with
        // a coherent identity.
        //
        // Unblock the request pipe FIRST: reconcile runs getMe through
        // apiClient, which would queue forever if a pause leaked from a
        // partial swap (deadlock). Resuming when not paused is a no-op.
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
          // Straight to runSwitch: this call already holds the queue.
          return runSwitch(userId, false);
        }
      }

      // Rollback: restore the previous identity wholesale.
      console.warn('[AccountSwitch] Failed, rolling back:', error);
      const targetGone = isTargetGoneError(error);
      analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_SWITCH_FAILED, {
        from_account_id: prevActiveId,
        to_account_id: userId,
        route,
        duration_ms: Date.now() - startedAt,
        status: error instanceof AxiosError ? error.response?.status : undefined,
        error_code: error instanceof AxiosError ? error.code : undefined,
      });
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
        // If the swap got as far as putting its screens aside, they come back.
        const kept = recall(screens, prevActiveId, Date.now(), SCREENS_MAX_AGE_MS);
        if (kept) {
          queryClient.clear();
          hydrate(queryClient, kept);
        }
        const { useSubscriptionStore } = await import('./subscriptionStore');
        useSubscriptionStore.getState().adoptCached(prevActiveId);
      }
      resumeRequests(); // Unblock requests even on failure
      useAccountSwitchAnimationStore.getState().endFlip();
      if (targetGone) {
        // Drop it from this phone and say so, instead of failing silently
        // on every tap.
        const gone = get().accounts.find((a) => Number(a.user.id) === Number(userId));
        await get().removeAccount(userId);
        analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_GHOST_PURGED, {
          anchor_user_id: prevActiveId,
          outcome: 'purged_target_gone',
          purged_user_ids: [userId],
        });
        const { showToast } = await import('@/components/ui/Toast');
        const i18n = (await import('@/lib/i18n')).default;
        showToast(
          i18n.t('profile:accountSwitcher.accountGone', {
            username: gone?.user.username ?? '',
            defaultValue:
              'That account no longer exists. It was removed from this phone.',
          }),
          'warning'
        );
        const err = new Error('TARGET_ACCOUNT_GONE');
        (err as Error & { code?: string }).code = 'TARGET_ACCOUNT_GONE';
        throw err;
      }
    }
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
     * Switch the active session to `userId`. See runSwitch for how; here the
     * switches are only lined up one after another.
     */
    switchToAccount: (userId: number, allowHealRetry: boolean = true) => {
      const run = switchQueue.then(() => runSwitch(userId, allowHealRetry));
      switchQueue = run.catch(() => undefined);
      return run;
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

    leaveDeadAccount: async (deadId: number, reason: string) => {
      const { accounts, previousAccountId } = get();
      const fallback = pickFallbackAccount(
        accounts,
        deadId,
        previousAccountId,
        Date.now()
      );
      if (!fallback) return false;
      const dead = accounts.find((a) => Number(a.user.id) === Number(deadId));
      const fallbackId = Number(fallback.user.id);

      await applyAccountSwitchCore(fallbackId, fallback.user, fallback.tokens, null);
      const { useSubscriptionStore } = await import('./subscriptionStore');
      useSubscriptionStore.getState().adoptCached(fallbackId);
      void useSubscriptionStore.getState().fetchSubscription();

      // Its session is dead: it leaves the switcher. A linked account comes
      // back by itself, with a new session issued through the link, when
      // syncLinkedAccounts runs below.
      await get().removeAccount(deadId);
      set({ previousAccountId: null });

      analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_MOVED_TO_ACCOUNT, {
        dead_account_id: deadId,
        fallback_account_id: fallbackId,
        reason,
      });
      const { showToast } = await import('@/components/ui/Toast');
      const i18n = (await import('@/lib/i18n')).default;
      const gone = reason === 'switch_target_gone';
      showToast(
        gone
          ? i18n.t('profile:accountSwitcher.accountGone', {
              username: dead?.user.username ?? '',
              defaultValue:
                'That account no longer exists. It was removed from this phone.',
            })
          : i18n.t('profile:accountSwitcher.sessionEnded', {
              username: dead?.user.username ?? '',
              current: fallback.user.username,
              defaultValue:
                'The session of @{{username}} ended. You are now on @{{current}}.',
            }),
        'warning'
      );

      syncAfterSwitch(fallbackId, 'stored');
      void get().syncLinkedAccounts();
      return true;
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
      // Nothing of an account that left the phone is kept.
      screens = forget(screens, userId);
      const { useSubscriptionStore } = await import('./subscriptionStore');
      useSubscriptionStore.getState().forgetUser(userId);
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

              // NEVER purge on an EMPTY linked-accounts list (Aug 23 recurrence of
              // the Aug 1 switcher-purge incident). On a cold launch this call can
              // race the token refresh and return [] before the backend resolves
              // the device's links; purging then DELETES a real, locally-stored,
              // token-valid account from SecureStore. That is exactly "Larry's
              // account won't show up, it'll just be one account": suicideking
              // (153) got purged from Anthony's device on an empty response. An
              // account with valid tokens + user in SecureStore is one the user
              // logged into — one weak signal must not erase it. Keep everything
              // and let the next successful load reconcile.
              if (linkedUsers.length === 0) {
                // An empty list is a weak signal, so nothing is purged on it.
                // But an orphaned creator (its representative was deleted)
                // ALWAYS gets an empty list, and its deleted representative
                // stayed in the switcher forever (aramis, Oct 3 2026). Ask the
                // server about each other stored account: a 404 on its public
                // profile is definitive, anything else keeps it.
                const gone: number[] = [];
                for (const e of uniqueEntries) {
                  if (Number(e.user.id) === tokenUserId) continue;
                  if (await accountIsGone(Number(e.user.id)))
                    gone.push(Number(e.user.id));
                }
                if (getSessionEpoch() !== epochAtStart) continue; // stale — redo
                for (const id of gone) await clearAccount(id);
                validEntries = uniqueEntries.filter(
                  (e) => !gone.includes(Number(e.user.id))
                );
                analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_GHOST_PURGED, {
                  anchor_user_id: tokenUserId,
                  outcome:
                    gone.length > 0
                      ? 'purged_gone_on_empty_list'
                      : 'skipped_empty_linked_list',
                  local_account_count: uniqueEntries.length,
                  purged_user_ids: gone,
                });
              } else {
                const validIds = new Set<number>([
                  tokenUserId,
                  ...linkedUsers.map((u: { id: number }) => Number(u.id)),
                ]);
                const ghosts = uniqueEntries.filter(
                  (e) => !validIds.has(Number(e.user.id))
                );
                validEntries = uniqueEntries.filter((e) =>
                  validIds.has(Number(e.user.id))
                );
                for (const ghost of ghosts) {
                  await clearAccount(ghost.user.id);
                }
                if (ghosts.length > 0) {
                  analytics.capture(ANALYTICS_EVENTS.AUTH.ACCOUNT_GHOST_PURGED, {
                    anchor_user_id: tokenUserId,
                    outcome: 'purged',
                    purged_user_ids: ghosts.map((g) => g.user.id),
                  });
                }
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

        // Fire-and-forget: pull in any linked account that belongs in the
        // switcher but has no local tokens yet (e.g. a creator created for this
        // representative outside this device's signup flow).
        void get().syncLinkedAccounts();
        return;
      }
    },

    syncLinkedAccounts: async () => {
      const epochAtStart = getSessionEpoch();
      const { useAuthStore } = await import('./authStore');
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) return;

      let linked: User[];
      try {
        linked = await authService.getLinkedAccounts();
      } catch {
        return; // offline / transient — next trigger retries
      }
      if (getSessionEpoch() !== epochAtStart) return; // session changed — abort

      for (const lu of linked) {
        const id = Number(lu.id);
        if (id === Number(currentUser.id)) continue; // that's us
        if (get().accounts.some((a) => Number(a.user.id) === id)) continue; // already local

        try {
          // Issues fresh tokens for the linked account. This does NOT apply a
          // switch — we only persist the entry so it shows in the switcher; the
          // active session is untouched.
          const { user, tokens } = await authService.switchAccount(id);
          if (getSessionEpoch() !== epochAtStart) return; // session changed mid-sync
          await get().addAccount({ user, tokens });
          analytics.capture(ANALYTICS_EVENTS.AUTH.LINKED_ACCOUNT_SYNCED, {
            account_id: id,
          });
        } catch {
          // Not linked anymore / transient failure — skip; next sync retries.
        }
      }
    },

    clearAll: async () => {
      await clearAllAccountData();
      screens = {};
      set({ accounts: [], activeAccountId: null, previousAccountId: null });
    },
  };
});

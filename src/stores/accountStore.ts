import { create } from 'zustand';
import { authService } from '@/lib/api/authService';
import { authStorage } from '@/lib/auth/storage';
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

interface AccountState {
  accounts: AccountEntry[];
  activeAccountId: number | null;
  previousAccountId: number | null;
}

interface AccountActions {
  addAccount: (entry: AccountEntry) => Promise<void>;
  setActive: (userId: number) => Promise<void>;
  switchToAccount: (userId: number) => Promise<void>;
  removeAccount: (userId: number) => Promise<void>;
  loadAccounts: () => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useAccountStore = create<AccountState & AccountActions>((set, get) => ({
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
   *  Phase C — Error handling: if Phase A fails, rollback
   */
  switchToAccount: async (userId: number) => {
    const { accounts, activeAccountId } = get();

    // Save rollback state
    const prevToken = await authStorage.getToken();
    const prevRefreshToken = await authStorage.getRefreshToken();
    const prevUser = await authStorage.getUser();
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
          activeAccountId !== userId ? activeAccountId : get().previousAccountId,
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
        // Non-fatal; the empty/cleared store will resolve to defaults.
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
          phoenixSocket.connect(String(userId));
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
      // ── Phase C: Rollback ──
      console.warn('[AccountSwitch] Failed, rolling back:', error);
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
   */
  loadAccounts: async () => {
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

    // Validate: only keep the current user + their linked accounts.
    // This purges ghost accounts from previous DB wipes.
    const { useAuthStore } = await import('./authStore');
    const currentUser = useAuthStore.getState().user;
    let validEntries = uniqueEntries;

    if (currentUser) {
      try {
        const linkedUsers = await authService.getLinkedAccounts();
        const validIds = new Set<number>([
          currentUser.id,
          ...linkedUsers.map((u: { id: number }) => u.id),
        ]);
        validEntries = uniqueEntries.filter((e) => validIds.has(Number(e.user.id)));

        // Clean invalid entries from storage
        for (const entry of uniqueEntries) {
          if (!validIds.has(Number(entry.user.id))) {
            await clearAccount(entry.user.id);
          }
        }
      } catch {
        // If linked accounts API fails, keep all entries (don't purge blindly)
      }
    }

    // Sync storage with cleaned list
    await setAccountIds(validEntries.map((e) => e.user.id));

    let activeId = await getActiveAccountId();
    // Reconcile with the authenticated session. The authStore user is the
    // source of truth for "who is logged in right now"; a stale or mismatched
    // activeAccountId in SecureStore must yield to it.
    if (currentUser && activeId !== currentUser.id) {
      activeId = currentUser.id;
      await setActiveAccountId(activeId);
    }
    set({ accounts: validEntries, activeAccountId: activeId });
  },

  clearAll: async () => {
    await clearAllAccountData();
    set({ accounts: [], activeAccountId: null, previousAccountId: null });
  },
}));

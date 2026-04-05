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

    // Trigger flip animation
    const { useAccountSwitchAnimationStore } =
      await import('./accountSwitchAnimationStore');
    const target = accounts.find((a) => a.user.id === userId)?.user;
    if (target) {
      useAccountSwitchAnimationStore
        .getState()
        .startFlip({ displayName: target.displayName, avatar: target.avatar });
    }

    try {
      let entry = accounts.find((a) => a.user.id === userId);

      // Cold case: entry not in memory — only blocking call
      if (!entry) {
        const { user, tokens } = await authService.switchAccount(userId);
        entry = { user, tokens };
        await get().addAccount(entry);
        if (!target) {
          useAccountSwitchAnimationStore
            .getState()
            .startFlip({ displayName: user.displayName, avatar: user.avatar });
        }
      }

      // ── Phase A: Synchronous swap (target: <50ms) ──
      // Block all API requests while tokens are being swapped to prevent
      // race conditions where requests use the old account's token.
      pauseRequests();
      clearRefreshQueue();

      await Promise.all([
        authStorage.setToken(entry.tokens.accessToken),
        authStorage.setRefreshToken(entry.tokens.refreshToken),
        authStorage.setUser(entry.user),
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

      // Sync authStore with cached user immediately
      const { useAuthStore } = await import('./authStore');
      useAuthStore.getState().setUser(entry.user);

      // Unblock requests — they will now use the new token
      resumeRequests();

      // End animation NOW — user sees the new account immediately
      useAccountSwitchAnimationStore.getState().endFlip();

      // ── Phase B: Fire-and-forget background sync ──
      const capturedEntry = entry;
      Promise.allSettled([
        // Refresh user data
        authService.getMe().then(async (freshUser) => {
          useAuthStore.getState().setUser(freshUser);
          await authStorage.setUser(freshUser);
          capturedEntry.user = freshUser;
          await get().addAccount(capturedEntry);
        }),
        // Refresh subscription
        import('./subscriptionStore').then(({ useSubscriptionStore }) =>
          useSubscriptionStore.getState().fetchSubscription()
        ),
        // Reconnect WebSocket (non-blocking)
        import('@/lib/api/phoenixSocket').then(({ phoenixSocket }) => {
          phoenixSocket.disconnect();
          phoenixSocket.connect(String(userId));
        }),
        // Refresh unread message badge for new account
        Promise.all([
          import('@/features/messages/services/messageService'),
          import('@/features/messages/stores/chatStore'),
        ]).then(async ([{ messageService }, { useChatStore }]) => {
          const convos = await messageService.getConversations();
          const unread = convos.reduce((sum: number, c: { unreadCount: number }) => sum + c.unreadCount, 0);
          useChatStore.getState().setTotalUnread(unread);
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

    const activeId = await getActiveAccountId();
    set({ accounts: validEntries, activeAccountId: activeId });
  },

  clearAll: async () => {
    await clearAllAccountData();
    set({ accounts: [], activeAccountId: null, previousAccountId: null });
  },
}));

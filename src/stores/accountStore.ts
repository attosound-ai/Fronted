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
   * Updates the shadow keys (auth_token / refresh_token / user_data) that the
   * Axios interceptor always reads — no changes to the interceptor needed.
   */
  switchToAccount: async (userId: number) => {
    const { accounts, activeAccountId } = get();

    // Save current state for rollback if anything fails
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

      // Write shadow keys so the interceptor picks them up
      await authStorage.setToken(entry.tokens.accessToken);
      await authStorage.setRefreshToken(entry.tokens.refreshToken);
      await authStorage.setUser(entry.user);
      await setActiveAccountId(userId);

      set({
        activeAccountId: userId,
        previousAccountId:
          activeAccountId !== userId ? activeAccountId : get().previousAccountId,
      });

      // Reconnect WebSocket with explicit new userId
      try {
        const { phoenixSocket } = await import('@/lib/api/phoenixSocket');
        phoenixSocket.disconnect();
        await phoenixSocket.connect(String(userId));
      } catch {
        // Non-fatal: socket will reconnect later
      }

      // Sync authStore
      const { useAuthStore } = await import('./authStore');
      useAuthStore.getState().setUser(entry.user);

      // Fetch fresh user data from backend
      try {
        const freshUser = await authService.getMe();
        useAuthStore.getState().setUser(freshUser);
        await authStorage.setUser(freshUser);
        entry.user = freshUser;
        await get().addAccount(entry);
      } catch {
        // Non-fatal: cached user is already set above
      }

      const { useSubscriptionStore } = await import('./subscriptionStore');
      useSubscriptionStore.getState().fetchSubscription();
    } catch (error) {
      // Rollback: restore previous account's tokens so user stays logged in
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
    } finally {
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
    const entries: AccountEntry[] = [];

    for (const id of ids) {
      const numId = Number(id);
      if (seen.has(numId)) continue;
      seen.add(numId);
      const tokens = await getAccountTokens(id);
      const user = await getAccountUser(id);
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

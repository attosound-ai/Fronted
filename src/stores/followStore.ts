import { create } from 'zustand';

/**
 * Global follow state shared across all components.
 * Prevents stale follow buttons when navigating between feed, reels, and profiles.
 */
interface FollowStore {
  /** userId → isFollowing override */
  followedUsers: Record<number, boolean>;
  setFollowed: (userId: number, isFollowing: boolean) => void;
  /** Returns the effective follow state, preferring the global override. */
  getIsFollowing: (userId: number, fallback: boolean) => boolean;
  /** Bulk-set from API data. Only sets users NOT already in the store (preserves optimistic updates). */
  hydrateFromApi: (entries: Array<{ userId: number; isFollowing: boolean }>) => void;
  /** Clear all follow state (call on account switch). */
  clear: () => void;
}

export const useFollowStore = create<FollowStore>((set, get) => ({
  followedUsers: {},
  setFollowed: (userId, isFollowing) =>
    set((state) => ({
      followedUsers: { ...state.followedUsers, [userId]: isFollowing },
    })),
  getIsFollowing: (userId, fallback) => get().followedUsers[userId] ?? fallback,
  clear: () => set({ followedUsers: {} }),
  hydrateFromApi: (entries) => {
    const current = get().followedUsers;
    // Only add entries for users not already in the store
    const newEntries: Array<{ userId: number; isFollowing: boolean }> = [];
    for (const entry of entries) {
      if (current[entry.userId] === undefined) {
        newEntries.push(entry);
      }
    }
    // Skip set() entirely if nothing to add — avoids infinite re-render loop
    if (newEntries.length === 0) return;
    set((state) => {
      const next = { ...state.followedUsers };
      for (const { userId, isFollowing } of newEntries) {
        next[userId] = isFollowing;
      }
      return { followedUsers: next };
    });
  },
}));

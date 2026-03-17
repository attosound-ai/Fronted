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
}

export const useFollowStore = create<FollowStore>((set, get) => ({
  followedUsers: {},
  setFollowed: (userId, isFollowing) =>
    set((state) => ({
      followedUsers: { ...state.followedUsers, [userId]: isFollowing },
    })),
  getIsFollowing: (userId, fallback) => get().followedUsers[userId] ?? fallback,
}));

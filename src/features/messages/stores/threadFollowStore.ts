import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Slack lets you follow a thread so new replies reach you even when you did
 * not write in it. Until the server keeps that state, the choice lives on the
 * device (David, Sep 24 2026).
 */
interface ThreadFollowState {
  followed: Record<string, boolean>;
  isFollowing: (threadId: string) => boolean;
  setFollowing: (threadId: string, following: boolean) => void;
}

const mmkvAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const useThreadFollowStore = create<ThreadFollowState>()(
  persist(
    (set, get) => ({
      followed: {},
      isFollowing: (threadId) => get().followed[threadId] === true,
      setFollowing: (threadId, following) =>
        set((s) => ({ followed: { ...s.followed, [threadId]: following } })),
    }),
    { name: 'thread-follow-v1', storage: createJSONStorage(() => mmkvAdapter) }
  )
);

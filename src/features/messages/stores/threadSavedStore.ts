import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Saved threads. Slack's "Save for later" keeps a message in a list of its
 * own; ATTO keeps the thread, and the threads inbox lifts a saved one to the
 * top with its bookmark filled, which is the whole point of saving it.
 *
 * Local on purpose for now: the server keeps the unread count and the follow
 * flag, and nothing else needs to read a bookmark.
 */
interface ThreadSavedState {
  saved: Record<string, boolean>;
  isSaved: (threadId: string) => boolean;
  toggle: (threadId: string) => boolean;
}

const mmkvAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const useThreadSavedStore = create<ThreadSavedState>()(
  persist(
    (set, get) => ({
      saved: {},
      isSaved: (threadId) => get().saved[threadId] === true,
      toggle: (threadId) => {
        const next = !get().saved[threadId];
        set((s) => ({ saved: { ...s.saved, [threadId]: next } }));
        return next;
      },
    }),
    { name: 'thread-saved-v1', storage: createJSONStorage(() => mmkvAdapter) }
  )
);

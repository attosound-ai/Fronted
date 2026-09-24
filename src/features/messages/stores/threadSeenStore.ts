import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * When this device last opened each thread, so the conversation can mark a
 * thread that has new replies the way Slack does. Local: the server keeps no
 * per thread read state yet.
 */
interface ThreadSeenState {
  seenAt: Record<string, number>;
  markSeen: (threadId: string, at: number) => void;
}

const mmkvAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const useThreadSeenStore = create<ThreadSeenState>()(
  persist(
    (set, get) => ({
      seenAt: {},
      markSeen: (threadId, at) => {
        if ((get().seenAt[threadId] ?? 0) >= at) return;
        set((s) => ({ seenAt: { ...s.seenAt, [threadId]: at } }));
      },
    }),
    { name: 'thread-seen-v1', storage: createJSONStorage(() => mmkvAdapter) }
  )
);

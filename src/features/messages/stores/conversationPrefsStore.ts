import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Per conversation preferences that only live on this device: pinned order,
 * muted flag, local archive and the unsent draft. The backend has no notion
 * of any of these yet, so they are the same kind of local state WhatsApp and
 * Telegram keep for drafts. Sync can come later without changing callers.
 */

import type { ArchivedMark } from './conversationPrefsModel';
export type { ArchivedMark } from './conversationPrefsModel';

interface ConversationPrefsState {
  /** conversationId → time it was pinned; newest pin sorts first. */
  pinned: Record<string, number>;
  muted: Record<string, true>;
  archived: Record<string, ArchivedMark>;
  drafts: Record<string, string>;
  togglePinned: (conversationId: string) => boolean;
  toggleMuted: (conversationId: string) => boolean;
  archive: (conversationId: string, lastMessageAt: string | null) => void;
  unarchive: (conversationId: string) => void;
  setDraft: (conversationId: string, text: string) => void;
}

const STORAGE_KEY = 'conversation_prefs';

// MMKV is synchronous and has no size ceiling (drafts can be long), unlike
// SecureStore.
const mmkvAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const useConversationPrefsStore = create<ConversationPrefsState>()(
  persist(
    (set, get) => ({
      pinned: {},
      muted: {},
      archived: {},
      drafts: {},
      togglePinned: (conversationId) => {
        const next = { ...get().pinned };
        const nowPinned = !next[conversationId];
        if (nowPinned) next[conversationId] = Date.now();
        else delete next[conversationId];
        set({ pinned: next });
        return nowPinned;
      },
      toggleMuted: (conversationId) => {
        const next = { ...get().muted };
        const nowMuted = !next[conversationId];
        if (nowMuted) next[conversationId] = true;
        else delete next[conversationId];
        set({ muted: next });
        return nowMuted;
      },
      archive: (conversationId, lastMessageAt) =>
        set((state) => ({
          archived: {
            ...state.archived,
            [conversationId]: { lastMessageAt, archivedAt: Date.now() },
          },
        })),
      unarchive: (conversationId) =>
        set((state) => {
          const next = { ...state.archived };
          delete next[conversationId];
          return { archived: next };
        }),
      setDraft: (conversationId, text) =>
        set((state) => {
          const trimmed = text.trim();
          if (!trimmed) {
            if (!(conversationId in state.drafts)) return state;
            const next = { ...state.drafts };
            delete next[conversationId];
            return { drafts: next };
          }
          if (state.drafts[conversationId] === text) return state;
          return { drafts: { ...state.drafts, [conversationId]: text } };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => mmkvAdapter),
      partialize: (state) => ({
        pinned: state.pinned,
        muted: state.muted,
        archived: state.archived,
        drafts: state.drafts,
      }),
    }
  )
);

export { isArchived, orderConversations } from './conversationPrefsModel';

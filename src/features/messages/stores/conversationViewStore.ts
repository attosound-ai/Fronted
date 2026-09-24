import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Which slice of the messages list is on screen. Slack keeps these as
 * separate views reached from the sidebar; ATTO's list looks like WhatsApp
 * and Telegram by default, so the views hide behind one button in the top
 * left and "all" is what everybody sees until they ask for something else
 * (David, Sep 24 2026: a menu like Slack's that does not confuse).
 *
 * Threads is not here: it is a screen of its own, since its rows are threads
 * rather than conversations.
 */
export type ConversationView = 'all' | 'unread' | 'drafts' | 'archived';

interface ConversationViewState {
  view: ConversationView;
  setView: (view: ConversationView) => void;
}

const mmkvAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const useConversationViewStore = create<ConversationViewState>()(
  persist(
    (set) => ({
      view: 'all',
      setView: (view) => set({ view }),
    }),
    { name: 'conversation-view-v1', storage: createJSONStorage(() => mmkvAdapter) }
  )
);

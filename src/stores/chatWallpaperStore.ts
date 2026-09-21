import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export const CHAT_WALLPAPER_NONE_ID = '__none__';

/**
 * Persisted chat wallpaper choice.
 *
 * `selectedWallpaperId` is the global preference (every chat). `perConversation`
 * overrides it for one conversation, the way WhatsApp and Telegram let you set
 * a wallpaper for a single chat. Both live locally in SecureStore and are not
 * synced across devices: a reinstall starts from `null` (backend default).
 *
 * `CHAT_WALLPAPER_NONE_ID` means "no wallpaper" (solid black background).
 */

interface ChatWallpaperState {
  selectedWallpaperId: string | null;
  perConversation: Record<string, string>;
  setSelectedWallpaperId: (id: string | null) => void;
  setConversationWallpaperId: (conversationId: string, id: string | null) => void;
}

const STORAGE_KEY = 'chat_wallpaper';

const secureStoreAdapter: StateStorage = {
  getItem: async (name) => {
    try {
      const value = await SecureStore.getItemAsync(name);
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch {
      // Best effort: worst case we lose persistence for this session.
    }
  },
  removeItem: async (name) => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      // Ignore.
    }
  },
};

export const useChatWallpaperStore = create<ChatWallpaperState>()(
  persist(
    (set) => ({
      selectedWallpaperId: null,
      perConversation: {},
      setSelectedWallpaperId: (id) => set({ selectedWallpaperId: id }),
      setConversationWallpaperId: (conversationId, id) =>
        set((state) => {
          const next = { ...state.perConversation };
          if (id === null) delete next[conversationId];
          else next[conversationId] = id;
          return { perConversation: next };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => secureStoreAdapter),
      partialize: (state) => ({
        selectedWallpaperId: state.selectedWallpaperId,
        perConversation: state.perConversation,
      }),
    }
  )
);

/**
 * Which wallpaper id a conversation should show: its own override first,
 * then the global choice. `undefined` means no explicit choice anywhere
 * (the caller falls back to the catalogue default).
 */
export function resolveWallpaperChoice(
  state: Pick<ChatWallpaperState, 'selectedWallpaperId' | 'perConversation'>,
  conversationId: string | null | undefined
): string | null | undefined {
  if (conversationId && state.perConversation[conversationId]) {
    return state.perConversation[conversationId];
  }
  return state.selectedWallpaperId ?? undefined;
}

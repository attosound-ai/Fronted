import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export const CHAT_WALLPAPER_NONE_ID = '__none__';

/**
 * Persisted user selection of chat wallpaper.
 *
 * This is a *global* preference (applies to every chat) stored locally via
 * SecureStore. It is not synced across devices — if the user reinstalls
 * the app they start with `null` (use backend default wallpaper). A future
 * per-conversation
 * override can live in the same store as a `perConversation` map without
 * changing this file's public surface.
 *
 * `CHAT_WALLPAPER_NONE_ID` means "no wallpaper" (solid-black background).
 */

interface ChatWallpaperState {
  selectedWallpaperId: string | null;
  setSelectedWallpaperId: (id: string | null) => void;
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
      // Best-effort — worst case we lose persistence for this session.
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
      setSelectedWallpaperId: (id) => set({ selectedWallpaperId: id }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => secureStoreAdapter),
      partialize: (state) => ({ selectedWallpaperId: state.selectedWallpaperId }),
    }
  )
);

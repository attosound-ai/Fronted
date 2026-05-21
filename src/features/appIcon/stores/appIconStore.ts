import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { AppIconSlot } from '../types';

/**
 * Persisted user selection of dynamic app icon (the home-screen icon, not
 * the in-app branding).
 *
 * `null` means the primary icon shipped in the app — the OS reverts to it
 * when @howincodes/expo-dynamic-app-icon is called with `null`.
 *
 * Locally persisted via SecureStore so the picker can show the selected
 * tile instantly on next launch without waiting on the network. The server
 * is the source of truth across devices via `appIconService.getMine()`.
 */

interface AppIconState {
  selectedSlot: AppIconSlot;
  setSelectedSlot: (slot: AppIconSlot) => void;
}

const STORAGE_KEY = 'app_icon';

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
      // Best-effort; worst case the picker loses its "selected" highlight
      // on next launch until the server response hydrates it.
    }
  },
  removeItem: async (name) => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch {
      // ignore
    }
  },
};

export const useAppIconStore = create<AppIconState>()(
  persist(
    (set) => ({
      selectedSlot: null,
      setSelectedSlot: (slot) => set({ selectedSlot: slot }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => secureStoreAdapter),
      partialize: (state) => ({ selectedSlot: state.selectedSlot }),
    }
  )
);

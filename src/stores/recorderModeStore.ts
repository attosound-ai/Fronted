import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage/mmkv';

/**
 * Which recorder a call lands on (David, Sep 23 2026): the pro studio editor
 * or the simple screen that only records and publishes. Null means the app
 * decides as before (entitlement plus the editor flag). Chosen from Profile >
 * Settings > Recorder, kept on the device.
 */
export type RecorderMode = 'pro' | 'simple';

interface RecorderModeState {
  mode: RecorderMode | null;
  setMode: (mode: RecorderMode | null) => void;
}

const mmkvAdapter: StateStorage = {
  getItem: (name) => mmkvStorage.getString(name) ?? null,
  setItem: (name, value) => mmkvStorage.setString(name, value),
  removeItem: (name) => mmkvStorage.delete(name),
};

export const useRecorderModeStore = create<RecorderModeState>()(
  persist(
    (set) => ({
      mode: null,
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'recorder-mode-v1',
      storage: createJSONStorage(() => mmkvAdapter),
    }
  )
);

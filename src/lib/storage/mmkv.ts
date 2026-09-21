/**
 * Local Storage — MMKV-backed with in-memory fallback.
 *
 * react-native-mmkv is a native module already linked via EAS Build.
 * Falls back to an in-memory Map if the native module fails to load
 * (e.g., running in Expo Go without prebuild).
 */

import { createMMKV, type MMKV } from 'react-native-mmkv';

// react-native-mmkv@4 ships a factory (`createMMKV`); the `MMKV` export is a
// type only alias and calling `new` on it throws. It used to, silently: every
// value written here lived in the memory map below and was lost on the next
// cold start, which is how the editor's tips kept coming back (Sep 19 2026).
let storage: MMKV | null = null;
try {
  storage = createMMKV({ id: 'atto-app-storage' });
} catch {
  // Native module not available — fallback below
}

// In-memory fallback (Expo Go or broken native module)
const memoryStorage = new Map<string, string>();

const useNative = storage !== null;

export const mmkvStorage = {
  getString(key: string): string | undefined {
    if (useNative) return storage!.getString(key);
    return memoryStorage.get(key);
  },

  setString(key: string, value: string): void {
    if (useNative) {
      storage!.set(key, value);
      return;
    }
    memoryStorage.set(key, value);
  },

  getNumber(key: string): number | undefined {
    if (useNative) {
      const v = storage!.getNumber(key);
      return v === undefined ? undefined : v;
    }
    const value = memoryStorage.get(key);
    return value ? parseFloat(value) : undefined;
  },

  setNumber(key: string, value: number): void {
    if (useNative) {
      storage!.set(key, value);
      return;
    }
    memoryStorage.set(key, value.toString());
  },

  getBoolean(key: string): boolean | undefined {
    if (useNative) return storage!.getBoolean(key);
    const value = memoryStorage.get(key);
    if (value === undefined) return undefined;
    return value === 'true';
  },

  setBoolean(key: string, value: boolean): void {
    if (useNative) {
      storage!.set(key, value);
      return;
    }
    memoryStorage.set(key, value.toString());
  },

  getObject<T>(key: string): T | null {
    const data = useNative ? storage!.getString(key) : memoryStorage.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  setObject<T>(key: string, value: T): void {
    const json = JSON.stringify(value);
    if (useNative) {
      storage!.set(key, json);
      return;
    }
    memoryStorage.set(key, json);
  },

  /** v4 renamed the native method to `remove`; the wrapper keeps `delete`. */
  delete(key: string): void {
    if (useNative) {
      storage!.remove(key);
      return;
    }
    memoryStorage.delete(key);
  },

  contains(key: string): boolean {
    if (useNative) return storage!.contains(key);
    return memoryStorage.has(key);
  },

  clearAll(): void {
    if (useNative) {
      storage!.clearAll();
      return;
    }
    memoryStorage.clear();
  },

  getAllKeys(): string[] {
    if (useNative) return storage!.getAllKeys();
    return Array.from(memoryStorage.keys());
  },
};

// Export raw MMKV instance for React Query persister
export { storage as mmkvInstance };

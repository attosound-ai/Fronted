import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { PostType } from '@/types/post';

interface FeedFilters {
  creatorsOnly: boolean;
  contentTypes: PostType[]; // empty = show all
}

const DEFAULT_FILTERS: FeedFilters = {
  creatorsOnly: false,
  contentTypes: [],
};

interface FeedFilterState {
  filters: FeedFilters;
  isAnyFilterActive: boolean;
  setFilter: <K extends keyof FeedFilters>(key: K, value: FeedFilters[K]) => void;
  toggleContentType: (type: PostType) => void;
  resetFilters: () => void;
}

// SecureStore keys can't contain hyphens — use underscores.
const STORAGE_KEY = 'feed_filters';

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
      // ignore — worst case we lose persistence this session
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

export const useFeedFilterStore = create<FeedFilterState>()(
  persist(
    (set) => ({
      filters: { ...DEFAULT_FILTERS },
      isAnyFilterActive: false,

      setFilter: (key, value) =>
        set((state) => {
          const next = { ...state.filters, [key]: value };
          return {
            filters: next,
            isAnyFilterActive: next.creatorsOnly || next.contentTypes.length > 0,
          };
        }),

      toggleContentType: (type) =>
        set((state) => {
          const current = state.filters.contentTypes;
          const next = current.includes(type)
            ? current.filter((t) => t !== type)
            : [...current, type];
          const filters = { ...state.filters, contentTypes: next };
          return {
            filters,
            isAnyFilterActive: filters.creatorsOnly || next.length > 0,
          };
        }),

      resetFilters: () =>
        set({ filters: { ...DEFAULT_FILTERS }, isAnyFilterActive: false }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => secureStoreAdapter),
      partialize: (state) => ({ filters: state.filters }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAnyFilterActive =
            state.filters.creatorsOnly || state.filters.contentTypes.length > 0;
        }
      },
    }
  )
);

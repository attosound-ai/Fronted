import { create } from 'zustand';
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

export const useFeedFilterStore = create<FeedFilterState>((set) => ({
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

  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS }, isAnyFilterActive: false }),
}));

import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { mmkvInstance } from '@/lib/storage/mmkv';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute default (overridden per-query)
      gcTime: 1000 * 60 * 10, // 10 minutes garbage collection
      retry: 2,
    },
  },
});

// Persist React Query cache to MMKV for instant cold-start UI.
// If MMKV is not available, uses a no-op persister (data won't survive restarts).
const noopStorage = {
  getItem: () => null as string | null,
  setItem: () => {},
  removeItem: () => {},
};

export const queryPersister = createSyncStoragePersister({
  storage: mmkvInstance
    ? {
        getItem: (key: string) => mmkvInstance!.getString(key) ?? null,
        setItem: (key: string, value: string) => mmkvInstance!.set(key, value),
        removeItem: (key: string) => mmkvInstance!.delete(key),
      }
    : noopStorage,
});

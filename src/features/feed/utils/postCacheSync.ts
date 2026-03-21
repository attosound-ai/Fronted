import type { QueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Post } from '@/types';

type PostUpdater = (post: Post) => Post;

/**
 * Get all active feed/reels infinite query keys from the cache.
 * Since keys are now scoped by userId, we match by prefix ['feed', 'infinite']
 * and ['feed', 'reels'] to find all cached user feeds.
 */
function getInfiniteKeys(qc: QueryClient): readonly unknown[][] {
  const cache = qc.getQueryCache().getAll();
  return cache
    .filter(
      (q) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === 'feed' &&
        (q.queryKey[1] === 'infinite' || q.queryKey[1] === 'reels')
    )
    .map((q) => q.queryKey);
}

type CacheSnapshot = {
  infinite: Map<readonly unknown[], unknown>;
  bookmarks: unknown;
  post: unknown;
};

/** Cancel inflight queries that might overwrite our optimistic update. */
export async function cancelPostQueries(qc: QueryClient, postId: string): Promise<void> {
  const keys = getInfiniteKeys(qc);
  await Promise.all([
    ...keys.map((key) => qc.cancelQueries({ queryKey: key })),
    qc.cancelQueries({ queryKey: QUERY_KEYS.FEED.BOOKMARKS }),
    qc.cancelQueries({ queryKey: QUERY_KEYS.FEED.POST(postId) }),
  ]);
}

/** Snapshot all caches that could contain this post for rollback. */
export function snapshotPostCaches(qc: QueryClient, postId: string): CacheSnapshot {
  const infinite = new Map<readonly unknown[], unknown>();
  for (const key of getInfiniteKeys(qc)) {
    infinite.set(key, qc.getQueryData(key));
  }
  return {
    infinite,
    bookmarks: qc.getQueryData(QUERY_KEYS.FEED.BOOKMARKS),
    post: qc.getQueryData(QUERY_KEYS.FEED.POST(postId)),
  };
}

/** Restore all caches from a snapshot. */
export function rollbackPostCaches(
  qc: QueryClient,
  postId: string,
  snapshot: CacheSnapshot
): void {
  for (const [key, data] of snapshot.infinite) {
    if (data !== undefined) qc.setQueryData(key, data);
  }
  if (snapshot.bookmarks !== undefined) {
    qc.setQueryData(QUERY_KEYS.FEED.BOOKMARKS, snapshot.bookmarks);
  }
  if (snapshot.post !== undefined) {
    qc.setQueryData(QUERY_KEYS.FEED.POST(postId), snapshot.post);
  }
}

/**
 * Apply an updater to a post across all caches.
 *
 * Handles three data shapes:
 * - Infinite queries (INFINITE, REELS): `{ pages: [{ data: Post[] }] }`
 * - Bookmarks: `{ pages: [{ posts: Post[] }] }`
 * - Single post (POST(id)): `Post`
 */
export function patchPostInCaches(
  qc: QueryClient,
  postId: string,
  updater: PostUpdater
): void {
  // Infinite-style caches (pages.data)
  for (const key of getInfiniteKeys(qc)) {
    qc.setQueryData(key, (old: any) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          data: page.data.map((p: Post) => (p.id === postId ? updater(p) : p)),
        })),
      };
    });
  }

  // Bookmarks cache (pages.posts)
  qc.setQueryData(QUERY_KEYS.FEED.BOOKMARKS, (old: any) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        posts: page.posts.map((p: Post) => (p.id === postId ? updater(p) : p)),
      })),
    };
  });

  // Single post cache
  qc.setQueryData(QUERY_KEYS.FEED.POST(postId), (old: any) => {
    if (!old) return old;
    return updater(old);
  });
}

/** Remove a post from all list caches. */
export function removePostFromCaches(qc: QueryClient, postId: string): void {
  for (const key of getInfiniteKeys(qc)) {
    qc.setQueryData(key, (old: any) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          data: page.data.filter((p: Post) => p.id !== postId),
        })),
      };
    });
  }

  qc.setQueryData(QUERY_KEYS.FEED.BOOKMARKS, (old: any) => {
    if (!old?.pages) return old;
    return {
      ...old,
      pages: old.pages.map((page: any) => ({
        ...page,
        posts: page.posts.filter((p: Post) => p.id !== postId),
      })),
    };
  });

  qc.removeQueries({ queryKey: QUERY_KEYS.FEED.POST(postId) });
}

/** Find a post across all caches. Returns the first match. */
export function findPostInCaches(qc: QueryClient, postId: string): Post | undefined {
  // Check infinite caches first
  for (const key of getInfiniteKeys(qc)) {
    const data = qc.getQueryData(key) as any;
    if (data?.pages) {
      for (const page of data.pages) {
        const found = page.data?.find((p: Post) => p.id === postId);
        if (found) return found;
      }
    }
  }

  // Check single post cache
  const single = qc.getQueryData(QUERY_KEYS.FEED.POST(postId)) as Post | undefined;
  if (single) return single;

  // Check bookmarks
  const bookmarks = qc.getQueryData(QUERY_KEYS.FEED.BOOKMARKS) as any;
  if (bookmarks?.pages) {
    for (const page of bookmarks.pages) {
      const found = page.posts?.find((p: Post) => p.id === postId);
      if (found) return found;
    }
  }

  return undefined;
}

import type { QueryClient } from '@tanstack/react-query';
import { reportCounterDivergence } from '@/lib/analytics/socialTelemetry';
import { feedService } from '../services/feedService';
import { findPostInCaches, patchPostInCaches } from '../utils/postCacheSync';
import { useAuthStore } from '@/stores/authStore';
import { countedPending, outboxSlot } from './commentOutbox';
import { useCommentOutbox } from './commentOutboxStore';

/**
 * Puts the server's number of comments on the post, after a comment was
 * added or deleted.
 *
 * The number on screen is the cached one plus or minus what this phone just
 * did, and the cached one can be older than the list: David opened a post the
 * instant its push arrived (count 0), someone else commented, then he
 * commented, and his badge said 1 over a list of 2 (Aug 23 2026). Only the
 * count is patched on the post objects already cached: no feed invalidation,
 * so nothing refetches, reorders or flickers.
 */
export async function reconcileCommentCount(
  queryClient: QueryClient,
  postId: string,
  action: 'comment_create' | 'comment_delete'
): Promise<void> {
  try {
    // feedService.getPost returns the RAW API shape (it does not run the
    // feed mapper), so the count lives under `interactions`.
    const fresh = (await feedService.getPost(postId)) as unknown as {
      commentsCount?: number;
      interactions?: { commentsCount?: number };
    };
    const serverCount = fresh?.interactions?.commentsCount ?? fresh?.commentsCount;
    if (typeof serverCount !== 'number') return;
    // Whatever is still on its way is not in the server's number yet.
    const accountId = useAuthStore.getState().user?.id ?? '';
    const stillSending = countedPending(
      useCommentOutbox.getState().outbox,
      outboxSlot(accountId, postId)
    );
    const shown = findPostInCaches(queryClient, postId)?.commentsCount;
    reportCounterDivergence({
      action,
      targetId: postId,
      field: 'commentsCount',
      shown,
      server: serverCount + stillSending,
    });
    patchPostInCaches(queryClient, postId, (post) => ({
      ...post,
      commentsCount: serverCount + stillSending,
    }));
  } catch {
    // Best effort: the number already on screen stands.
  }
}

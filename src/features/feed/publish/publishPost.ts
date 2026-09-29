import { feedService } from '../services/feedService';
import { mediaService, type MediaContext } from '@/lib/media/mediaService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { queryClient } from '@/lib/queryClient';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import { authStorage } from '@/lib/auth/storage';
import { getTokenUserId } from '@/lib/auth/jwt';
import type { PostType } from '@/types/post';
import type { PickedMedia } from '../types';
import { buildPostMetadata } from '../utils/coverArt';
import { tagMetadata, type TaggedPerson } from '../utils/mentions';

/**
 * Everything it takes to publish a post, outside any screen: identity check,
 * media upload (with compression), cover, metadata and the create call. The
 * composer used to run this itself and make the person wait on it; now the
 * publish queue runs it in the background (Instagram style) and the old
 * useCreatePost hook is a thin wrapper for the callers that still wait.
 */

/**
 * The identity a post will be attributed to is the TOKEN's subject (the
 * backend reads it from the JWT), while the composer shows `authStore.user`'s
 * avatar. If those two ever disagree (a torn account switch, a stale restore),
 * the user sees one face and publishes as another ("the wrong picture was
 * posted", Anthony Aug 23). Assert coherence right before creating; on a
 * mismatch heal from the server (the token's account wins, exactly like
 * initialize() does) so what is shown is what is published. Returns the id the
 * post will carry, for telemetry.
 */
async function assertPostingIdentity(): Promise<number | null> {
  const token = await authStorage.getToken();
  const tokenUserId = getTokenUserId(token);
  const uiUserId = Number(useAuthStore.getState().user?.id);
  if (tokenUserId === null || !Number.isFinite(uiUserId)) return tokenUserId;
  if (tokenUserId === uiUserId) return tokenUserId;
  analytics.capture(ANALYTICS_EVENTS.AUTH.IDENTITY_DESYNC_DETECTED, {
    source: 'create_post',
    ui_user_id: uiUserId,
    server_user_id: tokenUserId,
  });
  const healed = await useAuthStore
    .getState()
    .reconcileServerIdentity('create_post_mismatch');
  return healed ? Number(healed.id) : tokenUserId;
}

export interface CreatePostParams {
  postType: PostType;
  media: PickedMedia[];
  caption: string;
  poemText: string;
  /** Local image to publish as the audio post's cover. Optional by design. */
  coverUri?: string;
  /** People tagged from the caption's @ list, Instagram style. */
  tagged?: TaggedPerson[];
  onProgress?: (progress: number) => void;
}

function getMediaContext(postType: PostType): MediaContext {
  if (postType === 'audio') return 'audio';
  if (postType === 'video') return 'video';
  if (postType === 'reel') return 'reel';
  return 'content';
}

export async function publishPost({
  postType,
  media,
  caption,
  poemText,
  coverUri,
  tagged,
  onProgress,
}: CreatePostParams) {
  // Who this post will belong to. Checked BEFORE the (slow) media upload so
  // a torn identity is healed while the user still sees the composer.
  const authorId = await assertPostingIdentity();
  const filePaths: string[] = [];
  const context = getMediaContext(postType);
  const totalFiles = media.length;

  // Upload media files to Cloudinary
  for (let i = 0; i < totalFiles; i++) {
    const m = media[i];
    const publicId = await mediaService.upload(
      m.uri,
      m.fileName,
      m.mimeType,
      context,
      (p) => onProgress?.((i + p) / totalFiles)
    );
    filePaths.push(publicId);
  }

  // The cover is uploaded like any other image, after the audio so a
  // failure here cannot cost the take. An audio post without a cover is a
  // normal post, so a cover that fails to upload is reported and the post
  // still goes out.
  let coverPublicId: string | undefined;
  if (coverUri && postType === 'audio') {
    const tCover = Date.now();
    try {
      coverPublicId = await mediaService.upload(
        coverUri,
        'cover.jpg',
        'image/jpeg',
        'content'
      );
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_COVER, {
        outcome: 'uploaded',
        ms: Date.now() - tCover,
      });
    } catch (error: unknown) {
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_COVER, {
        outcome: 'failed',
        ms: Date.now() - tCover,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Build metadata. Persisting the media's native dimensions lets the feed
  // render the correct aspect ratio immediately, instead of starting at a
  // 1:1 box and snapping once the player decodes the first frame.
  const metadata = {
    ...buildPostMetadata({
      durationSec: media[0]?.duration,
      width: media[0]?.width,
      height: media[0]?.height,
      coverPublicId,
    }),
    // Who the caption names, so the reader's tap lands on the right
    // profile and the server can tell them they were tagged.
    ...tagMetadata(tagged ?? []),
  };

  // Create the post via API
  const textContent = postType === 'text' ? poemText : caption;
  const created = await feedService.createPost({
    textContent,
    contentType: postType,
    filePaths: filePaths.length > 0 ? filePaths : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });
  return { post: created, authorId };
}

/**
 * What happens once the post exists: it goes to the top of the feed cache,
 * the author's grid and counters refresh, and the outcome is reported.
 */
export function applyPublishedPost(
  newPost: unknown,
  authorId: number | null,
  variables: Pick<CreatePostParams, 'postType' | 'media' | 'coverUri'>
) {
  const userId = useAuthStore.getState().user?.id;
  // Prepend the new post to the feed cache so it appears immediately
  queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE(userId), (old: any) => {
    if (!old?.pages?.length) return old;
    return {
      ...old,
      pages: [
        { ...old.pages[0], data: [newPost, ...old.pages[0].data] },
        ...old.pages.slice(1),
      ],
    };
  });
  // Also invalidate user posts grid + profile counters
  if (userId) {
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.FEED.USER_POSTS(userId),
    });
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.USERS.PROFILE(userId),
    });
  }
  // author_id makes "which account did this post go out as" answerable
  // from data; without it the Aug 23 wrong-picture report could only be
  // guessed at (152/153 share one PostHog person, so distinct_id is moot).
  analytics.capture(ANALYTICS_EVENTS.FEED.POST_CREATED, {
    post_type: variables.postType,
    media_count: variables.media.length,
    author_id: authorId,
    ui_user_id: userId ?? null,
    post_id: (newPost as { id?: string | number } | undefined)?.id ?? null,
    has_cover: !!variables.coverUri,
  });
}

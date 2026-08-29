import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { mediaService, type MediaContext } from '@/lib/media/mediaService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import { authStorage } from '@/lib/auth/storage';
import { getTokenUserId } from '@/lib/auth/jwt';
import type { PostType } from '@/types/post';
import type { PickedMedia } from '../types';

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

interface CreatePostParams {
  postType: PostType;
  media: PickedMedia[];
  caption: string;
  poemText: string;
  onProgress?: (progress: number) => void;
}

function getMediaContext(postType: PostType): MediaContext {
  if (postType === 'audio') return 'audio';
  if (postType === 'video') return 'video';
  if (postType === 'reel') return 'reel';
  return 'content';
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const mutation = useMutation({
    mutationFn: async ({
      postType,
      media,
      caption,
      poemText,
      onProgress,
    }: CreatePostParams) => {
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

      // Build metadata. Persisting the media's native dimensions lets the feed
      // render the correct aspect ratio immediately, instead of starting at a
      // 1:1 box and snapping once the player decodes the first frame.
      const metadata: Record<string, string> = {};
      if (media[0]?.duration) {
        metadata.duration = String(media[0].duration);
      }
      if (media[0]?.width && media[0]?.height) {
        metadata.width = String(media[0].width);
        metadata.height = String(media[0].height);
      }

      // Create the post via API
      const textContent = postType === 'text' ? poemText : caption;
      const created = await feedService.createPost({
        textContent,
        contentType: postType,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
      return { post: created, authorId };
    },
    onSuccess: ({ post: newPost, authorId }, variables) => {
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
      });
    },
  });

  return {
    // Callers only ever used the created post; keep that contract.
    createPost: async (params: CreatePostParams) =>
      (await mutation.mutateAsync(params)).post,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

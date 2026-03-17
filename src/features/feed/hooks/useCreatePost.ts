import { useMutation, useQueryClient } from '@tanstack/react-query';
import { feedService } from '../services/feedService';
import { mediaService, type MediaContext } from '@/lib/media/mediaService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import type { PostType } from '@/types/post';
import type { PickedMedia } from '../types';

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

      // Build metadata
      const metadata: Record<string, string> = {};
      if (media[0]?.duration) {
        metadata.duration = String(media[0].duration);
      }

      // Create the post via API
      const textContent = postType === 'text' ? poemText : caption;
      return feedService.createPost({
        textContent,
        contentType: postType,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      });
    },
    onSuccess: (newPost, variables) => {
      // Prepend the new post to the feed cache so it appears immediately
      queryClient.setQueryData(QUERY_KEYS.FEED.INFINITE, (old: any) => {
        if (!old?.pages?.length) return old;
        return {
          ...old,
          pages: [
            { ...old.pages[0], data: [newPost, ...old.pages[0].data] },
            ...old.pages.slice(1),
          ],
        };
      });
      // Also invalidate user posts grid on profile
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.FEED.USER_POSTS(userId),
        });
      }
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_CREATED, {
        post_type: variables.postType,
        media_count: variables.media.length,
      });
    },
  });

  return {
    createPost: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

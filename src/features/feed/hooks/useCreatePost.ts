import { useMutation } from '@tanstack/react-query';
import {
  applyPublishedPost,
  publishPost,
  type CreatePostParams,
} from '../publish/publishPost';

/**
 * Publish and wait. The composer no longer uses this (it hands the post to
 * the background publish queue); callers that must wait for the created
 * post still can.
 */
export function useCreatePost() {
  const mutation = useMutation({
    mutationFn: publishPost,
    onSuccess: ({ post, authorId }, variables) =>
      applyPublishedPost(post, authorId, variables),
  });

  return {
    // Callers only ever used the created post; keep that contract.
    createPost: async (params: CreatePostParams) =>
      (await mutation.mutateAsync(params)).post,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Feed Feature Types
 */

import type { Post, PaginatedResponse } from '@/types';
import type { PostType } from '@/types/post';

export interface CreatePostDTO {
  textContent: string;
  contentType: PostType;
  filePaths?: string[];
  metadata?: Record<string, string>;
  tags?: string[];
}

/** Raw shape returned by the backend feed endpoint. */
export interface FeedApiResponse {
  success: boolean;
  data: FeedApiPost[];
  error: unknown;
  meta: {
    nextCursor: number | null;
    hasMore: boolean;
  };
}

/** Single post as returned by the backend FeedPostDto. */
export interface FeedApiPost {
  id: string;
  authorId: string;
  contentType: string;
  textContent: string;
  filePaths: string[];
  metadata: Record<string, string>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
  };
  interactions: {
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    repostsCount: number;
    isLiked: boolean;
    isBookmarked: boolean;
    isReposted: boolean;
  };
}

export type FeedResponse = PaginatedResponse<Post>;

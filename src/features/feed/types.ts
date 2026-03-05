/**
 * Feed Feature Types
 */

import type { Post, PaginatedResponse } from '@/types';

export interface CreatePostDTO {
  content: string;
  images?: string[];
}

export type FeedResponse = PaginatedResponse<Post>;

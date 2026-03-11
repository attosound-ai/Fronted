import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Post } from '@/types';

interface ContentSearchResult {
  id: string;
  authorId: string;
  contentType: string;
  textContent?: string;
  filePaths: string[];
  metadata: Record<string, string>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function mapToPost(raw: ContentSearchResult): Post {
  return {
    id: raw.id,
    content: raw.textContent ?? '',
    images: raw.contentType === 'image' ? raw.filePaths : [],
    author: { id: 0, username: '', displayName: '', avatar: null },
    likesCount: 0,
    commentsCount: 0,
    isLiked: false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    contentType: raw.contentType,
    textContent: raw.textContent,
    filePaths: raw.filePaths,
    metadata: raw.metadata,
    tags: raw.tags,
  };
}

export function useContentSearch(query: string, contentType?: string) {
  return useQuery<Post[]>({
    queryKey: QUERY_KEYS.FEED.SEARCH(query + (contentType ?? '')),
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await apiClient.get(API_ENDPOINTS.POSTS.SEARCH, {
        params: { q: query, content_type: contentType, limit: 30 },
      });
      const raw: ContentSearchResult[] = res.data?.data ?? [];
      return raw.map(mapToPost);
    },
    enabled: query.trim().length > 0,
    staleTime: 1000 * 30,
  });
}

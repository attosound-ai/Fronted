import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { cloudinaryUrl } from '@/lib/media/cloudinaryUrl';
import type { Post, ApiResponse } from '@/types';
import type { FeedResponse, CreatePostDTO, FeedApiResponse, FeedApiPost } from '../types';

/** Map a backend FeedApiPost into the frontend Post shape. */
function mapApiPost(raw: FeedApiPost): Post {
  return {
    id: raw.id,
    content: raw.textContent || '',
    images:
      raw.contentType === 'image'
        ? raw.filePaths.map((fp) => cloudinaryUrl(fp, 'feed') ?? fp)
        : [],
    author: {
      id: Number(raw.author?.id) || 0,
      username: raw.author?.username || 'unknown',
      displayName: raw.author?.displayName || raw.author?.username || 'Unknown',
      avatar: raw.author?.avatar || null,
      role: raw.author?.role ?? 'listener',
    } as Post['author'],
    likesCount: raw.interactions?.likesCount ?? 0,
    commentsCount: raw.interactions?.commentsCount ?? 0,
    isLiked: raw.interactions?.isLiked ?? false,
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || raw.createdAt || '',
    contentType: raw.contentType,
    textContent: raw.textContent,
    filePaths: raw.filePaths,
    metadata: raw.metadata,
    tags: raw.tags,
    sharesCount: raw.interactions?.sharesCount ?? 0,
    repostsCount: raw.interactions?.repostsCount ?? 0,
    isBookmarked: raw.interactions?.isBookmarked ?? false,
    isReposted: raw.interactions?.isReposted ?? false,
    isFollowingAuthor: raw.isFollowingAuthor,
  };
}

/**
 * FeedService - Servicio de API para el feed
 *
 * Principio SOLID:
 * - Single Responsibility: Solo maneja llamadas API del feed
 * - Interface Segregation: Métodos específicos para cada operación
 */
export const feedService = {
  /**
   * Obtiene el feed paginado.
   * Normalizes the backend { success, data, meta } shape into PaginatedResponse<Post>.
   */
  async getFeed(cursor?: string): Promise<FeedResponse> {
    const response = await apiClient.get<FeedApiResponse>(API_ENDPOINTS.POSTS.FEED, {
      params: { cursor },
    });
    const body = response.data;
    return {
      data: (body.data || []).map(mapApiPost),
      nextCursor:
        body.meta?.nextCursor != null ? String(body.meta.nextCursor) : undefined,
      hasMore: body.meta?.hasMore ?? false,
      total: body.data?.length ?? 0,
    };
  },

  /**
   * Obtiene un post por ID
   */
  async getPost(postId: string): Promise<Post> {
    const response = await apiClient.get<ApiResponse<Post>>(
      API_ENDPOINTS.POSTS.DETAIL(postId)
    );
    return response.data.data;
  },

  /**
   * Crea un nuevo post
   */
  async createPost(data: CreatePostDTO): Promise<Post> {
    const response = await apiClient.post<ApiResponse<FeedApiPost>>(
      API_ENDPOINTS.POSTS.CREATE,
      data,
      { timeout: 60000 }
    );
    return mapApiPost(response.data.data);
  },

  /**
   * Da like a un post
   */
  async likePost(postId: string): Promise<void> {
    await apiClient.post(API_ENDPOINTS.POSTS.LIKE(postId));
  },

  /**
   * Quita like de un post
   */
  async unlikePost(postId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.POSTS.LIKE(postId));
  },

  /**
   * Edita un post (text/tags only)
   */
  async updatePost(
    postId: string,
    data: { textContent?: string; tags?: string[] }
  ): Promise<Post> {
    const response = await apiClient.put<ApiResponse<FeedApiPost>>(
      API_ENDPOINTS.POSTS.UPDATE(postId),
      data
    );
    return mapApiPost(response.data.data);
  },

  /**
   * Elimina un post
   */
  async deletePost(postId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.POSTS.DELETE(postId));
  },

  async bookmarkPost(postId: string): Promise<void> {
    await apiClient.post(API_ENDPOINTS.POSTS.BOOKMARK(postId));
  },

  async unbookmarkPost(postId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.POSTS.BOOKMARK(postId));
  },

  async repost(postId: string): Promise<void> {
    await apiClient.post(API_ENDPOINTS.POSTS.REPOST(postId));
  },

  async unrepost(postId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.POSTS.REPOST(postId));
  },

  async sharePost(postId: string): Promise<void> {
    await apiClient.post(API_ENDPOINTS.POSTS.SHARE(postId));
  },

  async getBookmarks(page = 1, limit = 20) {
    const response = await apiClient.get(API_ENDPOINTS.POSTS.BOOKMARKS_LIST, {
      params: { page, limit },
    });
    return response.data;
  },

  async getExploreFeed(cursor?: string): Promise<FeedResponse> {
    const response = await apiClient.get<FeedApiResponse>(API_ENDPOINTS.POSTS.EXPLORE, {
      params: { cursor },
    });
    const body = response.data;
    return {
      data: (body.data || []).map(mapApiPost),
      nextCursor:
        body.meta?.nextCursor != null ? String(body.meta.nextCursor) : undefined,
      hasMore: body.meta?.hasMore ?? false,
      total: body.data?.length ?? 0,
    };
  },

  async getReelsFeed(cursor?: string): Promise<FeedResponse> {
    const response = await apiClient.get<FeedApiResponse>(API_ENDPOINTS.POSTS.REELS, {
      params: { cursor },
    });
    const body = response.data;
    return {
      data: (body.data || []).map(mapApiPost),
      nextCursor:
        body.meta?.nextCursor != null ? String(body.meta.nextCursor) : undefined,
      hasMore: body.meta?.hasMore ?? false,
      total: body.data?.length ?? 0,
    };
  },

  async recordReelView(postId: string, watchMs: number, replays: number): Promise<void> {
    await apiClient.post(API_ENDPOINTS.POSTS.REELS_VIEW, { postId, watchMs, replays });
  },

  async getUserPosts(userId: number, cursor?: string): Promise<FeedResponse> {
    const response = await apiClient.get<FeedApiResponse>(
      API_ENDPOINTS.POSTS.USER_POSTS(userId),
      {
        params: { cursor },
      }
    );
    const body = response.data;
    return {
      data: (body.data || []).map(mapApiPost),
      nextCursor:
        body.meta?.nextCursor == null ? undefined : String(body.meta.nextCursor),
      hasMore: body.meta?.hasMore ?? false,
      total: body.data?.length ?? 0,
    };
  },

  async getComments(postId: string, page = 1, limit = 20) {
    const response = await apiClient.get(API_ENDPOINTS.POSTS.COMMENTS(postId), {
      params: { page, limit },
    });
    return response.data;
  },

  async addComment(postId: string, text: string, parentId?: string) {
    const response = await apiClient.post(API_ENDPOINTS.POSTS.COMMENTS(postId), {
      comment: text,
      parentId,
    });
    return response.data;
  },

  async editComment(postId: string, commentId: string, text: string) {
    const response = await apiClient.put(API_ENDPOINTS.POSTS.COMMENT(postId, commentId), {
      comment: text,
    });
    return response.data;
  },

  async deleteComment(postId: string, commentId: string) {
    const response = await apiClient.delete(
      API_ENDPOINTS.POSTS.COMMENT(postId, commentId)
    );
    return response.data;
  },
};

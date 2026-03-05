import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { Post, ApiResponse } from '@/types';
import type { FeedResponse, CreatePostDTO } from '../types';

/**
 * FeedService - Servicio de API para el feed
 *
 * Principio SOLID:
 * - Single Responsibility: Solo maneja llamadas API del feed
 * - Interface Segregation: Métodos específicos para cada operación
 */
export const feedService = {
  /**
   * Obtiene el feed paginado
   */
  async getFeed(cursor?: string): Promise<FeedResponse> {
    const response = await apiClient.get<FeedResponse>(
      API_ENDPOINTS.POSTS.FEED,
      { params: { cursor } }
    );
    return response.data;
  },

  /**
   * Obtiene un post por ID
   */
  async getPost(postId: string): Promise<Post> {
    const response = await apiClient.get<ApiResponse<Post>>(
      API_ENDPOINTS.POSTS.DETAIL(postId),
    );
    return response.data.data;
  },

  /**
   * Crea un nuevo post
   */
  async createPost(data: CreatePostDTO): Promise<Post> {
    const response = await apiClient.post<ApiResponse<Post>>(
      API_ENDPOINTS.POSTS.CREATE,
      data
    );
    return response.data.data;
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
   * Elimina un post
   */
  async deletePost(postId: string): Promise<void> {
    await apiClient.delete(API_ENDPOINTS.POSTS.DETAIL(postId));
  },
};

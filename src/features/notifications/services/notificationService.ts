import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import type { NotificationItem } from '../types';

interface NotificationsResponse {
  success: boolean;
  data: NotificationItem[];
  error: null;
  meta: {
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export const notificationService = {
  async getNotifications(page = 1, limit = 20): Promise<NotificationsResponse> {
    const response = await apiClient.get<NotificationsResponse>(
      API_ENDPOINTS.NOTIFICATIONS.LIST,
      { params: { page, limit } }
    );
    return response.data;
  },

  async markAsRead(notificationId: string): Promise<void> {
    await apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.MARK_READ(notificationId));
  },

  async markReadByActor(type: string, actorId: string): Promise<void> {
    await apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.MARK_READ_BY_ACTOR, {
      type,
      actorId,
    });
  },

  async markAllRead(): Promise<void> {
    await apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
  },

  async getUnreadCount(): Promise<number> {
    const response = await apiClient.get<{
      success: boolean;
      data: { count: number };
    }>(API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT);
    return response.data.data.count;
  },
};

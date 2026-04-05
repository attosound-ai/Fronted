import { useInfiniteQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { notificationService } from '../services/notificationService';
import { groupNotifications } from '../utils/groupNotifications';
import type { NotificationItem, NotificationSection } from '../types';

interface NotificationsPage {
  notifications: NotificationItem[];
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export function useNotifications() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useInfiniteQuery<NotificationsPage>({
    queryKey: QUERY_KEYS.NOTIFICATIONS.ALL,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      const response = await notificationService.getNotifications(page, 20);
      return {
        notifications: response.data,
        page,
        totalPages: response.meta.pagination.totalPages,
        hasMore: page < response.meta.pagination.totalPages,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    staleTime: 30_000,
  });

  const allNotifications = data?.pages.flatMap((p) => p.notifications) ?? [];
  const sections: NotificationSection[] = groupNotifications(allNotifications);

  return {
    sections,
    allNotifications,
    isLoading,
    isRefreshing: isRefetching,
    refresh: refetch,
    loadMore: fetchNextPage,
    isFetchingMore: isFetchingNextPage,
    hasMore: hasNextPage ?? false,
    error: error as Error | null,
  };
}

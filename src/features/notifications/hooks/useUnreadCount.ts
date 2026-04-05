import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { notificationService } from '../services/notificationService';

export function useUnreadCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: count = 0 } = useQuery({
    queryKey: QUERY_KEYS.NOTIFICATIONS.UNREAD,
    queryFn: async () => {
      const c = await notificationService.getUnreadCount();
      useNotificationStore.getState().setUnreadCount(c);
      return c;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  return count;
}

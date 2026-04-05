import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { useNotificationStore } from '@/stores/notificationStore';
import { notificationService } from '../services/notificationService';

export function useMarkRead() {
  const queryClient = useQueryClient();

  const markSingleMutation = useMutation({
    mutationFn: (notificationIds: string[]) =>
      Promise.all(notificationIds.map((id) => notificationService.markAsRead(id))),
    onMutate: () => {
      useNotificationStore.getState().decrementUnread();
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.NOTIFICATIONS.ALL,
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.NOTIFICATIONS.UNREAD,
      });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onMutate: () => {
      useNotificationStore.getState().resetUnread();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.NOTIFICATIONS.ALL,
      });
      queryClient.setQueryData(QUERY_KEYS.NOTIFICATIONS.UNREAD, 0);
    },
  });

  return {
    markAsRead: (notificationIds: string[]) => markSingleMutation.mutate(notificationIds),
    markAllAsRead: () => markAllMutation.mutate(),
  };
}

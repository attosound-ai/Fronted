import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/features/messages/stores/chatStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { badgeService } from '@/lib/badge';
import { startBadgeNotificationListener } from '@/lib/badge/notificationListener';

export function useBadgeSync(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const chatUnread = useChatStore((s) => s.totalUnread);
  const notifUnread = useNotificationStore((s) => s.unreadCount);

  useEffect(() => {
    if (!isAuthenticated) {
      badgeService.clear().catch(() => {});
      return;
    }
    badgeService.recompute().catch(() => {});
  }, [isAuthenticated, userId, chatUnread, notifUnread]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') badgeService.recompute().catch(() => {});
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  useEffect(() => {
    const sub = startBadgeNotificationListener();
    return () => sub.remove();
  }, []);
}

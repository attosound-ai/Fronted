import { useNotificationStore } from '@/stores/notificationStore';
import type { UnreadSource } from '../types';

export class NotificationUnreadSource implements UnreadSource {
  readonly key = 'notifications';

  getCount(): number {
    return useNotificationStore.getState().unreadCount;
  }
}

import { useChatStore } from '@/features/messages/stores/chatStore';
import type { UnreadSource } from '../types';

export class ChatUnreadSource implements UnreadSource {
  readonly key = 'chat';

  getCount(): number {
    return useChatStore.getState().totalUnread;
  }
}

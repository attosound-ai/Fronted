import { create } from 'zustand';
import { phoenixSocket } from '@/lib/api/phoenixSocket';

interface ChatState {
  activeConversationId: string | null;
  isSocketConnected: boolean;
  typingUsers: Record<string, Set<string>>; // conversationId → Set<userId>
  totalUnread: number;
}

interface ChatActions {
  setActiveConversation: (id: string | null) => void;
  connectSocket: () => Promise<void>;
  disconnectSocket: () => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  clearTyping: (conversationId: string) => void;
  setTotalUnread: (count: number) => void;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  activeConversationId: null,
  isSocketConnected: false,
  typingUsers: {},
  totalUnread: 0,

  setActiveConversation: (id) => set({ activeConversationId: id }),

  connectSocket: async () => {
    if (get().isSocketConnected) return;
    await phoenixSocket.connect();
    set({ isSocketConnected: phoenixSocket.isConnected() });
  },

  disconnectSocket: () => {
    phoenixSocket.disconnect();
    set({ isSocketConnected: false, typingUsers: {} });
  },

  setTyping: (conversationId, userId, isTyping) => {
    set((state) => {
      const current = new Set(state.typingUsers[conversationId] ?? []);
      if (isTyping) current.add(userId);
      else current.delete(userId);
      return {
        typingUsers: { ...state.typingUsers, [conversationId]: current },
      };
    });
  },

  clearTyping: (conversationId) => {
    set((state) => {
      const next = { ...state.typingUsers };
      delete next[conversationId];
      return { typingUsers: next };
    });
  },

  setTotalUnread: (count) => set({ totalUnread: count }),
}));

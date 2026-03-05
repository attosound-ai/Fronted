import { create } from 'zustand';

interface ChatState {
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),
}));

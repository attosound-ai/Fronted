import { create } from 'zustand';

/**
 * Hand off between the chat composer and the full screen editor route
 * (Telegram's expand button). The composer opens the editor with the current
 * text; the editor closes with either the edited text (back to the field) or
 * a send. Nothing here persists: it only lives while the editor is up.
 */

export interface ComposerExpandResult {
  conversationId: string;
  action: 'close' | 'send';
  text: string;
}

interface ComposerExpandState {
  conversationId: string | null;
  text: string;
  result: ComposerExpandResult | null;
  open: (conversationId: string, text: string) => void;
  finish: (action: 'close' | 'send', text: string) => void;
  /** The composer took the result. */
  consume: () => void;
}

export const useComposerExpandStore = create<ComposerExpandState>()((set, get) => ({
  conversationId: null,
  text: '',
  result: null,
  open: (conversationId, text) => set({ conversationId, text, result: null }),
  finish: (action, text) => {
    const conversationId = get().conversationId;
    if (!conversationId) return;
    set({ result: { conversationId, action, text }, conversationId: null, text: '' });
  },
  consume: () => set({ result: null }),
}));

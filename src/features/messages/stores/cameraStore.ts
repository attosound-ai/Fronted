import { create } from 'zustand';
import type { OutgoingMedia } from '../media/chatMedia';

/**
 * Hand off between the chat and the in app camera route. The chat opens the
 * camera for one conversation; the camera closes leaving the capture here,
 * and the chat sends it. Nothing persists: it only lives while the camera
 * is up.
 */

export type CameraMode = 'photo' | 'video_note';

interface CameraState {
  conversationId: string | null;
  mode: CameraMode;
  result: { conversationId: string; media: OutgoingMedia } | null;
  open: (conversationId: string, mode: CameraMode) => void;
  finish: (media: OutgoingMedia) => void;
  /** The chat took the capture. */
  consume: () => void;
}

export const useCameraStore = create<CameraState>()((set, get) => ({
  conversationId: null,
  mode: 'photo',
  result: null,
  open: (conversationId, mode) => set({ conversationId, mode, result: null }),
  finish: (media) => {
    const conversationId = get().conversationId;
    if (!conversationId) return;
    set({ result: { conversationId, media } });
  },
  consume: () => set({ result: null, conversationId: null }),
}));

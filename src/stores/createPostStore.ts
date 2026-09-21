import { create } from 'zustand';

interface PendingAudio {
  uri: string;
  fileName: string;
  durationMs: number;
  /**
   * Local image the editor's exporter picked as the cover. The composer
   * prefills it, and the person can still change or drop it before posting.
   */
  coverUri?: string;
}

interface CreatePostStore {
  pendingAudio: PendingAudio | null;
  setPendingAudio: (audio: PendingAudio) => void;
  clearPendingAudio: () => void;
}

export const useCreatePostStore = create<CreatePostStore>((set) => ({
  pendingAudio: null,
  setPendingAudio: (audio) => set({ pendingAudio: audio }),
  clearPendingAudio: () => set({ pendingAudio: null }),
}));

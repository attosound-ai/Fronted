import { create } from 'zustand';

interface PendingAudio {
  uri: string;
  fileName: string;
  durationMs: number;
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

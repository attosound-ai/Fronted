import { create } from 'zustand';

/**
 * How far each outgoing media message has got, by its temporary id, from 0
 * to 1. Kept out of the message cache on purpose: progress ticks many times
 * a second and only the one bubble that is uploading should redraw.
 */
interface UploadProgressState {
  progress: Record<string, number>;
  set: (id: string, value: number) => void;
  clear: (id: string) => void;
}

/** Whole percents only, so a tick that changes nothing visible redraws nothing. */
export function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export const useUploadProgress = create<UploadProgressState>()((set) => ({
  progress: {},
  set: (id, value) =>
    set((state) => {
      const next = toPercent(value) / 100;
      if (state.progress[id] === next) return state;
      return { progress: { ...state.progress, [id]: next } };
    }),
  clear: (id) =>
    set((state) => {
      if (!(id in state.progress)) return state;
      const rest = { ...state.progress };
      delete rest[id];
      return { progress: rest };
    }),
}));

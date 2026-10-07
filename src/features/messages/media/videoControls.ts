import { create } from 'zustand';

/**
 * Which chat videos have the system controls on screen, by message id. While
 * they are up the row hides the time of the message: the scrubber writes the
 * time left in that same corner and the two sat on top of each other (seen on
 * David's phone, Oct 6 2026). Kept out of the message cache for the same
 * reason as the upload progress: only that one bubble should redraw.
 */
export type OpenControls = Record<string, true>;

/** Returns the same object when nothing changes, so no bubble redraws. */
export function withControls(open: OpenControls, id: string, up: boolean): OpenControls {
  if (!id || !!open[id] === up) return open;
  const next = { ...open };
  if (up) next[id] = true;
  else delete next[id];
  return next;
}

interface VideoControlsState {
  open: OpenControls;
  set: (id: string, up: boolean) => void;
}

export const useVideoControls = create<VideoControlsState>()((set) => ({
  open: {},
  set: (id, up) =>
    set((state) => {
      const open = withControls(state.open, id, up);
      return open === state.open ? state : { open };
    }),
}));

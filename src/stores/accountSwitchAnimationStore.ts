import { create } from 'zustand';

type Phase = 'idle' | 'flipping' | 'holding' | 'done';

interface TargetUser {
  displayName: string;
  avatar: string | null;
}

interface AccountSwitchAnimationState {
  phase: Phase;
  targetUser: TargetUser | null;
  pendingEnd: boolean;
}

interface AccountSwitchAnimationActions {
  startFlip: (targetUser: TargetUser) => void;
  holdFlip: () => void;
  endFlip: () => void;
  reset: () => void;
}

export const useAccountSwitchAnimationStore = create<
  AccountSwitchAnimationState & AccountSwitchAnimationActions
>((set, get) => ({
  phase: 'idle',
  targetUser: null,
  pendingEnd: false,

  startFlip: (targetUser) => set({ phase: 'flipping', targetUser, pendingEnd: false }),

  holdFlip: () => {
    const { pendingEnd } = get();
    set({ phase: pendingEnd ? 'done' : 'holding' });
  },

  endFlip: () => {
    const { phase } = get();
    if (phase === 'holding') set({ phase: 'done' });
    else if (phase === 'flipping') set({ pendingEnd: true });
  },

  reset: () => set({ phase: 'idle', targetUser: null, pendingEnd: false }),
}));

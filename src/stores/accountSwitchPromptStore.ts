import { create } from 'zustand';

/**
 * Drives the "you're on a call — choose what to do" prompt shown when a user
 * tries to switch accounts while a call is active (Sep 8 2026 "stuck on wrong
 * account" incident).
 *
 * Before, the two switch entry points disagreed and both dead-ended:
 *  - the double-tap gesture (useProfileTabGestures) swallowed the rejection
 *    with `.finally()` and gave NO feedback → the app just seemed frozen;
 *  - the switcher bottom sheet showed an "end the call first" toast the user
 *    could not act on (no visible call, no way to end it from there).
 *
 * Now both route here. A single global host (AccountSwitchBlockedSheet) renders
 * the choice: End the call & switch, or stay. The user always knows WHAT is
 * blocking and can pick.
 */
interface PendingSwitch {
  targetUserId: number;
  targetUsername: string;
}

interface AccountSwitchPromptState {
  pending: PendingSwitch | null;
  busy: boolean;
}

interface AccountSwitchPromptActions {
  /** Open the prompt for a switch that was blocked by an active call. */
  request: (pending: PendingSwitch) => void;
  /** Dismiss without switching (user chose to stay on the call). */
  dismiss: () => void;
  /**
   * Hang up the current call, wait for teardown, then perform the switch.
   * Resolves when done (or on error — errors are swallowed so the UI never
   * hangs; the switch store emits its own telemetry).
   */
  confirmEndCallAndSwitch: () => Promise<void>;
}

export const useAccountSwitchPromptStore = create<
  AccountSwitchPromptState & AccountSwitchPromptActions
>((set, get) => ({
  pending: null,
  busy: false,

  request: (pending) => set({ pending }),

  dismiss: () => {
    if (get().busy) return; // don't close mid-teardown
    set({ pending: null });
  },

  confirmEndCallAndSwitch: async () => {
    const { pending, busy } = get();
    if (!pending || busy) return;
    set({ busy: true });
    try {
      const { endCallAndWait } = await import('@/hooks/useTwilioVoice');
      await endCallAndWait();
      const { useAccountStore } = await import('./accountStore');
      await useAccountStore.getState().switchToAccount(pending.targetUserId);
    } catch {
      // switchToAccount handles its own rollback + telemetry. Swallow so the
      // sheet always closes rather than stranding the user on a spinner.
    } finally {
      set({ pending: null, busy: false });
    }
  },
}));

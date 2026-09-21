import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useCallStore } from '@/stores/callStore';
import { useAuthStore } from '@/stores/authStore';
import { getCallPlaybackController } from '@/lib/callAudio/session/controllerInstance';
import { resolveEngineMode } from '@/lib/callAudio/session/engineMode';
import { isCallConnected } from '@/hooks/useInCallChrome';

/**
 * CallPlaybackHost: the lifecycle owner of the call playback session (Sep 15
 * 2026). Mounted once at the root next to CallAudioInjectionHost. It:
 *
 *  1. LATCHES the engine mode when a call connects (once per call sid; again
 *     only if the active account changes mid call), so PostHog flags arriving
 *     late on a cold CallKit launch can never flip a surface from expo to the
 *     engine while something is audible.
 *  2. Resets everything the moment the call ends (sid → null): unload, close
 *     the transmit gate, drop the mode. The next call starts with 📡 OFF.
 *
 * Renders nothing. Inert off iOS and while the flag cohort is empty (the mode
 * resolves to off and every surface keeps its expo player).
 */
export function CallPlaybackHost() {
  const callSid = useCallStore((s) => s.activeCall?.callSid ?? null);
  const callState = useCallStore((s) => s.activeCall?.state);
  const activeUserId = useAuthStore((s) => s.user?.id ?? null);
  const latchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const connected = isCallConnected(callState);
    const latchKey = callSid && connected ? `${callSid}:${String(activeUserId)}` : null;
    if (!latchKey || latchedForRef.current === latchKey) return;
    const controller = getCallPlaybackController();
    const accountSwitched =
      latchedForRef.current !== null && latchedForRef.current.startsWith(`${callSid}:`);
    latchedForRef.current = latchKey;
    const { mode, gates } = resolveEngineMode();
    void (async () => {
      if (accountSwitched) await controller.stop(null, 'account_switch');
      await controller.setEngineMode(mode, callSid, {
        ...gates,
        account_switched: accountSwitched,
      });
    })();
  }, [callSid, callState, activeUserId]);

  const prevSidRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSidRef.current;
    prevSidRef.current = callSid;
    if (prev && !callSid) {
      latchedForRef.current = null;
      void getCallPlaybackController().resetForCallEnd();
    }
  }, [callSid]);

  return null;
}

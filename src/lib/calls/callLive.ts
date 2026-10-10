import { useCallStore } from '@/stores/callStore';
import { getCallAudioState } from '@/lib/telemetry/deviceSnapshot';

/**
 * Is a phone call holding the audio session right now?
 *
 * The JS call store can lag CallKit by seconds (Oct 10 2026: a lock screen answer
 * resumed the app with activeCall still null while the call was connected), so the
 * system's own list (CXCallObserver, via getCallAudioState) is asked too. Use it
 * before anything that would change the audio session: recording, a session mode
 * write, a remount that rebuilds players.
 */
export async function isCallLiveNow(): Promise<boolean> {
  if (useCallStore.getState().activeCall != null) return true;
  const native = await getCallAudioState().catch(() => null);
  return (native?.liveCallKitCalls ?? 0) > 0;
}

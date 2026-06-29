import { NativeModules, Platform } from 'react-native';
import type { MixerChannel } from '@/stores/mixerStore';

/**
 * mixerService — thin bridge wrapper that mirrors mixerStore changes to the
 * native AttoAudioEngineDevice (via the AttoAudioInjection module). Single place
 * that touches the native mixer API, so the store/UI never reference NativeModules.
 *
 * No-ops (never throws) until the native mixer lands (Phase B) or off iOS — so
 * the whole Mixer UI can ship + be wired now while the engine catches up.
 */

interface NativeMixer {
  setMixerChannel?: (channel: string, gain: number, record: boolean) => void;
  setMetronome?: (enabled: boolean, bpm: number) => void;
  startMixRecording?: () => Promise<string | null>;
  stopMixRecording?: () => Promise<string | null>;
}

function nativeMixer(): NativeMixer | null {
  if (Platform.OS !== 'ios') return null;
  const mod = (NativeModules as Record<string, unknown>)['AttoAudioInjection'];
  return mod ? (mod as NativeMixer) : null;
}

export const mixerService = {
  /** Push a channel's gain (0..1) + record-enable to the native mix bus. */
  setChannel(channel: MixerChannel, gain: number, record: boolean): void {
    try {
      nativeMixer()?.setMixerChannel?.(channel, gain, record);
    } catch {
      // best-effort
    }
  },

  setMetronome(enabled: boolean, bpm: number): void {
    try {
      nativeMixer()?.setMetronome?.(enabled, bpm);
    } catch {
      // best-effort
    }
  },

  /** Start the client-side multitrack record; resolves the local file path or null. */
  async startMixRecording(): Promise<string | null> {
    try {
      return (await nativeMixer()?.startMixRecording?.()) ?? null;
    } catch {
      return null;
    }
  },

  /** Stop the record; resolves the finished local file path or null. */
  async stopMixRecording(): Promise<string | null> {
    try {
      return (await nativeMixer()?.stopMixRecording?.()) ?? null;
    } catch {
      return null;
    }
  },

  /** True once the native mixer methods exist (Phase B shipped on this build). */
  isSupported(): boolean {
    const m = nativeMixer();
    return !!(m && typeof m.setMixerChannel === 'function');
  },
};

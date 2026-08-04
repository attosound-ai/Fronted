import { NativeModules, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import type { MixerChannel } from '@/stores/mixerStore';

/**
 * mixerService — thin bridge wrapper that mirrors mixerStore changes to the
 * native AttoAudioEngineDevice (via the AttoAudioInjection module). Single place
 * that touches the native mixer API, so the store/UI never reference NativeModules.
 *
 * No-ops (never throws) until the native mixer lands (Phase B) or off iOS — so
 * the whole Mixer UI can ship + be wired now while the engine catches up.
 */

/**
 * Record a mixer action as a Sentry breadcrumb BEFORE the native call. A native
 * NSException in a void bridge method can't be caught by the JS try/catch below
 * (it crashes through the bridge) — but the breadcrumb is already on the scope, so
 * any subsequent Sentry event/crash shows the exact last mixer action. This is the
 * trail that pinpoints a native audio crash from the report alone.
 */
function trace(action: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category: 'mixer', level: 'info', message: action, data });
}

/**
 * Shape of the native `mixDiagnostics` dictionary. Almost every entry is a plain
 * counter, but `routeReasonCounts` is an ARRAY of 9 integers indexed by the raw
 * AVAudioSessionRouteChangeReason value, so the value type has to admit number[]
 * as well. Keep it that way: typing this `Record<string, number>` silently lies
 * about that one key and would make any consumer treat a histogram as a scalar.
 */
type MixDiagnostics = Record<string, number | number[]>;

interface NativeMixer {
  setMixerChannel?: (channel: string, gain: number, record: boolean) => void;
  setMetronome?: (enabled: boolean, bpm: number) => void;
  startMixRecording?: () => Promise<string | null>;
  stopMixRecording?: () => Promise<string | null>;
  getMixDiagnostics?: () => Promise<MixDiagnostics | null>;
  getMixLevels?: () => Promise<{ remote: number; mic: number } | null>;
}

function nativeMixer(): NativeMixer | null {
  if (Platform.OS !== 'ios') return null;
  const mod = (NativeModules as Record<string, unknown>)['AttoAudioInjection'];
  return mod ? (mod as NativeMixer) : null;
}

export const mixerService = {
  /** Push a channel's gain (0..1) + record-enable to the native mix bus. */
  setChannel(channel: MixerChannel, gain: number, record: boolean): void {
    trace('setChannel', { channel, gain, record });
    try {
      nativeMixer()?.setMixerChannel?.(channel, gain, record);
    } catch {
      // best-effort
    }
  },

  setMetronome(enabled: boolean, bpm: number): void {
    trace('setMetronome', { enabled, bpm });
    try {
      nativeMixer()?.setMetronome?.(enabled, bpm);
    } catch {
      // best-effort
    }
  },

  /**
   * Push EVERY channel's state to the native bus in one pass. Called right
   * before a take arms so the store (what the mixer sheet shows) is the single
   * source of truth for what gets recorded. Without this, a take armed before
   * the user ever opened the sheet ran on the ENGINE's compiled-in defaults,
   * and the two default tables (mixerStore vs AttoAudioEngineDevice -init)
   * could silently disagree — which is exactly how "app audio defaults OFF"
   * shipped defeated once already.
   */
  syncAllChannels(
    channels: Record<MixerChannel, { gain: number; record: boolean }>
  ): void {
    for (const ch of Object.keys(channels) as MixerChannel[]) {
      this.setChannel(ch, channels[ch].gain, channels[ch].record);
    }
  },

  /** Start the client-side multitrack record; resolves the local file path or null. */
  async startMixRecording(): Promise<string | null> {
    trace('startMixRecording');
    try {
      return (await nativeMixer()?.startMixRecording?.()) ?? null;
    } catch {
      return null;
    }
  },

  /** Stop the record; resolves the finished local file path or null. */
  async stopMixRecording(): Promise<string | null> {
    trace('stopMixRecording');
    try {
      return (await nativeMixer()?.stopMixRecording?.()) ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Per-channel frame totals of the last mix (mic/remote/app/total/durationSec).
   * Read right after stopMixRecording — the only window into whether the engine
   * actually captured each channel (remoteFrames≈0 ⇒ engine never got the other
   * party). null off iOS or before the native mixer ships.
   */
  async getMixDiagnostics(): Promise<MixDiagnostics | null> {
    try {
      return (await nativeMixer()?.getMixDiagnostics?.()) ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Live { remote, mic } RMS levels (0..1) while a mix recording is active — the
   * record-screen waveform polls `remote` so it follows the OTHER party. null off
   * iOS / when not recording / before the native engine ships.
   */
  async getMixLevels(): Promise<{ remote: number; mic: number } | null> {
    try {
      return (await nativeMixer()?.getMixLevels?.()) ?? null;
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

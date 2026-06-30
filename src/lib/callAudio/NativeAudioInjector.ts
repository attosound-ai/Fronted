import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  type AudioInjector,
  type InjectReason,
  type InjectResult,
  type InjectSource,
} from './AudioInjector';
import { NullAudioInjector } from './NullAudioInjector';

/**
 * NativeAudioInjector — path A adapter over the custom iOS AVAudioEngine
 * `<TVOAudioDevice>` (ported from Twilio's ExampleAVAudioEngineDevice). It mixes
 * a local file into Twilio's OUTBOUND capture bus (remote hears it) and a local
 * monitor bus (the rep hears it), with no separate audio session — so it never
 * fights the call's PlayAndRecord + mixWithOthers session.
 *
 * The native RCT module lands in a later phase; until then `isSupported()` is
 * false and the factory falls back to the inert NullAudioInjector. Like the rest
 * of the telephony layer, the native module is LAZY-required (never imported at
 * module scope — mirrors getTwilio() in useTwilioVoice) so its absence can never
 * crash app launch.
 */

const NATIVE_MODULE_NAME = 'AttoAudioInjection';

interface NativeInjectionModule {
  playInjectedAudio(localPath: string, monitor: boolean, gain: number): Promise<boolean>;
  stopInjectedAudio(): Promise<void>;
  pauseInjectedAudio?(): Promise<void>;
  resumeInjectedAudio?(): Promise<void>;
  setInjectedGain(gain: number): void;
  setInjectedMonitor(on: boolean): void;
  /** Extract a video's audio track to a temp .m4a (so video can be injected). */
  extractAudioTrack?(videoPath: string): Promise<string>;
}

function getNativeModule(): NativeInjectionModule | null {
  if (Platform.OS !== 'ios') return null;
  const mod = (NativeModules as Record<string, unknown>)[NATIVE_MODULE_NAME];
  return mod ? (mod as NativeInjectionModule) : null;
}

export class NativeAudioInjector extends NullAudioInjector implements AudioInjector {
  private native = getNativeModule();
  private emitterSub: { remove: () => void } | null = null;

  constructor() {
    super();
    // Subscribe to native engine events (position ticks, track_ended, errors)
    // only if the module is actually present.
    if (this.native) {
      try {
        const emitter = new NativeEventEmitter(
          NativeModules[NATIVE_MODULE_NAME] as never
        );
        this.emitterSub = emitter.addListener(
          'AttoAudioInjectionEvent',
          (e: { positionMs?: number; durationMs?: number; ended?: boolean }) => {
            if (e.ended) {
              this.emit({ state: 'stopped', reason: 'track_ended', positionMs: 0 });
              return;
            }
            this.emit({
              positionMs: e.positionMs ?? this.snapshot.positionMs,
              durationMs: e.durationMs ?? this.snapshot.durationMs,
            });
          }
        );
      } catch {
        // emitter wiring is best-effort; position just won't tick
      }
    }
  }

  override isSupported(): boolean {
    return this.native != null;
  }

  /**
   * Remote URLs are downloaded to a local file (the engine only plays local
   * files). VIDEO sources (reels / video posts / video messages) are then run
   * through the native audio extractor, since the engine plays audio files, not
   * video containers — this is what lets ANY app audio, video included, transmit.
   */
  private async resolveLocalPath(source: InjectSource): Promise<string | null> {
    let localPath: string | null = null;
    if (source.uri.startsWith('file://') || source.uri.startsWith('/')) {
      localPath = source.uri;
    } else {
      try {
        const ext = source.isVideo ? 'mp4' : 'm4a';
        const target =
          FileSystem.cacheDirectory +
          `inject-${source.kind}-${hashUri(source.uri)}.${ext}`;
        const info = await FileSystem.getInfoAsync(target);
        localPath = info.exists
          ? target
          : (await FileSystem.downloadAsync(source.uri, target)).uri;
      } catch {
        return null;
      }
    }
    if (!localPath) return null;

    // Video → extract its audio track to an .m4a the engine can play.
    if (source.isVideo && this.native?.extractAudioTrack) {
      try {
        return await this.native.extractAudioTrack(localPath);
      } catch {
        return null;
      }
    }
    return localPath;
  }

  override async start(source: InjectSource): Promise<InjectResult> {
    if (!this.native) return { ok: false, reason: 'not_supported' };
    this.emit({ state: 'preparing', source, reason: null });
    const localPath = await this.resolveLocalPath(source);
    if (!localPath) {
      this.emit({ state: 'error', reason: 'prepare_failed' });
      return { ok: false, reason: 'prepare_failed' };
    }
    try {
      const ok = await this.native.playInjectedAudio(
        localPath,
        this.snapshot.monitor,
        this.snapshot.volume
      );
      if (!ok) {
        this.emit({ state: 'error', reason: 'engine_error' });
        return { ok: false, reason: 'engine_error' };
      }
      this.emit({
        state: 'playing',
        source,
        durationMs: source.durationMs ?? this.snapshot.durationMs,
        reason: 'user_started',
      });
      return { ok: true };
    } catch {
      this.emit({ state: 'error', reason: 'engine_error' });
      return { ok: false, reason: 'engine_error' };
    }
  }

  override async stop(reason: InjectReason): Promise<void> {
    if (!this.native) return;
    try {
      await this.native.stopInjectedAudio();
    } catch {
      // best-effort
    }
    this.emit({ state: 'stopped', source: null, positionMs: 0, reason });
  }

  override async pause(): Promise<void> {
    try {
      await this.native?.pauseInjectedAudio?.();
      this.emit({ state: 'paused' });
    } catch {
      // best-effort
    }
  }

  override async resume(): Promise<void> {
    try {
      await this.native?.resumeInjectedAudio?.();
      this.emit({ state: 'playing' });
    } catch {
      // best-effort
    }
  }

  override setVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    this.emit({ volume: v });
    this.native?.setInjectedGain(v);
  }

  override setMonitor(on: boolean): void {
    this.emit({ monitor: on });
    this.native?.setInjectedMonitor(on);
  }
}

/** Tiny stable hash so the same remote URL maps to the same cache file. */
function hashUri(uri: string): string {
  let h = 0;
  for (let i = 0; i < uri.length; i++) {
    h = (Math.imul(31, h) + uri.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

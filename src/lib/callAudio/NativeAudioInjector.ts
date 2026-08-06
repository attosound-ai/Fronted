import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  type AudioInjector,
  type InjectReason,
  type InjectResult,
  type InjectSource,
} from './AudioInjector';
import { NullAudioInjector } from './NullAudioInjector';
import { withTimeout, TimeoutError } from '@/lib/net/connectivity';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

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
  /**
   * Generation token that makes stop() authoritative over any in-flight start().
   * start() spends SECONDS in prepare (download + audio extraction + the native
   * file read/convert), and it had no cancellation: a stop issued during that
   * window stopped nothing (nothing was playing yet) and the late prepare then
   * scheduled anyway — the "I turned it off but it started sounding" ghost from
   * David's Aug 3 test. Every stop() bumps the generation; start() re-checks it
   * after every await and aborts (or un-schedules) when superseded. A newer
   * start() also bumps it, so rapid re-taps can never stack two schedules.
   */
  private generation = 0;

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

  /** Deterministic cache path for a remote source (same URL → same file). */
  private cachePathFor(source: InjectSource): string {
    const ext = source.isVideo ? 'mp4' : 'm4a';
    return (
      FileSystem.cacheDirectory + `inject-${source.kind}-${hashUri(source.uri)}.${ext}`
    );
  }

  /**
   * Resolve a source to a local, engine-playable file, returning a STRUCTURED
   * outcome so start() can tell the user exactly what went wrong instead of a
   * bare null. On poor service the download was the silent stall (David, Aug 5),
   * so it is bounded by a timeout and every phase is measured.
   */
  private async resolveLocalPath(
    source: InjectSource,
    opts: { timeoutMs: number }
  ): Promise<{
    path: string | null;
    cached: boolean;
    downloadMs: number;
    timedOut: boolean;
    failure: 'none' | 'download' | 'extract';
  }> {
    const t0 = Date.now();
    // Already local (imported file): no network involved.
    if (source.uri.startsWith('file://') || source.uri.startsWith('/')) {
      return this.maybeExtract(source, source.uri, {
        cached: true,
        downloadMs: 0,
        timedOut: false,
      });
    }

    const target = this.cachePathFor(source);
    // Cache hit: the prefetch (or an earlier tap) already fetched it. Instant.
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && (info.size ?? 0) > 0) {
        return this.maybeExtract(source, target, {
          cached: true,
          downloadMs: 0,
          timedOut: false,
        });
      }
    } catch {
      // getInfoAsync failing is not fatal; fall through to download.
    }

    // Cold: download, bounded so a dead connection cannot hang the caller. The
    // native download may keep running into cache (useful: the retry tap hits it
    // warm), but WE stop waiting and report the timeout.
    try {
      const res = await withTimeout(
        FileSystem.downloadAsync(source.uri, target),
        opts.timeoutMs
      );
      return this.maybeExtract(source, res.uri, {
        cached: false,
        downloadMs: Date.now() - t0,
        timedOut: false,
      });
    } catch (error: unknown) {
      return {
        path: null,
        cached: false,
        downloadMs: Date.now() - t0,
        timedOut: error instanceof TimeoutError,
        failure: 'download',
      };
    }
  }

  /**
   * Video → extract its audio track to an .m4a the engine can play (the engine
   * plays audio files, not video containers). Audio sources pass straight
   * through. Shared tail of resolveLocalPath.
   */
  private async maybeExtract(
    source: InjectSource,
    localPath: string,
    meta: { cached: boolean; downloadMs: number; timedOut: boolean }
  ): Promise<{
    path: string | null;
    cached: boolean;
    downloadMs: number;
    timedOut: boolean;
    failure: 'none' | 'download' | 'extract';
  }> {
    if (source.isVideo && this.native?.extractAudioTrack) {
      try {
        const extracted = await this.native.extractAudioTrack(localPath);
        return { path: extracted, ...meta, failure: 'none' };
      } catch {
        return { path: null, ...meta, failure: 'extract' };
      }
    }
    return { path: localPath, ...meta, failure: 'none' };
  }

  /**
   * Warm the cache without playing. Best-effort, generous timeout (this runs in
   * the background the moment the editor opens, so it can afford to wait); a
   * failure is swallowed because start() will retry and surface any error then.
   */
  override async prefetch(source: InjectSource): Promise<void> {
    if (!this.native) return;
    if (source.uri.startsWith('file://') || source.uri.startsWith('/')) return;
    const target = this.cachePathFor(source);
    const t0 = Date.now();
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && (info.size ?? 0) > 0) {
        analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_PREFETCH, {
          outcome: 'already_cached',
          source_kind: source.kind,
        });
        return;
      }
      await withTimeout(FileSystem.downloadAsync(source.uri, target), 30_000);
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_PREFETCH, {
        outcome: 'downloaded',
        source_kind: source.kind,
        download_ms: Date.now() - t0,
      });
    } catch (error: unknown) {
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_PREFETCH, {
        outcome: error instanceof TimeoutError ? 'timed_out' : 'failed',
        source_kind: source.kind,
        download_ms: Date.now() - t0,
      });
    }
  }

  override async start(source: InjectSource): Promise<InjectResult> {
    if (!this.native) return { ok: false, reason: 'not_supported' };
    // Claim a fresh generation: this start supersedes anything in flight, and
    // any later stop() supersedes THIS.
    const gen = ++this.generation;
    this.emit({ state: 'preparing', source, reason: null });
    // On a live tap the user is waiting, so the wait is short (the prefetch on
    // editor-open should already have this warm). 12s is long enough for a small
    // track on a slow-but-alive link, short enough that a dead link reports back
    // while the user is still looking at the button.
    const t0 = Date.now();
    const resolved = await this.resolveLocalPath(source, { timeoutMs: 12_000 });
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_INJECT_PREPARE, {
      source_kind: source.kind,
      is_video: source.isVideo ?? false,
      cached: resolved.cached,
      prepare_ms: Date.now() - t0,
      download_ms: resolved.downloadMs,
      timed_out: resolved.timedOut,
      failure: resolved.failure,
      ok: !!resolved.path,
    });
    if (gen !== this.generation) {
      // A stop (or newer start) arrived while we were downloading/extracting.
      // Nothing was scheduled yet, so there is nothing to undo — just don't.
      return { ok: false, reason: 'superseded' };
    }
    if (!resolved.path) {
      // Distinct reasons so the UI can say the RIGHT thing: a timeout is "weak
      // signal, try again" (the file may even arrive for the retry), a genuine
      // failure is "couldn't prepare".
      const reason: InjectReason = resolved.timedOut
        ? 'prepare_timeout'
        : 'prepare_failed';
      this.emit({ state: 'error', reason });
      return { ok: false, reason };
    }
    const localPath = resolved.path;
    try {
      const ok = await this.native.playInjectedAudio(
        localPath,
        this.snapshot.monitor,
        this.snapshot.volume
      );
      if (gen !== this.generation) {
        // Superseded DURING the native schedule: the engine may now be playing a
        // file the user already stopped. Kill it before anyone hears it.
        if (ok) {
          try {
            await this.native.stopInjectedAudio();
          } catch {
            // best-effort; the stop that superseded us also issued its own
          }
        }
        return { ok: false, reason: 'superseded' };
      }
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
    // Invalidate any in-flight start() FIRST, so a prepare that finishes after
    // this line cannot schedule audio the user just stopped.
    this.generation++;
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

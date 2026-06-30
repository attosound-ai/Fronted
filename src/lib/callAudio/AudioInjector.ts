/**
 * AudioInjector — the platform-agnostic contract for playing a phone-side track
 * (a post's audio, a reel, or a backing beat) INTO a live call so the remote
 * party hears it mixed with the rep's mic, while the rep hears it locally.
 *
 * This file is the Dependency-Inversion seam: it imports NOTHING (no Twilio, no
 * native module, no expo). Every caller (hook, store, UI) depends only on this
 * interface, so the concrete engine — a native iOS AVAudioEngine device today, a
 * server-side Twilio Media-Streams injector tomorrow — is fully interchangeable
 * (Open-Closed) and selected in ONE place (createAudioInjector).
 *
 * STATUS: Phase 0 ships this contract + a NullAudioInjector behind a default-OFF
 * flag. The native engine (NativeAudioInjector) lands in a later phase. No
 * behavior changes for users until the flag is enabled and the engine exists.
 */

/** What we're injecting. `kind` is for telemetry; `isVideo` tells the injector
 *  the `uri` is a video container whose audio track must be extracted before it
 *  can be played into the call. ANY audio playing in the app can be the source:
 *  posts, reels, video, beats, the Record Pro track editor, chat media, etc. */
export type InjectSource = {
  kind: 'post' | 'reel' | 'video' | 'beat' | 'track' | 'message';
  uri: string;
  title?: string;
  postId?: string;
  /** true when `uri` is a video file (reel / video post / video message). */
  isVideo?: boolean;
  loop?: boolean;
  durationMs?: number;
};

/** Engine lifecycle state (mirrors a media player). */
export type InjectState =
  | 'idle'
  | 'preparing'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error';

/** Why an injection started or (more importantly) ended/failed — every code
 *  path lands one of these so no failure is ever silent (telemetry queries it). */
export type InjectReason =
  | 'user_started'
  | 'user_stopped'
  | 'call_ended'
  | 'track_ended'
  | 'interrupted'
  | 'no_active_call'
  | 'not_connected'
  | 'prepare_failed'
  | 'engine_error'
  | 'not_supported'
  | 'engine_unavailable';

/** Result of an imperative action. Adapters NEVER throw to callers — they
 *  resolve `{ ok: false, reason }` so the UI can react without try/catch. */
export interface InjectResult {
  ok: boolean;
  reason?: InjectReason;
}

/** A full immutable snapshot of the injector, pushed to subscribers + the store. */
export interface InjectionSnapshot {
  state: InjectState;
  source: InjectSource | null;
  positionMs: number;
  durationMs: number;
  /** Output gain toward the remote party, 0..1. */
  volume: number;
  /** Whether the rep hears the track locally (monitor). */
  monitor: boolean;
  /** Set whenever state becomes 'stopped' or 'error'. */
  reason: InjectReason | null;
}

/** The neutral starting snapshot (nothing playing). */
export const IDLE_SNAPSHOT: InjectionSnapshot = {
  state: 'idle',
  source: null,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  monitor: true,
  reason: null,
};

/**
 * The engine contract. Implementations: NullAudioInjector (no-op, flag OFF),
 * NativeAudioInjector (custom TVOAudioDevice), ServerAudioInjector (Media
 * Streams, deferred). All resolve InjectResult, never throw.
 */
export interface AudioInjector {
  /** Cheap synchronous capability check (e.g. native module present + iOS). */
  isSupported(): boolean;
  /** Begin injecting `source` into the (already connected) call. */
  start(source: InjectSource): Promise<InjectResult>;
  /** Stop injecting. Idempotent — safe to call when nothing is playing. */
  stop(reason: InjectReason): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Remote-facing gain, 0..1. */
  setVolume(volume: number): void;
  /** Toggle the rep's local monitor. */
  setMonitor(on: boolean): void;
  /** Current snapshot (synchronous, cached). */
  getState(): InjectionSnapshot;
  /** Subscribe to snapshot changes; returns an unsubscribe fn. */
  subscribe(listener: (snapshot: InjectionSnapshot) => void): () => void;
}

/**
 * Call playback session, JS side contracts. Imports nothing from React Native
 * so the controller and the mix spec builder stay unit testable under node.
 *
 * The rule these types encode (Sep 15 2026): during a call the transport
 * (play, pause, seek) always works and decides what is heard; TRANSMIT is only
 * a gate on whether the far party hears the same thing. One owner at a time,
 * up to STEM_COUNT aligned stems, all played by the native engine.
 */

/** Mirrors kAttoStemCount in AttoCallPlaybackSession.h. */
export const STEM_COUNT = 6;

/** Which UI surface owns the session. Telemetry and policy key. */
export type PlaybackSurface =
  | 'feed_audio'
  | 'chat_audio'
  | 'timeline'
  | 'take'
  | 'feed_video'
  | 'reel'
  | 'reels_viewer'
  | 'chat_video'
  | 'compose_preview'
  | 'ad';

/** One clip inside a stem, in FRAMES at the canonical 48 kHz. `path` may be a
 *  remote or local uri; the controller resolves it to a canonical file. */
export interface StemClip {
  path: string;
  startFrame: number;
  frameCount: number;
  positionFrame: number;
  gain: number;
}

/** A rendered stem: all its clips summed into one file of `totalFrames`. */
export interface StemSource {
  totalFrames: number;
  clips: StemClip[];
  /** Live gain applied by the engine (lane fader, mute, solo). */
  gain: number;
}

export type PlaybackSource =
  | {
      type: 'file';
      kind: 'post' | 'reel' | 'video' | 'message' | 'ad' | 'preview' | 'track';
      uri: string;
      isVideo?: boolean;
      loop?: boolean;
      title?: string;
      postId?: string;
    }
  | {
      type: 'stems';
      kind: 'timeline' | 'take';
      stems: StemSource[];
      /** Stable identity of the stem set (hash of the specs). */
      key: string;
      loop?: boolean;
      title?: string;
    };

export type PlaybackStatus =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

export type PlaybackReason =
  | 'claim'
  | 'play'
  | 'pause'
  | 'seek'
  | 'stop'
  | 'release'
  | 'superseded'
  | 'track_ended'
  | 'device_idle'
  | 'call_ended'
  | 'engine_mode_off'
  | 'account_switch'
  | 'prepare_failed'
  | 'prepare_cancelled'
  | 'engine_error'
  | 'not_supported'
  | 'no_engine_mode';

/** The per call engine mode decision, latched once at connect. */
export interface EngineMode {
  /** Play through the native session at all (audio surfaces). */
  engine: boolean;
  /** Timeline editor stems through the session (sub flag). */
  timeline: boolean;
  /** Video surfaces through the session (sub flag). */
  video: boolean;
}

export const ENGINE_MODE_OFF: EngineMode = {
  engine: false,
  timeline: false,
  video: false,
};

export interface PlaybackSnapshot {
  engineMode: boolean;
  /** Sub flags of the latched mode (false whenever engineMode is false). */
  engineTimeline: boolean;
  engineVideo: boolean;
  ownerId: string | null;
  surface: PlaybackSurface | null;
  source: PlaybackSource | null;
  status: PlaybackStatus;
  positionMs: number;
  durationMs: number;
  transmit: boolean;
  monitor: boolean;
  loopCount: number;
  levelRms: number;
  generation: number;
  /** Wall clock ms of the last native tick, for interpolation. */
  tickAt: number;
  reason: PlaybackReason | null;
}

export const IDLE_PLAYBACK: PlaybackSnapshot = {
  engineMode: false,
  engineTimeline: false,
  engineVideo: false,
  ownerId: null,
  surface: null,
  source: null,
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  transmit: false,
  monitor: true,
  loopCount: 0,
  levelRms: 0,
  generation: 0,
  tickAt: 0,
  reason: null,
};

export interface PlaybackResult {
  ok: boolean;
  reason?: PlaybackReason;
}

/** Native status dictionary (AttoCallPlaybackSession.status). */
export interface NativeSessionStatus {
  state: 'idle' | 'loaded' | 'playing' | 'paused' | 'ended';
  positionMs: number;
  durationMs: number;
  transmit: boolean;
  monitor: boolean;
  loop: boolean;
  loopCount: number;
  levelRms: number;
  generation: number;
  buildSeq?: number;
  reason?: string | null;
}

/** The native bridge surface the controller drives (AttoAudioInjection). */
export interface NativeSessionModule {
  sessionLoad(
    stems: { path: string; gain: number }[],
    loop: boolean
  ): Promise<NativeSessionStatus>;
  sessionSetStem(index: number, path: string): Promise<NativeSessionStatus>;
  sessionSetStemGain(index: number, gain: number): Promise<boolean>;
  sessionPlay(fromMs: number): Promise<NativeSessionStatus>;
  sessionPause(): Promise<NativeSessionStatus>;
  sessionSeek(ms: number): Promise<NativeSessionStatus>;
  sessionStop(reason: string): Promise<NativeSessionStatus>;
  sessionSetTransmit(on: boolean): Promise<boolean>;
  sessionSetMonitor(on: boolean): Promise<boolean>;
  sessionGetStatus(): Promise<NativeSessionStatus>;
}

/** Result of turning a source into engine ready stem files. */
export interface PreparedStems {
  stems: { path: string; gain: number }[];
  durationMs: number;
  cacheHit: boolean;
  downloadMs: number;
  encodeMs: number;
  renderMs: number;
  bytes: number;
}

/** Cancellation handle shared by a prepare and the controller. */
export interface PrepareToken {
  cancelled: boolean;
  jobIds: string[];
}

/** The offline preparation service the controller depends on. */
export interface PlaybackPreparer {
  prepare(source: PlaybackSource, token: PrepareToken): Promise<PreparedStems>;
  /** Render one replacement stem (structural timeline edit). */
  prepareStem(
    stem: StemSource,
    token: PrepareToken
  ): Promise<{ path: string; renderMs: number; cacheHit: boolean }>;
  cancel(token: PrepareToken): void;
}

/** Telemetry sink the controller writes to (analytics + breadcrumbs). */
export interface PlaybackTelemetry {
  capture(event: string, props: Record<string, unknown>): void;
  breadcrumb(message: string, data?: Record<string, unknown>): void;
  context(snapshot: PlaybackSnapshot): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

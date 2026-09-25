/**
 * CallPlaybackController: the single JS owner of the native call playback
 * session. One surface owns it at a time; the transport always works; the
 * transmit gate is a separate switch that starts OFF on every call.
 *
 * Pure TypeScript with injected dependencies (native bridge, preparer,
 * telemetry, clock) so the state machine is unit tested under node with fakes
 * (see __tests__/CallPlaybackController.test.ts). The React Native wiring
 * lives in controllerInstance.ts.
 *
 * Generation rule (inherited from NativeAudioInjector): every claim, stop and
 * mode change bumps `generation`; every async step re checks it and gives up
 * with `superseded` when it moved. That is what makes a tap during a seconds
 * long prepare cancel cleanly instead of scheduling audio the user left behind.
 */

import {
  ENGINE_MODE_OFF,
  IDLE_PLAYBACK,
  type EngineMode,
  type NativeSessionModule,
  type NativeSessionStatus,
  type PlaybackPreparer,
  type PlaybackReason,
  type PlaybackResult,
  type PlaybackSnapshot,
  type PlaybackSource,
  type PlaybackSurface,
  type PlaybackTelemetry,
  type FramesToCallReader,
  type PrepareToken,
  type StemSource,
} from './types';

export const PLAYBACK_EVENTS = {
  CLAIM: 'call_playback_claim',
  TRANSPORT: 'call_playback_transport',
  TRANSMIT_TOGGLED: 'call_transmit_toggled',
  STEM_RENDER: 'call_playback_stem_render',
  RESCHEDULE: 'call_playback_reschedule',
  ENGINE_MODE: 'call_playback_engine_mode',
  /** Every native session event that carries a reason or changes the state. */
  NATIVE_EVENT: 'call_playback_native_event',
  /** One per transmission: how much audio actually left for the far party. */
  TRANSMIT_SUMMARY: 'call_transmit_summary',
} as const;

/** Native event reasons that mean "the engine rescheduled itself". */
const RESCHEDULE_REASONS = new Set([
  'engine_rebuild',
  'start_hook_render',
  'start_hook_capture',
  'tick_self_heal',
  'stem_swap',
]);

export interface ControllerDeps {
  native: NativeSessionModule | null;
  preparer: PlaybackPreparer;
  telemetry: PlaybackTelemetry;
  /** Frames handed to the call so far; absent in tests and off iOS. */
  framesToCall?: FramesToCallReader;
  now?: () => number;
}

type Listener = (snapshot: PlaybackSnapshot) => void;

export class CallPlaybackController {
  private snapshot: PlaybackSnapshot = { ...IDLE_PLAYBACK };
  private mode: EngineMode = ENGINE_MODE_OFF;
  private generation = 0;
  private prepareToken: PrepareToken | null = null;
  /** A play() that arrived while the claim was still preparing. */
  private pendingPlay: { fromMs: number } | null = null;
  private listeners = new Set<Listener>();
  private callSid: string | null = null;
  /** Open only while the gate is open, to measure what reached the far party. */
  private gateWindow: {
    at: number;
    frames: number | null;
    playingMs: number;
    playingSince: number | null;
  } | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  // ── Snapshot plumbing ─────────────────────────────────────────────────

  getSnapshot(): PlaybackSnapshot {
    return this.snapshot;
  }

  getMode(): EngineMode {
    return this.mode;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(patch: Partial<PlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.deps.telemetry.context(this.snapshot);
    for (const l of this.listeners) l(this.snapshot);
  }

  private isOwner(ownerId: string): boolean {
    return this.snapshot.ownerId === ownerId && this.snapshot.status !== 'idle';
  }

  private baseProps(): Record<string, unknown> {
    return {
      call_sid: this.callSid,
      surface: this.snapshot.surface,
      owner_id: this.snapshot.ownerId,
      source_kind: this.snapshot.source?.kind ?? null,
      from_state: this.snapshot.status,
      position_ms: Math.round(this.snapshot.positionMs),
      transmit: this.snapshot.transmit,
      generation: this.generation,
    };
  }

  // ── Engine mode (latched per call by the host) ─────────────────────────

  /**
   * Set once per call at connect (and again only when the account switches).
   * Turning the mode off with something loaded stops it: a mode flip mid
   * session would otherwise leave an engine session behind an expo player.
   */
  async setEngineMode(
    mode: EngineMode,
    callSid: string | null,
    gates: Record<string, unknown>
  ): Promise<void> {
    this.callSid = callSid;
    const previous = this.mode;
    this.mode = mode.engine ? mode : ENGINE_MODE_OFF;
    this.deps.telemetry.capture(PLAYBACK_EVENTS.ENGINE_MODE, {
      call_sid: callSid,
      engine_mode: this.mode.engine,
      engine_timeline: this.mode.timeline,
      engine_video: this.mode.video,
      ...gates,
    });
    if (previous.engine && !this.mode.engine) {
      await this.stop(null, 'engine_mode_off');
    }
    this.emit({
      engineMode: this.mode.engine,
      engineTimeline: this.mode.timeline,
      engineVideo: this.mode.video,
    });
    if (this.mode.engine) {
      await this.reconcile();
    }
  }

  /**
   * A JS reload during a call can leave a native session playing with no JS
   * owner. Stop it so the next claim starts clean.
   */
  private async reconcile(): Promise<void> {
    const native = this.deps.native;
    if (!native) return;
    try {
      const status = await native.sessionGetStatus();
      if (status.state !== 'idle' && this.snapshot.status === 'idle') {
        this.deps.telemetry.warn('call_playback_ghost_session', {
          native_state: status.state,
        });
        await native.sessionStop('ghost');
      }
      // A fresh call always starts with the gate closed.
      await native.sessionSetTransmit(false);
    } catch {
      // Diagnostics only; a failure here must never block the call UI.
    }
  }

  // ── Claim / prepare ────────────────────────────────────────────────────

  async claim(
    ownerId: string,
    surface: PlaybackSurface,
    source: PlaybackSource
  ): Promise<PlaybackResult> {
    if (!this.mode.engine) return { ok: false, reason: 'no_engine_mode' };
    const native = this.deps.native;
    if (!native) return { ok: false, reason: 'not_supported' };

    const gen = ++this.generation;
    const t0 = this.now();
    const previousOwner = this.snapshot.ownerId;
    const previousStatus = this.snapshot.status;
    if (this.prepareToken) {
      this.deps.preparer.cancel(this.prepareToken);
      this.prepareToken = null;
    }
    if (previousOwner && previousOwner !== ownerId && previousStatus !== 'idle') {
      this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSPORT, {
        ...this.baseProps(),
        action: 'superseded',
        by_owner: ownerId,
        by_surface: surface,
      });
    }
    this.pendingPlay = null;
    this.deps.telemetry.breadcrumb('claim', { ownerId, surface, kind: source.kind });
    this.emit({
      ownerId,
      surface,
      source,
      status: 'preparing',
      positionMs: 0,
      durationMs: 0,
      loopCount: 0,
      reason: 'claim',
    });

    const token: PrepareToken = { cancelled: false, jobIds: [] };
    this.prepareToken = token;
    const land = (outcome: string, extra: Record<string, unknown> = {}) =>
      this.deps.telemetry.capture(PLAYBACK_EVENTS.CLAIM, {
        call_sid: this.callSid,
        surface,
        owner_id: ownerId,
        source_kind: source.kind,
        is_video: source.type === 'file' ? (source.isVideo ?? false) : false,
        stems: source.type === 'stems' ? source.stems.length : 1,
        loop: source.loop ?? false,
        outcome,
        prepare_ms: this.now() - t0,
        ...extra,
      });

    let prepared;
    try {
      prepared = await this.deps.preparer.prepare(source, token);
    } catch (error: unknown) {
      if (gen !== this.generation || token.cancelled) {
        land('prepare_cancelled');
        return { ok: false, reason: 'superseded' };
      }
      land('prepare_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit({ status: 'error', reason: 'prepare_failed' });
      return { ok: false, reason: 'prepare_failed' };
    }
    if (gen !== this.generation || token.cancelled) {
      land('superseded');
      return { ok: false, reason: 'superseded' };
    }

    let status: NativeSessionStatus;
    const tNative = this.now();
    try {
      status = await native.sessionLoad(prepared.stems, source.loop ?? false);
    } catch (error: unknown) {
      land('engine_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.emit({ status: 'error', reason: 'engine_error' });
      return { ok: false, reason: 'engine_error' };
    }
    if (gen !== this.generation) {
      // Superseded during the native load: the engine may hold a session the
      // user already left. The newer claim's own sessionLoad replaces it; only
      // stop when nothing newer is in flight.
      land('superseded');
      return { ok: false, reason: 'superseded' };
    }
    this.prepareToken = null;
    land('ready', {
      cache_hit: prepared.cacheHit,
      download_ms: prepared.downloadMs,
      encode_ms: prepared.encodeMs,
      render_ms: prepared.renderMs,
      bytes: prepared.bytes,
      duration_ms: prepared.durationMs,
      native_ack_ms: this.now() - tNative,
    });
    this.applyNativeStatus(status, 'claim');
    this.emit({ status: 'ready', reason: 'claim' });

    if (this.pendingPlay) {
      const { fromMs } = this.pendingPlay;
      this.pendingPlay = null;
      return this.play(ownerId, fromMs);
    }
    return { ok: true };
  }

  // ── Transport ──────────────────────────────────────────────────────────

  private async transport(
    ownerId: string | null,
    action: 'play' | 'pause' | 'seek' | 'stop',
    call: (native: NativeSessionModule) => Promise<NativeSessionStatus>,
    reason: PlaybackReason,
    extra: Record<string, unknown> = {}
  ): Promise<PlaybackResult> {
    const native = this.deps.native;
    if (!native) return { ok: false, reason: 'not_supported' };
    if (ownerId !== null && !this.isOwner(ownerId))
      return { ok: false, reason: 'superseded' };
    const props = { ...this.baseProps(), action, ...extra };
    this.deps.telemetry.breadcrumb(action, { ownerId, ...extra });
    const t0 = this.now();
    try {
      const status = await call(native);
      this.applyNativeStatus(status, reason);
      this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSPORT, {
        ...props,
        outcome: 'ok',
        native_ack_ms: this.now() - t0,
        to_state: this.snapshot.status,
      });
      return { ok: true };
    } catch (error: unknown) {
      this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSPORT, {
        ...props,
        outcome: 'engine_error',
        native_ack_ms: this.now() - t0,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: 'engine_error' };
    }
  }

  /** fromMs < 0 resumes (paused position, or 0 after the end). */
  async play(ownerId: string, fromMs: number = -1): Promise<PlaybackResult> {
    if (this.snapshot.ownerId === ownerId && this.snapshot.status === 'preparing') {
      // The user tapped play before the prepare finished: honour it when ready.
      this.pendingPlay = { fromMs };
      return { ok: true };
    }
    return this.transport(ownerId, 'play', (n) => n.sessionPlay(fromMs), 'play', {
      from_ms: fromMs,
    });
  }

  async pause(ownerId: string): Promise<PlaybackResult> {
    if (this.snapshot.ownerId === ownerId && this.snapshot.status === 'preparing') {
      this.pendingPlay = null;
      return { ok: true };
    }
    return this.transport(ownerId, 'pause', (n) => n.sessionPause(), 'pause');
  }

  async toggle(ownerId: string): Promise<PlaybackResult> {
    if (!this.isOwner(ownerId)) return { ok: false, reason: 'superseded' };
    if (this.snapshot.status === 'playing') return this.pause(ownerId);
    if (this.snapshot.status === 'preparing') {
      this.pendingPlay = this.pendingPlay ? null : { fromMs: -1 };
      return { ok: true };
    }
    return this.play(ownerId);
  }

  async seek(ownerId: string, ms: number): Promise<PlaybackResult> {
    return this.transport(
      ownerId,
      'seek',
      (n) => n.sessionSeek(Math.max(0, ms)),
      'seek',
      {
        to_ms: Math.round(ms),
      }
    );
  }

  /**
   * Stop and unload. `ownerId` null = unconditional (call end, mode off).
   * Idempotent: stopping an idle session is a cheap no op.
   */
  async stop(ownerId: string | null, reason: PlaybackReason): Promise<PlaybackResult> {
    if (ownerId !== null && !this.isOwner(ownerId))
      return { ok: false, reason: 'superseded' };
    this.generation++;
    this.pendingPlay = null;
    if (this.prepareToken) {
      this.deps.preparer.cancel(this.prepareToken);
      this.prepareToken = null;
    }
    if (this.snapshot.status === 'idle') return { ok: true };
    const native = this.deps.native;
    if (!native) {
      this.emit({
        ...IDLE_PLAYBACK,
        engineMode: this.mode.engine,
        engineTimeline: this.mode.timeline,
        engineVideo: this.mode.video,
        transmit: this.snapshot.transmit,
        reason,
      });
      return { ok: true };
    }
    const props = { ...this.baseProps(), action: 'stop', reason };
    this.deps.telemetry.breadcrumb('stop', { ownerId, reason });
    const t0 = this.now();
    try {
      await native.sessionStop(reason);
      this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSPORT, {
        ...props,
        outcome: 'ok',
        native_ack_ms: this.now() - t0,
      });
    } catch (error: unknown) {
      this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSPORT, {
        ...props,
        outcome: 'engine_error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    this.emit({
      ownerId: null,
      surface: null,
      source: null,
      status: 'idle',
      positionMs: 0,
      durationMs: 0,
      loopCount: 0,
      levelRms: 0,
      reason,
    });
    return { ok: true };
  }

  /** A surface going away releases what it owns; other owners are untouched. */
  async release(ownerId: string): Promise<void> {
    if (!this.isOwner(ownerId)) return;
    await this.stop(ownerId, 'release');
  }

  // ── Stems (timeline) ───────────────────────────────────────────────────

  async setStemGain(ownerId: string, index: number, gain: number): Promise<void> {
    if (!this.isOwner(ownerId) || !this.deps.native) return;
    try {
      await this.deps.native.sessionSetStemGain(index, gain);
    } catch {
      // A gain write failing is not worth a toast; the next write retries.
    }
  }

  /** Re render one stem after a structural edit and swap it in place. */
  async replaceStem(
    ownerId: string,
    index: number,
    stem: StemSource
  ): Promise<PlaybackResult> {
    if (!this.isOwner(ownerId)) return { ok: false, reason: 'superseded' };
    const native = this.deps.native;
    if (!native) return { ok: false, reason: 'not_supported' };
    const gen = this.generation;
    const token: PrepareToken = { cancelled: false, jobIds: [] };
    const t0 = this.now();
    try {
      const rendered = await this.deps.preparer.prepareStem(stem, token);
      if (gen !== this.generation || !this.isOwner(ownerId))
        return { ok: false, reason: 'superseded' };
      const status = await native.sessionSetStem(index, rendered.path);
      await native.sessionSetStemGain(index, stem.gain);
      this.applyNativeStatus(status, 'claim');
      this.deps.telemetry.capture(PLAYBACK_EVENTS.STEM_RENDER, {
        ...this.baseProps(),
        stem_index: index,
        clips: stem.clips.length,
        total_ms: Math.round((stem.totalFrames / 48000) * 1000),
        render_ms: rendered.renderMs,
        cache_hit: rendered.cacheHit,
        swap_ms: this.now() - t0,
        cause: 'structure',
        outcome: 'ok',
      });
      return { ok: true };
    } catch (error: unknown) {
      this.deps.telemetry.capture(PLAYBACK_EVENTS.STEM_RENDER, {
        ...this.baseProps(),
        stem_index: index,
        clips: stem.clips.length,
        cause: 'structure',
        outcome: token.cancelled ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, reason: 'prepare_failed' };
    }
  }

  // ── Gates ──────────────────────────────────────────────────────────────

  /**
   * Open or close the gate to the far party. It never starts, stops, pauses or
   * resumes anything: what you hear is the transport's business, and whether
   * they hear the same thing is this switch's. Every combination is valid,
   * including paused with the gate open.
   */
  async setTransmit(
    on: boolean,
    context: { surface?: string | null; micMuted?: boolean } = {}
  ): Promise<void> {
    const wasPlaying = this.snapshot.status === 'playing';
    this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSMIT_TOGGLED, {
      ...this.baseProps(),
      on,
      was_playing: wasPlaying,
      mic_muted: context.micMuted ?? false,
      toggled_from: context.surface ?? null,
    });
    this.deps.telemetry.breadcrumb(on ? 'transmit_on' : 'transmit_off', { wasPlaying });
    this.emit({ transmit: on });
    if (on) this.openGateWindow();
    else void this.closeGateWindow(context.surface ?? null);
    const native = this.deps.native;
    if (!native || !this.mode.engine) return;
    try {
      await native.sessionSetTransmit(on);
    } catch {
      // The next status tick reports the true gate; the UI follows it.
    }
  }

  // ── What actually left for the far party ──────────────────────────────
  // The gate being open is not proof that anything was sent. These two read
  // the injector's frame counter at each edge and report the difference, so
  // "did they hear it" is one number per transmission instead of a
  // subtraction across diagnostic samples (the client, Sep 25 2026: "Larry
  // did hear it for a little bit, but not a lot").

  private openGateWindow(): void {
    this.gateWindow = {
      at: this.now(),
      frames: null,
      playingMs: 0,
      playingSince: this.snapshot.status === 'playing' ? this.now() : null,
    };
    void this.deps.framesToCall?.().then((frames) => {
      if (this.gateWindow && this.gateWindow.frames === null)
        this.gateWindow.frames = frames;
    });
  }

  private async closeGateWindow(surface: string | null): Promise<void> {
    const open = this.gateWindow;
    this.gateWindow = null;
    if (!open) return;
    this.accrueGatePlaying();
    const after = (await this.deps.framesToCall?.()) ?? null;
    const delivered =
      after !== null && open.frames !== null ? Math.max(0, after - open.frames) : null;
    const openMs = this.now() - open.at;
    this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSMIT_SUMMARY, {
      ...this.baseProps(),
      gate_open_ms: Math.round(openMs),
      // Time the transport was actually running while the gate was open: the
      // only span that should have produced audio for them.
      playing_while_open_ms: Math.round(open.playingMs),
      frames_to_call: delivered,
      frames_before: open.frames,
      frames_after: after,
      closed_from: surface,
    });
  }

  /** Fold the current run of playback into the open gate window. */
  private accrueGatePlaying(): void {
    const open = this.gateWindow;
    if (!open || open.playingSince === null) return;
    open.playingMs += this.now() - open.playingSince;
    open.playingSince = null;
  }

  async setMonitor(on: boolean): Promise<void> {
    this.emit({ monitor: on });
    const native = this.deps.native;
    if (!native || !this.mode.engine) return;
    try {
      await native.sessionSetMonitor(on);
    } catch {
      // best effort
    }
  }

  // ── Native events ──────────────────────────────────────────────────────

  private applyNativeStatus(
    status: NativeSessionStatus,
    reason: PlaybackReason | null
  ): void {
    const map: Record<NativeSessionStatus['state'], PlaybackSnapshot['status']> = {
      idle: 'idle',
      loaded: 'ready',
      playing: 'playing',
      paused: 'paused',
      ended: 'ended',
    };
    const next = map[status.state] ?? this.snapshot.status;
    this.trackGatePlaying(next);
    this.emit({
      status: next,
      positionMs: status.positionMs,
      durationMs: status.durationMs,
      transmit: status.transmit,
      monitor: status.monitor,
      loopCount: status.loopCount,
      levelRms: status.levelRms,
      generation: status.generation,
      tickAt: this.now(),
      reason,
    });
  }

  /** Keep the open gate window's playing time honest across every transition. */
  private trackGatePlaying(next: PlaybackSnapshot['status']): void {
    const open = this.gateWindow;
    if (!open) return;
    if (next === 'playing') {
      if (open.playingSince === null) open.playingSince = this.now();
      return;
    }
    this.accrueGatePlaying();
  }

  /** Fed by the native event emitter (AttoCallPlaybackEvent). */
  handleNativeEvent(event: NativeSessionStatus & { reason?: string | null }): void {
    // While a claim prepares, the native session is idle or belongs to the
    // previous owner: its ticks must not overwrite the preparing state.
    if (this.snapshot.status === 'preparing') return;
    if (this.snapshot.status === 'idle' && event.state === 'idle') return;
    const reason = event.reason ?? null;
    if (reason || event.state !== this.snapshot.status) {
      this.deps.telemetry.capture(PLAYBACK_EVENTS.NATIVE_EVENT, {
        ...this.baseProps(),
        native_state: event.state,
        native_reason: reason,
        from_status: this.snapshot.status,
        native_position_ms: Math.round(event.positionMs),
        native_duration_ms: Math.round(event.durationMs ?? 0),
        loop_count: event.loopCount ?? null,
        level_rms: event.levelRms ?? null,
        build_seq: event.buildSeq ?? null,
        generation: event.generation ?? null,
      });
    }
    if (reason && RESCHEDULE_REASONS.has(reason)) {
      this.deps.telemetry.capture(PLAYBACK_EVENTS.RESCHEDULE, {
        ...this.baseProps(),
        native_reason: reason,
        build_seq: event.buildSeq ?? null,
        native_position_ms: Math.round(event.positionMs),
      });
    }
    if (reason === 'track_ended' || reason === 'device_idle') {
      this.deps.telemetry.capture(PLAYBACK_EVENTS.TRANSPORT, {
        ...this.baseProps(),
        action: reason === 'track_ended' ? 'ended' : 'device_idle',
        outcome: 'ok',
        loop_count: event.loopCount,
      });
    }
    const mapped: PlaybackReason | null =
      reason === 'track_ended'
        ? 'track_ended'
        : reason === 'device_idle'
          ? 'device_idle'
          : null;
    this.applyNativeStatus(event, mapped ?? this.snapshot.reason);
  }

  // ── Call lifecycle ─────────────────────────────────────────────────────

  /** The call ended (sid → null): unload, close the gate, drop the mode. */
  async resetForCallEnd(): Promise<void> {
    await this.stop(null, 'call_ended');
    const native = this.deps.native;
    if (native && this.mode.engine) {
      try {
        await native.sessionSetTransmit(false);
      } catch {
        // best effort
      }
    }
    this.mode = ENGINE_MODE_OFF;
    this.callSid = null;
    this.emit({ ...IDLE_PLAYBACK });
  }
}

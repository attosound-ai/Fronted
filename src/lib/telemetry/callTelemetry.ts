/**
 * Call-scoped telemetry pipeline.
 *
 * Lifecycle:
 *   startCallTelemetry()  → snapshot baseline → tick every 10 s → snapshot
 *                           on app-state transitions → pause PostHog session
 *                           replay (it allocates ~14 MB / min during a call,
 *                           the single biggest known contributor to the
 *                           WatchdogTermination we are trying to eliminate).
 *   emitMarker(name)      → ad-hoc snapshot tagged with a reason
 *                           ('pre_speaker_toggle', 'post_speaker_toggle', etc.)
 *   endCallTelemetry()    → final snapshot → resume session replay → cleanup.
 *
 * Sinks: PostHog (event `messages.CALL.TELEMETRY_TICK`) for SQL-able history,
 * and Sentry breadcrumb + context so the next watchdog event arrives at
 * Sentry with the last ~30 snapshots attached.
 */

import { AppState, type AppStateStatus } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import * as Sentry from '@sentry/react-native';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

import { useCallStore } from '@/stores/callStore';

import { mmkvStorage } from '@/lib/storage/mmkv';

import { telemetryCounters } from './counters';
import { acquireJsLagMonitor, releaseJsLagMonitor, getJsLagStats } from './jsLag';
import {
  getDeviceSnapshot,
  getCallAudioState,
  captureCallAudioSnapshot,
  resolveRouteChangeReason,
  routeChangeAgeMs,
  formatRouteChangeRing,
  type DeviceSnapshot,
} from './deviceSnapshot';

const TICK_MS = 10_000;
// Fast memory heartbeat cadence. The 10 s full tick misses a memory ramp that
// goes 200MB->1.4GB in ~40 s; 2 s catches its shape and pins the moment the
// in-call editor allocation runs away (David, Jul 22 OOM/watchdog investigation).
const MEM_HEARTBEAT_MS = 2_000;
// Audio-session ownership watcher. The hijack that dropped calls (a video player
// taking the Playback category, killing the mic) happens in well under a second,
// so the 10s tick could only catch it by luck. 750ms + emit-on-change-only makes
// every ownership transition visible without spamming events.
const SESSION_WATCH_MS = 750;
const MB = 1024 * 1024;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let memHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
let sessionWatchInterval: ReturnType<typeof setInterval> | null = null;
// Last observed audio-session identity, for change detection.
let lastSessionKey: string | null = null;
// Last observed value of the native monotonic route-change counter. A route
// change that does NOT alter the session identity (RouteConfigurationChange on
// the same ports is the canonical case, and "iOS reconfigured the route
// underneath a live session" is precisely the hypothesis class we are hunting)
// used to produce no event at all: only the 10 s tick's routeChangeCount ever
// revealed that it had happened, and never why. Tracking it here lets the watcher
// emit on a count advance even when the key is unchanged.
let lastRouteChangeCount: number | null = null;
let appStateSub: { remove(): void } | null = null;
let callStartedAt: number | null = null;
let isActive = false;
let didPauseReplay = false;
// The most recent in-call operation marker, stamped onto every memory heartbeat
// so each memory sample says WHAT the app was doing (editor mount, waveform load,
// lane players, capture, inject, video). This is what attributes the GB.
let lastMarkerName: string | null = null;

// ── Route-transition ring ────────────────────────────────────────────────────
// The last few audio-session transitions of the CURRENT call, kept in memory so a
// user-reported audio problem can be stamped with what the route was doing just
// before the human noticed. Every timestamp in the AirPods investigation had to be
// inferred from the client's remedial actions; this turns the inference into a
// fact. Bounded, and cleared when a call STARTS rather than when it ends, so a
// report tapped moments after hangup still carries the call that just failed while
// still being impossible to confuse with the next call.
const ROUTE_HISTORY_MAX = 5;

interface RouteTransition {
  /** Seconds into the call, so it lines up with call_duration_sec everywhere else. */
  atCallSec: number;
  /** Compact rendering of the session identity; null on the baseline observation. */
  from: string | null;
  to: string;
  /** iOS route-change reason, when the native observer has one. */
  reason: string | null;
  micLost: boolean;
}

let routeHistory: RouteTransition[] = [];

/** e.g. "PlayAndRecord/VoiceChat in:BluetoothHFP out:BluetoothHFP @24000". */
function describeSession(
  category: string,
  mode: string,
  inPort: string,
  outPort: string,
  rate: number | string
): string {
  const short = (v: string): string => v.replace('AVAudioSessionCategory', '');
  return `${short(category)}/${mode} in:${inPort} out:${outPort} @${rate}`;
}

/** One-line rendering for the problem report: "12s A -> B (Override) MIC_LOST". */
function formatRouteTransition(t: RouteTransition): string {
  const move = t.from ? `${t.from} -> ${t.to}` : `baseline ${t.to}`;
  const why = t.reason ? ` (${t.reason})` : '';
  return `${t.atCallSec}s ${move}${why}${t.micLost ? ' MIC_LOST' : ''}`;
}

function callDurationSec(): number {
  return callStartedAt ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)) : 0;
}

interface TickPayload extends DeviceSnapshot {
  reason: string;
  callDurationSec: number;
  // Correlation: stitch every device snapshot to the call (and to backend +
  // Twilio events keyed by the same CallSid).
  call_sid: string | null;
  call_state: string | null;
  call_direction: string | null;
}

async function snapshotAndEmit(reason: string): Promise<TickPayload> {
  const snap = await getDeviceSnapshot();
  const ac = useCallStore.getState().activeCall;
  const payload: TickPayload = {
    ...snap,
    reason,
    callDurationSec: callStartedAt
      ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
      : 0,
    call_sid: ac?.callSid ?? null,
    call_state: ac?.state ?? null,
    call_direction: ac?.direction ?? null,
  };

  analytics.capture(ANALYTICS_EVENTS.CALL.TELEMETRY_TICK, payload);

  Sentry.addBreadcrumb({
    category: 'call.telemetry',
    level: 'info',
    type: 'info',
    message: `call_telemetry:${reason}`,
    data: payload,
  });

  // setContext overwrites; useful so the *most recent* runtime state lands
  // on whatever event Sentry sends next (incl. a crash report). Cast: the
  // Sentry types require an index-signature shape which TickPayload's named
  // keys don't satisfy structurally, but every key is a JSON-safe value.
  Sentry.setContext('runtime', payload as unknown as Record<string, unknown>);

  // Searchable tags for fast Sentry filtering.
  Sentry.setTag('memUsedPct', String(payload.memUsedPct ?? 'n/a'));
  Sentry.setTag('lowPowerMode', String(payload.lowPowerMode ?? 'n/a'));
  Sentry.setTag('networkType', payload.networkType ?? 'n/a');
  // Audio-path tags so a crash/watchdog DURING a call is filterable by whether
  // the CallKit audio session ever activated and the device was enabled — the
  // suspended-answer no-audio/black-screen path is the one most likely to also
  // trip a WatchdogTermination, and these land the audio state on that event.
  Sentry.setTag('audioActivated', String(payload.audioDidActivateAt != null));
  Sentry.setTag('audioEnabled', String(payload.audioTwilioEnabled ?? 'n/a'));
  Sentry.setTag('audioRoute', payload.audioLiveOutputPort ?? 'n/a');

  return payload;
}

/**
 * Begin telemetry for an in-progress call. Idempotent.
 * Pauses PostHog session replay (the biggest controllable RAM contributor)
 * and starts the JS event-loop lag monitor.
 */
export async function startCallTelemetry(reason: string = 'call_started'): Promise<void> {
  if (isActive) return;
  isActive = true;
  callStartedAt = Date.now();
  telemetryCounters.inc('activeCalls');
  acquireJsLagMonitor();

  // Defer the heavy work; let the call accept finish first.
  setTimeout(() => {
    try {
      // PostHog v4 exposes session-replay start/stop on the client. The
      // analytics service wraps that so this never reaches inside posthog
      // directly from feature code.
      analytics.pauseSessionReplay();
      didPauseReplay = true;
    } catch {
      didPauseReplay = false;
    }
  }, 0);

  await snapshotAndEmit(reason);

  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    void snapshotAndEmit('tick');
  }, TICK_MS);

  if (memHeartbeatInterval) clearInterval(memHeartbeatInterval);
  memHeartbeatInterval = setInterval(() => {
    void emitMemHeartbeat();
  }, MEM_HEARTBEAT_MS);

  // Watch audio-session ownership from the very start of the call window (this
  // runs from invite/outgoing, so it covers the cold-launch answer window where
  // the session was being stolen).
  // Mark "call in flight" so a silent process death is detectable next launch.
  writeInFlightMarker();

  lastSessionKey = null;
  lastRouteChangeCount = null;
  routeHistory = [];
  if (sessionWatchInterval) clearInterval(sessionWatchInterval);
  void watchAudioSession();
  sessionWatchInterval = setInterval(() => {
    void watchAudioSession();
  }, SESSION_WATCH_MS);

  appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    void snapshotAndEmit(`app_state_${s}`);
  });
}

/**
 * Lightweight memory heartbeat — memUsedMB + jsLag peek + the last operation
 * marker, every 2 s. Deliberately does NOT build the full device snapshot (that
 * itself allocates and would perturb the very memory we're measuring); one native
 * getUsedMemory read + a non-consuming jsLag peek only.
 */
async function emitMemHeartbeat(): Promise<void> {
  if (!isActive) return;
  try {
    const used = await DeviceInfo.getUsedMemory();
    const lag = getJsLagStats();
    analytics.capture(ANALYTICS_EVENTS.CALL.MEM_HEARTBEAT, {
      mem_used_mb: Number.isFinite(used) ? Math.round(used / MB) : null,
      js_lag_last_ms: lag.lastLagMs,
      js_lag_peak_ms: lag.peakLagMs,
      call_duration_sec: callStartedAt
        ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
        : 0,
      last_marker: lastMarkerName,
      call_sid: useCallStore.getState().activeCall?.callSid ?? null,
    });
    // Refresh the crash-surviving marker with the freshest context, so if the
    // process is killed right after this we know the memory and the operation it
    // died on — the two things that were missing from every silent death.
    writeInFlightMarker({
      lastMemMb: Number.isFinite(used) ? Math.round(used / MB) : null,
    });
  } catch {
    // Best-effort; a failed heartbeat must never affect the call.
  }
}

/**
 * MMKV key holding "a call is in progress right now". Written at call start,
 * cleared on a clean end. If it is still there on the NEXT launch, the app died
 * mid-call without reporting anything — the silent jetsam/watchdog kill that was
 * previously only inferable from missing events (only 8 of 20 answered calls ever
 * produced a disconnect reason).
 */
const IN_FLIGHT_CALL_KEY = 'atto_call_in_flight';

interface InFlightCall {
  callSid: string | null;
  startedAt: number;
  lastState: string | null;
  lastMarker: string | null;
  lastMemMb: number | null;
}

function writeInFlightMarker(extra?: Partial<InFlightCall>): void {
  try {
    const ac = useCallStore.getState().activeCall;
    const payload: InFlightCall = {
      callSid: ac?.callSid ?? null,
      startedAt: callStartedAt ?? Date.now(),
      lastState: ac?.state ?? null,
      lastMarker: lastMarkerName,
      lastMemMb: null,
      ...extra,
    };
    mmkvStorage.setString(IN_FLIGHT_CALL_KEY, JSON.stringify(payload));
  } catch {
    // Marker is best-effort.
  }
}

function clearInFlightMarker(): void {
  try {
    mmkvStorage.delete(IN_FLIGHT_CALL_KEY);
  } catch {
    // ignore
  }
}

/**
 * Call once at app launch. If a call was in flight when the process died, report it.
 * This is what turns a silent kill into a first-class, queryable event instead of an
 * absence we have to reason about.
 */
export function reportUnreportedCallDeath(): void {
  try {
    const raw = mmkvStorage.getString(IN_FLIGHT_CALL_KEY);
    if (!raw) return;
    clearInFlightMarker();
    const m = JSON.parse(raw) as InFlightCall;
    analytics.capture(ANALYTICS_EVENTS.CALL.DIED_UNREPORTED, {
      call_sid: m.callSid ?? null,
      // How far the call got before the process died.
      survived_sec: m.startedAt
        ? Math.max(0, Math.round((Date.now() - m.startedAt) / 1000))
        : null,
      last_state: m.lastState ?? null,
      // What the app was doing when it died (editor mount, capture, etc.).
      last_marker: m.lastMarker ?? null,
      last_mem_mb: m.lastMemMb ?? null,
    });
  } catch {
    // Corrupt marker — drop it so it can't loop.
    clearInFlightMarker();
  }
}

/**
 * Watch WHO owns the audio session during a call window and report every change.
 *
 * A call needs `PlayAndRecord` with a real input port. If anything flips the session
 * to `Playback` (output-only, no microphone) the call loses its mic and Twilio fails
 * the connection — that is exactly how video players dropped calls on VoIP-push cold
 * launches. Emits ONLY on change, with the from→to transition, so the timeline shows
 * precisely when ownership moved and what it moved to.
 */
async function watchAudioSession(): Promise<void> {
  if (!isActive) return;
  try {
    const s = await getCallAudioState();
    if (!s) return;
    // Mode and sample rate are part of the session identity. Without them a
    // 24000 → 48000 flip on an unchanged route emitted NOTHING, and a sample-rate
    // mismatch is exactly the class of defect we hunt on the playout side (it is
    // what the build-93 monster voice was). Same for mode: Twilio's VoiceChat
    // being replaced by anything else is a real event we were blind to.
    const key = `${s.liveCategory}|${s.liveMode}|${s.liveInputPort}|${s.liveOutputPort}|${s.liveSampleRate}`;
    // A route change with an UNCHANGED key is still a route change, and it is the
    // most interesting kind: it means iOS reconfigured the route underneath a live
    // session without moving category, mode, ports or rate. Gating purely on the
    // key made those invisible, so emit whenever the native counter has advanced
    // even if nothing else moved.
    const routeCount = s.routeChangeCount ?? null;
    const countAdvanced =
      routeCount != null &&
      lastRouteChangeCount != null &&
      routeCount > lastRouteChangeCount;
    if (key === lastSessionKey && !countAdvanced) return;
    const prev = lastSessionKey;
    lastSessionKey = key;
    const prevRouteCount = lastRouteChangeCount;
    lastRouteChangeCount = routeCount;
    const micLess = s.liveCategory !== 'AVAudioSessionCategoryPlayAndRecord';
    const micLost = micLess || !s.liveInputPort || s.liveInputPort === 'none';
    // The FIRST observation of every call used to be discarded unless it was
    // already broken. That threw away the one sample that describes the session at
    // the instant the audio device binds and latches its format, which is the exact
    // moment the AirPods incident hinged on. It is now always emitted, tagged
    // baseline=true with every from_* null, so the call always has a t0.
    const isBaseline = prev === null;
    const [prevCat, prevMode, prevIn, prevOut, prevRate] = (prev ?? '||||').split('|');

    const to = describeSession(
      s.liveCategory,
      s.liveMode,
      s.liveInputPort,
      s.liveOutputPort,
      s.liveSampleRate
    );
    const routeReason = resolveRouteChangeReason(s);
    routeHistory.push({
      atCallSec: callDurationSec(),
      from: isBaseline
        ? null
        : describeSession(prevCat, prevMode, prevIn, prevOut, prevRate),
      to,
      reason: routeReason,
      micLost,
    });
    if (routeHistory.length > ROUTE_HISTORY_MAX) routeHistory.shift();

    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_SESSION_CHANGED, {
      // true = first observation of this call, i.e. the state the audio device
      // bound to rather than a transition away from a known state.
      baseline: isBaseline,
      from_category: prevCat || null,
      to_category: s.liveCategory,
      from_mode: prevMode || null,
      to_mode: s.liveMode,
      from_input_port: prevIn || null,
      to_input_port: s.liveInputPort,
      from_output_port: prevOut || null,
      to_output_port: s.liveOutputPort,
      from_sample_rate: prevRate ? Number(prevRate) : null,
      // The decisive flag: true means the call currently has NO microphone.
      mic_lost: micLost,
      sample_rate: s.liveSampleRate ?? null,
      other_audio_playing: s.liveOtherAudioPlaying ?? null,
      // WHO moved the route. This is the field whose absence made every route
      // transition in the AirPods incident ambiguous. OldDeviceUnavailable = the
      // user removed them, NewDeviceAvailable / RouteConfigurationChange = iOS did
      // it, Override / CategoryChange = we did it. route_change_count rising by
      // more than 1 between two events means changes we never sampled, and
      // time_since_route_change_ms says whether this event IS that change or just
      // the poll that noticed it later.
      route_change_reason: routeReason,
      route_change_count: routeCount,
      // How many route changes happened since the last row we emitted. > 1 means
      // a burst that the 750 ms poll could only ever see the tail of, which is
      // why `recent_route_changes` below carries the individual ones.
      route_changes_since_last:
        routeCount != null && prevRouteCount != null ? routeCount - prevRouteCount : null,
      // true = the session identity did NOT move, only the counter did. This is
      // the "iOS reconfigured the route underneath us" case that used to emit
      // nothing at all.
      route_change_only: key === prev,
      // The individual changes behind the counter, from the native ring: reason,
      // timestamp and the ports each one moved AWAY from.
      recent_route_changes: formatRouteChangeRing(s),
      time_since_route_change_ms: routeChangeAgeMs(s),
      // Two of the three refuted hypotheses hinged on category options, and
      // neither side could settle it because we had never recorded them.
      category_options: s.liveCategoryOptions ?? null,
      output_volume: s.liveOutputVolume ?? null,
      last_marker: lastMarkerName,
      call_duration_sec: callDurationSec(),
      call_sid: useCallStore.getState().activeCall?.callSid ?? null,
      call_state: useCallStore.getState().activeCall?.state ?? null,
    });
  } catch {
    // Best-effort; never let telemetry affect a call.
  }
}

// ── Call-stats sampler (injected) ───────────────────────────────────────────
// The WebRTC byte counters live in useTwilioVoice (it owns the Call object), and
// useTwilioVoice already imports this module, so this module cannot import it back
// without a cycle. useTwilioVoice registers its sampler at module load instead.
//
// WHY reportAudioProblem needs it: the human-stamped "I cannot hear them" is the
// single most valuable row in this batch, and without the byte counters it still
// cannot say, AT THAT INSTANT, whether audio was arriving. Joining it to the
// nearest periodic stats sample means averaging a delta across the failure and the
// recovery. The report and the counters have to share a timestamp.
type CallStatsSampler = (reason: string) => Promise<Record<string, unknown> | null>;
let callStatsSampler: CallStatsSampler | null = null;

/** Register (or clear, with null) the WebRTC stats sampler. Called once at import. */
export function registerCallStatsSampler(sampler: CallStatsSampler | null): void {
  callStatsSampler = sampler;
}

/**
 * Symptom vocabulary for the in-call "something is wrong with the audio" control.
 * Kept deliberately small: the point is a one-tap timestamp, not a survey.
 */
export type AudioProblemSymptom =
  | 'cant_hear_them'
  | 'they_cant_hear_me'
  | 'echo'
  | 'other';

/**
 * Record that the human perceived an audio failure, right now, in a stated
 * direction.
 *
 * This is the only instrument that will ever capture echo (the app has zero echo
 * measurement of any kind) and the only one that settles direction per incident
 * without waiting for a phone call with the client. Every timestamp in the AirPods
 * investigation had to be inferred from remedial actions such as pulling the
 * AirPods out; one tap replaces all of that inference with a fact, stamped with the
 * full live audio state and the last few route transitions.
 *
 * Safe to call at any time: it never throws, and it still reports when call
 * telemetry is not active. A tap moments after hangup is exactly the realistic
 * case, so that report carries telemetry_active=false and the route history of
 * the call that just ended (the ring is cleared when the NEXT call starts).
 */
export async function reportAudioProblem(symptom: AudioProblemSymptom): Promise<void> {
  try {
    // One native read, and it already carries the route-change reason, the
    // category options bitmask and the output volume. Fired CONCURRENTLY with the
    // WebRTC stats read so both describe the same instant: this event exists to
    // pin the human's perception to a wall clock, and a snapshot assembled from
    // two moments 200 ms apart is a worse version of the periodic sampling it is
    // meant to replace.
    const [audio, stats] = await Promise.all([
      captureCallAudioSnapshot(),
      callStatsSampler
        ? callStatsSampler('audio_problem').catch(() => null)
        : Promise.resolve(null),
    ]);
    const ac = useCallStore.getState().activeCall;
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_PROBLEM_REPORTED, {
      symptom,
      ...audio,
      // THE direction discriminator, on the same row as the human's tap:
      // bytes_received climbing while they hear nothing is a LOCAL render
      // failure, bytes_received flat is a network or signalling failure. null
      // when there is no live call object to read stats from.
      ...(stats ?? {}),
      has_call_stats: stats != null,
      // Most recent last. Human-readable on purpose: this event is read by a
      // person triaging one report, not aggregated across thousands.
      recent_routes: routeHistory.map(formatRouteTransition),
      recent_routes_count: routeHistory.length,
      telemetry_active: isActive,
      last_marker: lastMarkerName,
      call_duration_sec: callDurationSec(),
      call_sid: ac?.callSid ?? null,
      call_state: ac?.state ?? null,
      call_direction: ac?.direction ?? null,
    });
    // Also stamp the moment onto the following memory heartbeats and emit a full
    // device snapshot under the same name, so the report is findable from either
    // the tick timeline or the heartbeat timeline. No-ops outside a call.
    await emitTelemetryMarker(`audio_problem_${symptom}`);
  } catch {
    // Best-effort; a failed report must never affect the call.
  }
}

/** Emit a tagged snapshot. No-op if telemetry is not active. */
export async function emitTelemetryMarker(
  name: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!isActive) return;
  // Stamp this operation onto subsequent memory heartbeats for attribution.
  lastMarkerName = name;
  const snap = await snapshotAndEmit(name);
  if (extra && Object.keys(extra).length > 0) {
    // Marker-specific extras go through a parallel capture so the main
    // tick payload stays a stable column-set.
    analytics.capture(`${ANALYTICS_EVENTS.CALL.TELEMETRY_MARKER}`, {
      marker: name,
      ...snap,
      ...extra,
    });
  }
}

/**
 * End telemetry. Final snapshot is emitted with the supplied reason so we
 * always have a baseline at the moment the call was torn down.
 */
export async function endCallTelemetry(reason: string = 'call_ended'): Promise<void> {
  if (!isActive) return;
  await snapshotAndEmit(reason);

  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  if (memHeartbeatInterval) {
    clearInterval(memHeartbeatInterval);
    memHeartbeatInterval = null;
  }
  if (sessionWatchInterval) {
    clearInterval(sessionWatchInterval);
    sessionWatchInterval = null;
  }
  // Clean end reached → the call did NOT die silently; drop the marker so the
  // next launch doesn't misreport it.
  clearInFlightMarker();
  lastSessionKey = null;
  lastRouteChangeCount = null;
  lastMarkerName = null;
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  releaseJsLagMonitor();
  telemetryCounters.dec('activeCalls');

  if (didPauseReplay) {
    try {
      analytics.resumeSessionReplay();
    } catch {
      // Resume is best-effort. The next session start will spin replay
      // back up regardless.
    }
    didPauseReplay = false;
  }

  callStartedAt = null;
  isActive = false;
}

export function isCallTelemetryActive(): boolean {
  return isActive;
}

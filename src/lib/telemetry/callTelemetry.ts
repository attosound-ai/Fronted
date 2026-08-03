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
let appStateSub: { remove(): void } | null = null;
let callStartedAt: number | null = null;
let isActive = false;
let didPauseReplay = false;
// The most recent in-call operation marker, stamped onto every memory heartbeat
// so each memory sample says WHAT the app was doing (editor mount, waveform load,
// lane players, capture, inject, video). This is what attributes the GB.
let lastMarkerName: string | null = null;

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
    const key = `${s.liveCategory}|${s.liveInputPort}|${s.liveOutputPort}`;
    if (key === lastSessionKey) return;
    const prev = lastSessionKey;
    lastSessionKey = key;
    // Skip the very first observation (nothing to compare against yet) unless it is
    // already a mic-less category, which is itself the failure we hunt.
    const micLess = s.liveCategory !== 'AVAudioSessionCategoryPlayAndRecord';
    if (prev === null && !micLess) return;
    const [prevCat, prevIn, prevOut] = (prev ?? '||').split('|');
    analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_SESSION_CHANGED, {
      from_category: prevCat || null,
      to_category: s.liveCategory,
      from_input_port: prevIn || null,
      to_input_port: s.liveInputPort,
      from_output_port: prevOut || null,
      to_output_port: s.liveOutputPort,
      // The decisive flag: true means the call currently has NO microphone.
      mic_lost: micLess || !s.liveInputPort || s.liveInputPort === 'none',
      sample_rate: s.liveSampleRate ?? null,
      other_audio_playing: s.liveOtherAudioPlaying ?? null,
      last_marker: lastMarkerName,
      call_duration_sec: callStartedAt
        ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
        : 0,
      call_sid: useCallStore.getState().activeCall?.callSid ?? null,
      call_state: useCallStore.getState().activeCall?.state ?? null,
    });
  } catch {
    // Best-effort; never let telemetry affect a call.
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

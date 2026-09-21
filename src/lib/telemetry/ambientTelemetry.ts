/**
 * Ambient runtime telemetry.
 *
 * Periodic device snapshot (every 30 s) while the app is active, independent
 * of whether a call is in progress. This is the always-on counterpart to
 * `callTelemetry` — when no call is active, this gives us memory / battery /
 * network / JS-lag history for every other crash and slowdown.
 *
 * Rules:
 *   - Pauses while a call is active (call telemetry already ticks at 10 s
 *     with the same schema; emitting both would just duplicate rows).
 *   - Pauses when the app is backgrounded (no signal worth capturing).
 *   - Emits a tick on each AppState transition (`active`/`background`/`inactive`)
 *     so we always have a snapshot bracketing the transition.
 *
 * Sinks:
 *   - PostHog: `runtime_telemetry_tick` with the full snapshot.
 *   - Sentry: breadcrumb + `setContext('runtime', …)` so the next event
 *     Sentry sends (incl. a crash report) is annotated with the most recent
 *     runtime state.
 */

import { AppState, type AppStateStatus } from 'react-native';
import * as Sentry from '@sentry/react-native';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

import { isCallTelemetryActive } from './callTelemetry';
import { getCallAudioState, getDeviceSnapshot } from './deviceSnapshot';
import { recentActionMarks, markAction } from './actionMarks';
import { memorySurgeMB, resetMemorySurge } from './memorySurge';
import {
  noteRenderAppStateChange,
  onRenderRecovered,
  onRenderStall,
  renderFrameCount,
  startRenderStallMonitor,
  stopRenderStallMonitor,
} from './uiStall';
import {
  acquireJsLagMonitor,
  getJsLagStats,
  noteAppStateChange,
  onJsStall,
  releaseJsLagMonitor,
} from './jsLag';
import { useCallStore } from '@/stores/callStore';

const TICK_MS = 30_000;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove(): void } | null = null;
let stallUnsub: (() => void) | null = null;
let callStoreUnsub: (() => void) | null = null;
let renderStallUnsub: (() => void) | null = null;
let renderRecoverUnsub: (() => void) | null = null;
let started = false;
let startedAt = 0;

/** Route the app is on, without importing the router into a telemetry module. */
let currentScreen: string | null = null;
export function noteScreen(pathname: string): void {
  currentScreen = pathname;
}

async function emitAmbientTick(reason: string): Promise<void> {
  // Don't double-emit while a call is active — callTelemetry covers that window.
  if (isCallTelemetryActive()) return;
  // Don't tick while backgrounded. Transitions still fire below via AppState.
  if (reason === 'tick' && AppState.currentState !== 'active') return;

  const snap = await getDeviceSnapshot();
  // Only steady 30 s ticks are compared. Launch and foreground transitions
  // grow memory legitimately (bundle, feed, images), so they just reset the
  // baseline; so does the first minute of a session.
  const uptimeSec = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const steady = reason === 'tick' && uptimeSec >= 60;
  if (!steady) resetMemorySurge();
  const surge = steady ? memorySurgeMB((snap as { memUsedMB?: number }).memUsedMB) : null;
  if (surge !== null) {
    analytics.capture(ANALYTICS_EVENTS.RUNTIME.MEMORY_SURGE, {
      growth_mb: surge,
      mem_used_mb: (snap as { memUsedMB?: number }).memUsedMB ?? null,
      window_sec: TICK_MS / 1000,
      screen: currentScreen,
      render_frames: renderFrameCount(),
      ...recentActionMarks(),
    });
  }
  const payload = {
    ...snap,
    reason,
    renderFrames: renderFrameCount(),
    sessionUptimeSec: startedAt
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : 0,
  };

  analytics.capture(ANALYTICS_EVENTS.RUNTIME.TELEMETRY_TICK, payload);

  Sentry.addBreadcrumb({
    category: 'runtime.telemetry',
    level: 'info',
    type: 'info',
    message: `runtime_telemetry:${reason}`,
    data: payload,
  });
  Sentry.setContext('runtime', payload as unknown as Record<string, unknown>);
  Sentry.setTag('memUsedPct', String(payload.memUsedPct ?? 'n/a'));
  Sentry.setTag('lowPowerMode', String(payload.lowPowerMode ?? 'n/a'));
  Sentry.setTag('networkType', payload.networkType ?? 'n/a');
}

/**
 * Begin ambient telemetry. Idempotent.
 * Safe to call once at app boot (e.g., from the analytics initializer).
 */
export function startAmbientTelemetry(): void {
  if (started) return;
  started = true;
  startedAt = Date.now();
  acquireJsLagMonitor();

  // Force the native RNDeviceInfo module to exist NOW. Its -init is what installs
  // the AVAudioSessionRouteChangeNotification observer that records WHY the audio
  // route changed, and RNDeviceInfo is a lazily-instantiated legacy module: until
  // JS touches it, no route change is counted. Reading the module happens to
  // instantiate it already, but relying on proxy semantics for a telemetry
  // guarantee is exactly how the route-reason blind spot survived this long, so
  // this makes it an explicit, ordered fact at boot instead. Result discarded; the
  // side effect is the point, and getCallAudioState never rejects.
  void getCallAudioState();

  // Baseline snapshot on boot.
  void emitAmbientTick('app_started');

  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    void emitAmbientTick('tick');
  }, TICK_MS);

  startRenderStallMonitor();
  renderStallUnsub = onRenderStall((stall) => {
    const call = useCallStore.getState().activeCall;
    const lag = getJsLagStats();
    analytics.capture(ANALYTICS_EVENTS.RUNTIME.UI_STALL, {
      gap_ms: stall.gapMs,
      first_report: stall.first,
      render_frames: stall.frames,
      // A render stall with a healthy JS thread points at the UI thread,
      // mounting, or a native transition that never finished.
      js_lag_ms: lag.lastLagMs,
      js_lag_peak_ms: lag.peakLagMs,
      screen: currentScreen,
      in_call: call != null,
      ...recentActionMarks(),
    });
    Sentry.captureMessage(
      `render stalled ${stall.gapMs} ms on ${currentScreen ?? 'unknown'}`,
      {
        level: 'warning',
        tags: { stall_kind: 'render', screen: currentScreen ?? 'unknown' },
      }
    );
  });
  renderRecoverUnsub = onRenderRecovered((totalMs) => {
    analytics.capture(ANALYTICS_EVENTS.RUNTIME.UI_STALL_RECOVERED, {
      total_ms: totalMs,
      screen: currentScreen,
    });
  });

  appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    noteAppStateChange();
    noteRenderAppStateChange();
    void emitAmbientTick(`app_state_${s}`);
  });

  // Blocked JS thread: report it the moment it recovers, with the recent
  // actions that are known to do blocking native work.
  stallUnsub = onJsStall((stallMs) => {
    const call = useCallStore.getState().activeCall;
    analytics.capture(ANALYTICS_EVENTS.RUNTIME.JS_STALL, {
      stall_ms: stallMs,
      in_call: call != null,
      call_state: call?.state ?? null,
      ...recentActionMarks(),
    });
    Sentry.addBreadcrumb({
      category: 'runtime.js_stall',
      level: 'warning',
      message: `js thread blocked ${stallMs} ms`,
    });
  });

  callStoreUnsub = useCallStore.subscribe((state, prev) => {
    if (prev.activeCall && !state.activeCall) markAction('call_ended');
  });
}

/** Stop ambient telemetry. Currently only used on test/cleanup paths. */
export function stopAmbientTelemetry(): void {
  if (!started) return;
  started = false;
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  stallUnsub?.();
  stallUnsub = null;
  renderStallUnsub?.();
  renderStallUnsub = null;
  renderRecoverUnsub?.();
  renderRecoverUnsub = null;
  stopRenderStallMonitor();
  callStoreUnsub?.();
  callStoreUnsub = null;
  releaseJsLagMonitor();
  startedAt = 0;
}

export function isAmbientTelemetryActive(): boolean {
  return started;
}

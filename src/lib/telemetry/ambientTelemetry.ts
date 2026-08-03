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
import { acquireJsLagMonitor, releaseJsLagMonitor } from './jsLag';

const TICK_MS = 30_000;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove(): void } | null = null;
let started = false;
let startedAt = 0;

async function emitAmbientTick(reason: string): Promise<void> {
  // Don't double-emit while a call is active — callTelemetry covers that window.
  if (isCallTelemetryActive()) return;
  // Don't tick while backgrounded. Transitions still fire below via AppState.
  if (reason === 'tick' && AppState.currentState !== 'active') return;

  const snap = await getDeviceSnapshot();
  const payload = {
    ...snap,
    reason,
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

  appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    void emitAmbientTick(`app_state_${s}`);
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
  releaseJsLagMonitor();
  startedAt = 0;
}

export function isAmbientTelemetryActive(): boolean {
  return started;
}

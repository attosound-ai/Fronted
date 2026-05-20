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
import * as Sentry from '@sentry/react-native';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

import { telemetryCounters } from './counters';
import { acquireJsLagMonitor, releaseJsLagMonitor } from './jsLag';
import { getDeviceSnapshot, type DeviceSnapshot } from './deviceSnapshot';

const TICK_MS = 10_000;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove(): void } | null = null;
let callStartedAt: number | null = null;
let isActive = false;
let didPauseReplay = false;

interface TickPayload extends DeviceSnapshot {
  reason: string;
  callDurationSec: number;
}

async function snapshotAndEmit(reason: string): Promise<TickPayload> {
  const snap = await getDeviceSnapshot();
  const payload: TickPayload = {
    ...snap,
    reason,
    callDurationSec: callStartedAt
      ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
      : 0,
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

  appStateSub = AppState.addEventListener('change', (s: AppStateStatus) => {
    void snapshotAndEmit(`app_state_${s}`);
  });
}

/** Emit a tagged snapshot. No-op if telemetry is not active. */
export async function emitTelemetryMarker(
  name: string,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!isActive) return;
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

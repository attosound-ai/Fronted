/**
 * JS event-loop lag monitor.
 *
 * Schedules a 1 s heartbeat and measures how much later it actually fires.
 * Any drift beyond the expected interval is time the JS thread spent busy
 * (heavy renders, sync worklet jumps, GC pauses, etc.) — a leading indicator
 * of UI freezes and, combined with native pressure, of the iOS watchdog
 * firing.
 *
 * Reference-counted because multiple subsystems may want it running at
 * the same time (ambient telemetry while the app is active, call telemetry
 * during a call). The heartbeat actually runs while at least one acquirer
 * is registered, and stops when the last one releases.
 */

const HEARTBEAT_MS = 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
let lagMs = 0;
let peakLagMs = 0;
let ticks = 0;
let lagSum = 0;
let acquireCount = 0;

function actuallyStart(): void {
  if (intervalId !== null) return;
  lastTick = Date.now();
  lagMs = 0;
  peakLagMs = 0;
  ticks = 0;
  lagSum = 0;
  intervalId = setInterval(() => {
    const now = Date.now();
    const delta = now - lastTick;
    const drift = Math.max(0, delta - HEARTBEAT_MS);
    lagMs = drift;
    if (drift > peakLagMs) peakLagMs = drift;
    lagSum += drift;
    ticks += 1;
    lastTick = now;
  }, HEARTBEAT_MS);
}

function actuallyStop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  lagMs = 0;
}

/** Reference-counted acquire. Pairs with {@link releaseJsLagMonitor}. */
export function acquireJsLagMonitor(): void {
  acquireCount += 1;
  if (acquireCount === 1) actuallyStart();
}

/** Reference-counted release. Pairs with {@link acquireJsLagMonitor}. */
export function releaseJsLagMonitor(): void {
  acquireCount = Math.max(0, acquireCount - 1);
  if (acquireCount === 0) actuallyStop();
}

/** @deprecated Prefer {@link acquireJsLagMonitor} for ref-counted lifetime. */
export function startJsLagMonitor(): void {
  acquireJsLagMonitor();
}

/** @deprecated Prefer {@link releaseJsLagMonitor} for ref-counted lifetime. */
export function stopJsLagMonitor(): void {
  releaseJsLagMonitor();
}

export function getJsLagStats(): {
  lastLagMs: number;
  peakLagMs: number;
  avgLagMs: number;
} {
  return {
    lastLagMs: lagMs,
    peakLagMs,
    avgLagMs: ticks > 0 ? Math.round(lagSum / ticks) : 0,
  };
}

/**
 * Same as {@link getJsLagStats} but resets the rolling aggregates
 * (`peakLagMs`, `lagSum`, `ticks`) afterwards so the next read covers
 * a fresh window. `lastLagMs` is point-in-time and is left alone.
 *
 * Telemetry tickers (ambient @ 30 s, call @ 10 s) should call this so the
 * reported peak reflects the last interval, not session-since-start.
 */
export function consumeJsLagStats(): {
  lastLagMs: number;
  peakLagMs: number;
  avgLagMs: number;
} {
  const out = {
    lastLagMs: lagMs,
    peakLagMs,
    avgLagMs: ticks > 0 ? Math.round(lagSum / ticks) : 0,
  };
  peakLagMs = 0;
  lagSum = 0;
  ticks = 0;
  return out;
}

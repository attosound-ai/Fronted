/**
 * JS event-loop lag monitor.
 *
 * Schedules a 1s heartbeat and measures how much later it actually fires.
 * Any drift beyond the expected interval is time the JS thread spent busy
 * (heavy renders, sync work in worklets bouncing back, etc.) — a leading
 * indicator of UI freezes and, when combined with native pressure, of the
 * watchdog firing.
 */

const HEARTBEAT_MS = 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
let lagMs = 0;
let peakLagMs = 0;
let ticks = 0;
let lagSum = 0;

export function startJsLagMonitor(): void {
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

export function stopJsLagMonitor(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  lagMs = 0;
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

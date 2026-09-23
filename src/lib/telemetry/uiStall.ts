/**
 * Render stall and memory surge detectors.
 *
 * Why (Sep 20 2026, a client video of a frozen feed right after posting): the
 * JS heartbeat kept ticking, taps still reached JS, Sentry saw no app hang,
 * and the screen simply stopped updating while memory grew 400 MB every 30 s.
 * Nothing in the telemetry could tell which layer was stuck, so the cause had
 * to be guessed. These two signals close that gap.
 *
 * Render stall: requestAnimationFrame callbacks are paced by the native
 * display link, timers are not. When frames stop arriving while the timer
 * keeps firing, the JS thread is alive and the render side (UI thread,
 * mounting, a stuck native transition) is what froze. `runtime_js_stall`
 * covers the opposite case.
 *
 * Memory surge: a jump between two samples far beyond normal use, reported
 * with the screen and the recent actions so the leaking surface names itself.
 */

import { AppState } from 'react-native';

const CHECK_MS = 1000;
/** Frames missing for this long means the user is looking at a frozen screen. */
const RENDER_STALL_MS = 2500;
/** Report again while it lasts, so the duration can be read from the events. */
const RENDER_STALL_REPEAT_MS = 10_000;

export interface RenderStall {
  /** How long no frame has been delivered. */
  gapMs: number;
  /** Frames delivered since the monitor started, a cheap liveness counter. */
  frames: number;
  /** True for the first report of a stall, false for the repeats. */
  first: boolean;
}

type RenderStallListener = (stall: RenderStall) => void;
type RenderRecoverListener = (totalMs: number) => void;

const stallListeners = new Set<RenderStallListener>();
const recoverListeners = new Set<RenderRecoverListener>();

let rafId: number | null = null;
let checkId: ReturnType<typeof setInterval> | null = null;
let lastFrameAt = 0;
let frames = 0;
let stallStartedAt = 0;
let lastReportAt = 0;
let lastAppStateChangeAt = 0;

function onFrame(): void {
  const now = Date.now();
  if (stallStartedAt) {
    const total = now - stallStartedAt;
    stallStartedAt = 0;
    recoverListeners.forEach((l) => {
      try {
        l(total);
      } catch {
        // telemetry must never throw into the frame loop
      }
    });
  }
  lastFrameAt = now;
  frames += 1;
  // No frames to watch off screen, and a rAF loop in the background spins
  // (see src/lib/backgroundFrames.ts); check() restarts it on return.
  if (AppState.currentState !== 'active') {
    rafId = null;
    return;
  }
  rafId = requestAnimationFrame(onFrame);
}

function check(): void {
  if (AppState.currentState !== 'active') {
    // iOS pauses the display link in the background: not a stall.
    lastFrameAt = Date.now();
    return;
  }
  const now = Date.now();
  if (rafId === null && checkId !== null) {
    lastFrameAt = now;
    rafId = requestAnimationFrame(onFrame);
    return;
  }
  // Give the display link a moment after coming back to the foreground.
  if (now - lastAppStateChangeAt < RENDER_STALL_MS) return;
  const gap = now - lastFrameAt;
  if (gap < RENDER_STALL_MS) return;
  const first = stallStartedAt === 0;
  if (first) stallStartedAt = lastFrameAt;
  else if (now - lastReportAt < RENDER_STALL_REPEAT_MS) return;
  lastReportAt = now;
  stallListeners.forEach((l) => {
    try {
      l({ gapMs: gap, frames, first });
    } catch {
      // telemetry must never throw into the heartbeat
    }
  });
}

export function startRenderStallMonitor(): void {
  if (checkId !== null) return;
  lastFrameAt = Date.now();
  frames = 0;
  stallStartedAt = 0;
  rafId = requestAnimationFrame(onFrame);
  checkId = setInterval(check, CHECK_MS);
}

export function stopRenderStallMonitor(): void {
  if (checkId !== null) clearInterval(checkId);
  if (rafId !== null) cancelAnimationFrame(rafId);
  checkId = null;
  rafId = null;
}

export function noteRenderAppStateChange(): void {
  lastAppStateChangeAt = Date.now();
  lastFrameAt = Date.now();
}

export function onRenderStall(listener: RenderStallListener): () => void {
  stallListeners.add(listener);
  return () => stallListeners.delete(listener);
}

export function onRenderRecovered(listener: RenderRecoverListener): () => void {
  recoverListeners.add(listener);
  return () => recoverListeners.delete(listener);
}

/** Frames delivered so far, for heartbeats that want a render liveness figure. */
export function renderFrameCount(): number {
  return frames;
}

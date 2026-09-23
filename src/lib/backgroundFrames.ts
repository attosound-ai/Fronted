/**
 * Background pacing for requestAnimationFrame.
 *
 * Why (Sep 23 2026, calls dying about a minute after the phone locked): a
 * requestAnimationFrame loop is paced by the display link while the app is
 * on screen, 60 callbacks a second. In the background RCTTiming has no
 * display link: every timer it receives, and a rAF is a 1 ms timer, is armed
 * as an NSTimer at its target date, which is already in the past, so it fires
 * at once, the callback schedules the next frame, and the loop spins as fast
 * as JS can run. The JS census on build 14 counted 189,396 rAF callbacks in
 * the 30 s after a lock (6,300 a second against 60 on screen), the pulse saw
 * the JavaScript thread at 89 percent of a core, and iOS terminated the app
 * for the background CPU limit (MetricKit `bg_cpu_limit`) with the call live.
 * The app is only awake in the background during a call, which is why only
 * calls died.
 *
 * Any frame loop (a telemetry monitor, playback ticks, a library) is a
 * candidate, so the guard sits on the global: while the app is not active a
 * rAF becomes a 16 ms timeout, one callback per frame period, never a spin.
 */
import { AppState } from 'react-native';

const FRAME_MS = 16;

let installed = false;

export function installBackgroundFramePacing(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as {
    requestAnimationFrame: typeof requestAnimationFrame;
    cancelAnimationFrame: typeof cancelAnimationFrame;
  };
  const nativeRaf = g.requestAnimationFrame;
  const nativeCancel = g.cancelAnimationFrame;
  if (typeof nativeRaf !== 'function') return;

  // Handles from the timeout path are tagged so cancel reaches the right pool.
  const timeoutHandles = new Set<number>();

  g.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    if (AppState.currentState === 'active') return nativeRaf(cb);
    const id = setTimeout(() => {
      timeoutHandles.delete(id as unknown as number);
      cb(Date.now());
    }, FRAME_MS) as unknown as number;
    timeoutHandles.add(id);
    return id;
  }) as typeof requestAnimationFrame;

  g.cancelAnimationFrame = ((id: number): void => {
    if (timeoutHandles.has(id)) {
      timeoutHandles.delete(id);
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
      return;
    }
    nativeCancel(id);
  }) as typeof cancelAnimationFrame;
}

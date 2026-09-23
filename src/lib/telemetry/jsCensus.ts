/**
 * JS thread census (Sep 23 2026). Build 13 on David's phone: the JavaScript
 * thread at 89 percent of a core in background during a call, 55 s after the
 * lock, and iOS killed the app for the background CPU limit. No profiler runs
 * in a release build, so this counts what the JS thread is asked to do:
 *
 *  - timers: every setTimeout / setInterval / requestAnimationFrame callback
 *    that fires, keyed by the top frame of the stack that scheduled it;
 *  - native events: every DeviceEventEmitter emit, keyed by event name;
 *  - microtasks: Promise.then callbacks, one counter.
 *
 * Only while a call is live (startJsCensus / stopJsCensus). The memory
 * heartbeat attaches the top entries since its last read, so the last
 * heartbeat before a death names the loop.
 */
import { DeviceEventEmitter } from 'react-native';

type Counter = Map<string, number>;

let active = false;
let timerCounts: Counter = new Map();
let eventCounts: Counter = new Map();
let promiseThens = 0;
let installed = false;

const g = globalThis as unknown as {
  setTimeout: typeof setTimeout;
  setInterval: typeof setInterval;
  requestAnimationFrame: typeof requestAnimationFrame;
};
const orig = {
  setTimeout: g.setTimeout,
  setInterval: g.setInterval,
  requestAnimationFrame: g.requestAnimationFrame,
  emit: DeviceEventEmitter.emit.bind(DeviceEventEmitter),
  then: Promise.prototype.then,
};

function bump(map: Counter, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** The frame that scheduled the timer: the first stack line outside this file. */
function creatorFrame(): string {
  try {
    const lines = (new Error().stack ?? '').split('\n');
    for (const line of lines.slice(1)) {
      if (line.includes('jsCensus')) continue;
      const t = line.trim();
      if (t) return t.slice(0, 90);
    }
  } catch {
    // ignore
  }
  return 'unknown';
}

function install(): void {
  if (installed) return;
  installed = true;
  g.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    const key = active ? `timeout(${ms ?? 0}) ${creatorFrame()}` : '';
    const wrapped = (...a: unknown[]) => {
      if (active) bump(timerCounts, key || `timeout(${ms ?? 0}) late`);
      return fn(...a);
    };
    return orig.setTimeout(wrapped as TimerHandler, ms, ...rest);
  }) as typeof setTimeout;
  g.setInterval = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
    const key = `interval(${ms ?? 0}) ${creatorFrame()}`;
    const wrapped = (...a: unknown[]) => {
      if (active) bump(timerCounts, key);
      return fn(...a);
    };
    return orig.setInterval(wrapped as TimerHandler, ms, ...rest);
  }) as typeof setInterval;
  g.requestAnimationFrame = ((fn: FrameRequestCallback) => {
    const key = active ? `raf ${creatorFrame()}` : '';
    return orig.requestAnimationFrame((t) => {
      if (active) bump(timerCounts, key || 'raf late');
      fn(t);
    });
  }) as typeof requestAnimationFrame;
  DeviceEventEmitter.emit = ((name: string, ...args: unknown[]) => {
    if (active) bump(eventCounts, String(name));
    return orig.emit(name, ...args);
  }) as typeof DeviceEventEmitter.emit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Promise.prototype as any).then = function patchedThen(this: Promise<unknown>, a: unknown, b: unknown) {
    if (active) promiseThens += 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (orig.then as any).call(this, a, b);
  };
}

export function startJsCensus(): void {
  install();
  timerCounts = new Map();
  eventCounts = new Map();
  promiseThens = 0;
  active = true;
}

export function stopJsCensus(): void {
  active = false;
}

function top(map: Counter, n: number): string {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${v}x ${k}`)
    .join(' | ')
    .slice(0, 1200);
}

/** Top timers and events since the previous call; resets the counters. */
export function jsCensusSnapshot(): {
  timers: string;
  events: string;
  timerCallbacks: number;
  nativeEvents: number;
  promiseThens: number;
} {
  const timerCallbacks = [...timerCounts.values()].reduce((a, b) => a + b, 0);
  const nativeEvents = [...eventCounts.values()].reduce((a, b) => a + b, 0);
  const out = {
    timers: top(timerCounts, 8),
    events: top(eventCounts, 8),
    timerCallbacks,
    nativeEvents,
    promiseThens,
  };
  timerCounts = new Map();
  eventCounts = new Map();
  promiseThens = 0;
  return out;
}

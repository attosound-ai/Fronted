/**
 * Cheap module-level counters for resources whose accumulation precedes the
 * iOS WatchdogTermination on calls. Each call site increments on register and
 * decrements on teardown; a monotonically growing value across a session is
 * the signature of a listener/player/socket leak.
 */

export type CounterKey =
  | 'twilioListeners'
  | 'audioPlayers'
  | 'socketChannels'
  | 'activeCalls';

const counts: Record<CounterKey, number> = {
  twilioListeners: 0,
  audioPlayers: 0,
  socketChannels: 0,
  activeCalls: 0,
};

const peaks: Record<CounterKey, number> = {
  twilioListeners: 0,
  audioPlayers: 0,
  socketChannels: 0,
  activeCalls: 0,
};

function bumpPeak(key: CounterKey) {
  if (counts[key] > peaks[key]) peaks[key] = counts[key];
}

export const telemetryCounters = {
  inc(key: CounterKey, by = 1): number {
    counts[key] += by;
    bumpPeak(key);
    return counts[key];
  },
  dec(key: CounterKey, by = 1): number {
    counts[key] = Math.max(0, counts[key] - by);
    return counts[key];
  },
  set(key: CounterKey, value: number): number {
    counts[key] = Math.max(0, value);
    bumpPeak(key);
    return counts[key];
  },
  get(key: CounterKey): number {
    return counts[key];
  },
  snapshot(): Record<CounterKey, number> {
    return { ...counts };
  },
  peakSnapshot(): Record<CounterKey, number> {
    return { ...peaks };
  },
  resetPeaks() {
    for (const k of Object.keys(peaks) as CounterKey[]) {
      peaks[k] = counts[k];
    }
  },
};

import NetInfo from '@react-native-community/netinfo';

/**
 * connectivity — ONE place to ask "is there signal, and how good" and ONE voice
 * for turning a network failure into a message the user can act on.
 *
 * Why this exists: network operations were failing SILENTLY across the app. The
 * clearest case (David, Aug 5) was the in-call transmit button: on poor service
 * the track download stalled with no timeout and no feedback, so the far party
 * heard nothing and the user could not tell whether the app was broken or the
 * signal was. The rule this module enforces everywhere: a network op that fails
 * NEVER fails quietly. It resolves a typed outcome the caller can show.
 */

export interface Connectivity {
  /** Best available truth for "can I reach the network right now". */
  online: boolean;
  /** 'wifi' | 'cellular' | 'none' | 'unknown' | ... (NetInfo type). */
  type: string;
  /** '2g' | '3g' | '4g' | '5g' | null — only present on cellular. */
  cellularGeneration: string | null;
  /**
   * Heuristic "the connection is weak enough to warn about": offline, or a slow
   * cellular generation (2g/3g). It is intentionally conservative — a false
   * "weak" is worse than a missed one, since it would cry wolf.
   */
  weak: boolean;
}

const UNKNOWN: Connectivity = {
  online: true, // fail OPEN: never block an action just because NetInfo is unsure
  type: 'unknown',
  cellularGeneration: null,
  weak: false,
};

/**
 * Snapshot connectivity right now. Never throws; on any error it returns the
 * fail-open UNKNOWN (online: true) so a flaky NetInfo can never itself become the
 * reason an action is blocked.
 */
export async function getConnectivity(): Promise<Connectivity> {
  try {
    const s = await NetInfo.fetch();
    const type = s.type ?? 'unknown';
    const cellularGeneration =
      (s.details as { cellularGeneration?: string } | null)?.cellularGeneration ?? null;
    // isInternetReachable is null until NetInfo has probed; treat null as "assume
    // reachable" (fail open) and only trust an explicit false.
    const reachable = s.isInternetReachable;
    const online = s.isConnected !== false && reachable !== false;
    const weak =
      !online ||
      type === 'none' ||
      cellularGeneration === '2g' ||
      cellularGeneration === '3g';
    return { online, type, cellularGeneration, weak };
  } catch {
    return UNKNOWN;
  }
}

/**
 * Race a promise against a timeout. Many RN network APIs (FileSystem.downloadAsync,
 * expo-video load) have NO built-in timeout, so on a dead connection they hang
 * forever and the UI sits silent. This bounds the wait; the underlying native op
 * may keep running (and, for a download to a deterministic path, usefully finish
 * into cache), but the CALLER stops waiting and can tell the user.
 *
 * Rejects with a TimeoutError so callers can distinguish a timeout from a genuine
 * failure and choose the right message ("weak signal" vs "couldn't prepare").
 */
export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer)
  ) as Promise<T>;
}

/** The kind of failure, so the caller picks the right i18n key without parsing strings. */
export type NetFailureKind = 'offline' | 'timeout' | 'server' | 'unknown';

/**
 * Classify a caught error + a connectivity snapshot into ONE kind. This is the
 * single decision point for "what went wrong on the network", so every surface
 * gives the user the same vocabulary: offline vs weak/slow vs the server erred.
 */
export function classifyNetFailure(error: unknown, conn: Connectivity): NetFailureKind {
  if (!conn.online) return 'offline';
  if (error instanceof TimeoutError) return 'timeout';
  const status =
    (error as { status?: number; response?: { status?: number } })?.status ??
    (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number' && status >= 500) return 'server';
  // A thrown "Network request failed" with NetInfo still reporting online is the
  // weak-signal middle ground: the request left but never completed.
  const msg = error instanceof Error ? error.message.toLowerCase() : '';
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection')) {
    return conn.weak ? 'timeout' : 'unknown';
  }
  return 'unknown';
}

/**
 * i18n key (under the `net.*` namespace, present in common.json for every locale)
 * for a given failure kind, so callers do: t(netFailureKey(kind), { action }).
 * The `action` interpolation lets one message serve many verbs ("send audio",
 * "save your recording", "publish").
 */
export function netFailureKey(kind: NetFailureKind): string {
  switch (kind) {
    case 'offline':
      return 'net.offline';
    case 'timeout':
      return 'net.weakSignal';
    case 'server':
      return 'net.serverError';
    default:
      return 'net.genericFailure';
  }
}

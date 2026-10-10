/**
 * The voice engine's self heal events (Oct 10 2026), as PostHog rows.
 *
 * The native watchdog in AttoAudioEngineDevice (patched Twilio SDK) emits one
 * dictionary per phase: stall, attempt, result, exhausted. It sends them live when
 * JS listens and also keeps the last twelve in a ring in NSUserDefaults, because a
 * call answered from the lock screen can run with JS asleep. The same event can
 * therefore arrive twice (live, then again when the ring is drained); the native
 * `at` timestamp (epoch seconds, strictly increasing per phone) is the identity.
 *
 * Pure (no React Native imports) so it runs under `node --test`.
 */

export interface NativeHealEvent {
  phase?: string;
  at?: number;
  cause?: string;
  level?: number;
  attempt?: number;
  attempts?: number;
  ok?: boolean;
  recover_ms?: number;
  stalled_ms?: number;
  category?: string;
  mode?: string;
  input_port?: string;
  output_port?: string;
  rec_cb?: number;
  play_cb?: number;
  has_unit?: boolean;
  enabled?: boolean;
  heal_off?: boolean;
}

export const HEAL_EVENT_NAMES: Record<string, string> = {
  stall: 'call_audio_stall_detected',
  attempt: 'call_audio_heal_attempt',
  result: 'call_audio_heal_result',
  exhausted: 'call_audio_heal_exhausted',
};

const PHASE_ORDER: Record<string, number> = {
  stall: 0,
  attempt: 1,
  result: 2,
  exhausted: 3,
};

export interface HealCapture {
  name: string;
  at: number;
  props: Record<string, unknown>;
}

/**
 * Turn native events into captures, oldest first, skipping anything at or before
 * `lastReportedAt` (already sent) and anything malformed. `source` says whether
 * the row came live or from the ring; `delayMs` is how late it is reported.
 */
export function healCaptures(
  events: readonly NativeHealEvent[],
  lastReportedAt: number,
  source: 'live' | 'ring',
  nowMs: number
): HealCapture[] {
  return (
    events
      .filter(
        (e): e is NativeHealEvent & { phase: string; at: number } =>
          typeof e?.at === 'number' &&
          Number.isFinite(e.at) &&
          typeof e.phase === 'string' &&
          HEAL_EVENT_NAMES[e.phase] !== undefined &&
          e.at > lastReportedAt
      )
      // The stall and its first attempt come from the same watchdog tick; keep the
      // phase order when the native timestamps tie.
      .sort((a, b) => a.at - b.at || PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase])
      .map((e) => ({
        name: HEAL_EVENT_NAMES[e.phase],
        at: e.at,
        props: {
          cause: e.cause ?? null,
          level: e.level ?? null,
          attempt: e.attempt ?? null,
          attempts: e.attempts ?? null,
          ok: e.ok ?? null,
          recover_ms: e.recover_ms ?? null,
          stalled_ms: e.stalled_ms ?? null,
          session_category: e.category ?? null,
          session_mode: e.mode ?? null,
          input_port: e.input_port ?? null,
          output_port: e.output_port ?? null,
          rec_cb: e.rec_cb ?? null,
          play_cb: e.play_cb ?? null,
          has_unit: e.has_unit ?? null,
          device_enabled: e.enabled ?? null,
          heal_off: e.heal_off ?? null,
          source,
          native_at_ms: Math.round(e.at * 1000),
          report_delay_ms: Math.max(0, Math.round(nowMs - e.at * 1000)),
        },
      }))
  );
}

/** Did this batch contain a successful heal (the route must be re-applied)? */
export function containsRecovery(captures: readonly HealCapture[]): boolean {
  return captures.some((c) => c.name === HEAL_EVENT_NAMES.result && c.props.ok === true);
}

/**
 * Decides whether a call CallKit holds but JS never adopted is worth reporting
 * (call_cold_adopt_missing). Pure, so the three false alarms it already had are
 * pinned by tests:
 *
 * - Oct 12 2026: CallKit counts a RINGING call as live; four cold calls were
 *   reported at 8 s while still ringing.
 * - Oct 13 2026, fix47: reported 0.45 s after the answer, 0.2 s after the
 *   adoption finished. The adoption probes need a moment.
 * - Oct 13 2026, fix48: the native answer markers survive the process; five cold
 *   calls 40 s apart each read the previous call's answer while ringing.
 */

export const ANSWERED_RECENTLY_S = 120;
export const UNADOPTED_GRACE_MS = 6000;

export type UnadoptedMarkers = {
  liveCallKitCalls?: number;
  /** Epoch seconds, 0 or absent when never set. */
  answerActionAt?: number;
  coldAnswerActionAt?: number;
  coldAcceptAt?: number;
  voipPushAt?: number;
  coldInviteDecodedAt?: number;
};

export type UnadoptedVerdict =
  | { kind: 'none' }
  /** Not answered (yet): look again later. */
  | { kind: 'ringing' }
  /** Answered a moment ago: give the adoption probes `waitMs` more. */
  | { kind: 'grace'; waitMs: number }
  | { kind: 'report'; msSinceAnswer: number };

export function judgeUnadoptedCall(
  native: UnadoptedMarkers | null | undefined,
  nowMs: number
): UnadoptedVerdict {
  if ((native?.liveCallKitCalls ?? 0) <= 0) return { kind: 'none' };
  const answeredAtS = Math.max(
    native?.coldAcceptAt ?? 0,
    native?.coldAnswerActionAt ?? 0,
    native?.answerActionAt ?? 0
  );
  const ringingSinceS = Math.max(
    native?.voipPushAt ?? 0,
    native?.coldInviteDecodedAt ?? 0
  );
  const msSinceAnswer = nowMs - answeredAtS * 1000;
  const answeredThisCall =
    answeredAtS > 0 &&
    answeredAtS >= ringingSinceS &&
    msSinceAnswer < ANSWERED_RECENTLY_S * 1000;
  if (!answeredThisCall) return { kind: 'ringing' };
  if (msSinceAnswer < UNADOPTED_GRACE_MS) {
    return { kind: 'grace', waitMs: UNADOPTED_GRACE_MS - msSinceAnswer };
  }
  return { kind: 'report', msSinceAnswer };
}

/**
 * Last-action marks for freeze forensics.
 *
 * Cheap timestamps of a few user or lifecycle actions that are known to do
 * blocking native work (audio session activation, call teardown). When the
 * JS thread stalls, the stall event carries how long ago each action happened,
 * so the cause is in the event itself instead of being reconstructed from a
 * timeline afterwards.
 */

const RECENT_WINDOW_MS = 60_000;
const marks = new Map<string, number>();

export function markAction(name: string): void {
  marks.set(name, Date.now());
}

/** `{ ms_since_<name>: number }` for every mark within the last minute. */
export function recentActionMarks(now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  marks.forEach((at, name) => {
    const age = now - at;
    if (age <= RECENT_WINDOW_MS) out[`ms_since_${name}`] = age;
  });
  return out;
}

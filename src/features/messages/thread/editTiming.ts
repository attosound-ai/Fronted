import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * How long opening the in place editor really takes, from the tap on Edit in
 * the menu to the keyboard being up, measured on the user's own device.
 * David, Oct 5 2026: "it feels stuck and heavy next to iMessage". iMessage,
 * recorded at 60 fps on the same phone: field in place 270 ms after the tap,
 * everything settled at 500 ms. One event per edit, so a regression shows up
 * as a number instead of as a feeling.
 */
type Mark = 'mounted' | 'focused' | 'keyboard_will_show' | 'keyboard_shown';

let tapAt = 0;
let marks: Partial<Record<Mark, number>> = {};
let reported = true;
let extra: Record<string, number | boolean> = {};

const now = () => globalThis.performance?.now?.() ?? Date.now();

/** Pure: the event payload for a set of marks. Exported for the tests. */
export function timingPayload(
  marksMs: Partial<Record<Mark, number>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, at] of Object.entries(marksMs)) {
    if (typeof at === 'number' && at >= 0) out[`to_${name}_ms`] = Math.round(at);
  }
  return out;
}

/**
 * `menu` comes from the patched native menu: how many ms into the menu's
 * dismissal the action reached JS (negative: before it began) and whether the
 * faster dismissal found the menu's view. Without it the numbers above start
 * late and hide the wait David sees.
 */
export function markEditTap(menu?: {
  msSinceWillEnd?: number;
  fastDismiss?: boolean;
}): void {
  tapAt = now();
  marks = {};
  extra = {};
  const ms = menu?.msSinceWillEnd;
  if (typeof ms === 'number' && ms < 5000) extra.menu_ms_since_will_end = ms;
  if (typeof menu?.fastDismiss === 'boolean') extra.menu_fast_dismiss = menu.fastDismiss;
  reported = false;
}

export function markEdit(name: Mark): void {
  if (reported || tapAt === 0 || marks[name] !== undefined) return;
  marks[name] = now() - tapAt;
  if (name === 'keyboard_shown') flushEditTiming();
}

/** Sends what was measured; also called when the edit ends before the keyboard is up. */
export function flushEditTiming(): void {
  if (reported) return;
  reported = true;
  if (marks.mounted === undefined) return;
  analytics.capture(ANALYTICS_EVENTS.MESSAGES.EDIT_OPEN_TIMING, {
    ...timingPayload(marks),
    ...extra,
  });
}

import type { AppIconSlot } from '../types';

/**
 * The phone is the only truth about which icon is on the home screen. The
 * picker used to trust its own remembered choice, and that memory drifted:
 * a second tile tapped while the first change was still being confirmed left
 * the app saying "studio" with the diamond icon on the home screen, and then
 * tapping Studio "to go back" did nothing because the app believed it was
 * already there (client, Oct 6 2026: "I can't change my app icon back").
 */

/** What the native module reports ("DEFAULT", "", a slot name) as a slot. */
export function slotFromNative(name: string | null | undefined): AppIconSlot {
  if (!name) return null;
  const clean = name.replace(/^AppIcon-/, '');
  if (clean === '' || clean === 'DEFAULT' || clean === '<nil>') return null;
  return clean;
}

export interface AttemptResult {
  /** What the picker must show as selected: always what the phone really has. */
  selected: AppIconSlot;
  /** True when the phone ended on the icon that was asked for. */
  applied: boolean;
}

/**
 * After asking the system for `requested`, decide from the icon the phone
 * really shows. The native "ok" flag is deliberately not an input: it said
 * "failed" for changes that had in fact applied.
 */
export function resolveAttempt(
  requested: AppIconSlot,
  phoneNow: AppIconSlot
): AttemptResult {
  return { selected: phoneNow, applied: phoneNow === requested };
}

/** A tap is a no op only when the PHONE already shows that icon. */
export function isAlreadyOnPhone(requested: AppIconSlot, phoneNow: AppIconSlot): boolean {
  return requested === phoneNow;
}

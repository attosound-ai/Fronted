import { analytics, ANALYTICS_EVENTS } from './index';

/**
 * Returns the requested next value clamped to >= 0. If the raw value would
 * have been negative, captures a PostHog event so the upstream bug can be
 * diagnosed. Use this anywhere we mutate a denormalized counter (followers,
 * following, posts, likes, comments, ...).
 *
 * Single Responsibility: enforce the "counts are never negative" invariant
 * + report violations. The caller decides what to do with the (already-safe)
 * return value.
 */
export function safeCount(
  next: number,
  context: {
    /** What count is being mutated (e.g. "followersCount"). */
    field: string;
    /** Where in the UI this happened (e.g. "useUserProfile.followMutation"). */
    source: string;
    /** Extra debugging context — userId, profileId, prevValue, action, etc. */
    extra?: Record<string, unknown>;
  },
): number {
  if (Number.isFinite(next) && next >= 0) return next;

  analytics.capture(ANALYTICS_EVENTS.INTEGRITY.COUNT_INVARIANT_VIOLATED, {
    field: context.field,
    source: context.source,
    raw_value: next,
    clamped_to: 0,
    ...context.extra,
  });

  return 0;
}

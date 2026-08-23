import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * Outcome telemetry for optimistic SOCIAL mutations (likes, bookmarks,
 * reposts, comments, follows).
 *
 * WHY THIS EXISTS (Aug 23 2026). The social domain reported INTENT, never
 * RESULT, and that made it lie. `feed_post_liked` fires in `onMutate` — before
 * the network call — and the error path only rolled the cache back, silently.
 * So a failed like was recorded in PostHog as a successful one while the UI
 * reverted underneath the user. Commenting was worse: `feed_post_commented`
 * existed in the catalogue but was never emitted anywhere, so creating,
 * editing and deleting comments produced no data at all. When David reported a
 * comment badge stuck at 1 against a list of 2, there was nothing to query and
 * the diagnosis had to come from psql and redis-cli directly.
 *
 * The calls domain already learned this (every DTMF, speaker toggle and
 * capture attempt reports its outcome). This brings the same discipline to
 * social actions, ADDITIVELY: the existing events keep firing exactly as they
 * did, so nothing that already works changes. What is new is one row per
 * mutation carrying what actually happened.
 *
 * ONE event with an `action` dimension rather than a dozen event names: a
 * dashboard filters by action instead of unioning names, and a new action
 * costs a string, not a schema change.
 */
export type SocialActionName =
  | 'like'
  | 'unlike'
  | 'bookmark'
  | 'unbookmark'
  | 'repost'
  | 'unrepost'
  | 'share'
  | 'comment_create'
  | 'comment_edit'
  | 'comment_delete'
  | 'follow'
  | 'unfollow';

/** `applied` = the server confirmed it. `failed` = it was rolled back. */
export type SocialOutcome = 'applied' | 'failed';

/** Pull an HTTP status off an Axios-shaped error without importing Axios. */
function httpStatusOf(error: unknown): number | null {
  return (error as { response?: { status?: number } })?.response?.status ?? null;
}

export function reportSocialAction(
  action: SocialActionName,
  targetId: string,
  outcome: SocialOutcome,
  extra?: Record<string, unknown>
): void {
  analytics.capture(ANALYTICS_EVENTS.SOCIAL.ACTION, {
    action,
    target_id: targetId,
    outcome,
    ...extra,
  });
}

/** Failure variant: records the message and HTTP status so a spike is diagnosable. */
export function reportSocialActionFailed(
  action: SocialActionName,
  targetId: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  reportSocialAction(action, targetId, 'failed', {
    error: error instanceof Error ? error.message : String(error),
    http_status: httpStatusOf(error),
    ...extra,
  });
}

/**
 * THE signal that would have caught the Aug 23 comment-badge bug on its own:
 * compare the number we are SHOWING against the number the server reports,
 * right after a mutation reconciles. Emits ONLY on a mismatch, so it is a
 * zero-noise alarm rather than a metric — any row here is a real divergence
 * between a user's screen and the backend, on any user, without anyone
 * reporting it.
 */
export function reportCounterDivergence(params: {
  action: SocialActionName;
  targetId: string;
  field: 'commentsCount' | 'likesCount' | 'repostsCount' | 'followersCount';
  shown: number | null | undefined;
  server: number | null | undefined;
}): void {
  const { action, targetId, field, shown, server } = params;
  if (typeof shown !== 'number' || typeof server !== 'number') return;
  if (shown === server) return;
  analytics.capture(ANALYTICS_EVENTS.SOCIAL.COUNTER_DIVERGENCE, {
    action,
    target_id: targetId,
    field,
    shown,
    server,
    delta: server - shown,
  });
}

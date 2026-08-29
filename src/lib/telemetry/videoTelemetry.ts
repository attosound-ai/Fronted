/**
 * Video telemetry — one place that knows how to report what a video did, so a
 * slow load or a broken stream is never invisible.
 *
 * Sinks (mirrors callTelemetry):
 *  - PostHog (`analytics.capture(ANALYTICS_EVENTS.VIDEO.*)`) for SQL-able history
 *    and load-time funnels (LOAD_STARTED → LOAD_COMPLETED with `load_ms`).
 *  - Sentry breadcrumbs for the timeline leading up to any crash, plus a real
 *    `captureException` on playback errors so breakage pages/aggregates in Sentry
 *    with the surface, post id and source attached.
 *
 * Every event carries `surface` (where the video plays) + `post_id`, so you can
 * answer "are reels slower/breaking more than the feed?" directly.
 */
import * as Sentry from '@sentry/react-native';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

export type VideoSurface =
  | 'reels' // full-screen reels feed (ReelsFeed)
  | 'reels_ad' // sponsored reel in the reels feed
  | 'reel_media' // a reel-type post rendered in feed/post views (ReelMedia)
  | 'feed' // inline feed video (VideoMedia)
  | 'chat' // video message
  | 'ad'; // inline feed ad video

export interface VideoTelemetryContext {
  surface: VideoSurface;
  postId?: string;
}

/** Trim a Cloudinary URL so analytics rows stay bounded but still diagnosable. */
function shortSource(source?: string | null): string | undefined {
  if (!source) return undefined;
  return source.length > 200 ? source.slice(0, 200) : source;
}

/** Fired when a player starts loading a source (start of the load-time clock). */
export function videoLoadStarted(
  ctx: VideoTelemetryContext,
  source?: string | null
): void {
  analytics.capture(ANALYTICS_EVENTS.VIDEO.LOAD_STARTED, {
    surface: ctx.surface,
    post_id: ctx.postId,
    source: shortSource(source),
  });
  Sentry.addBreadcrumb({
    category: 'video',
    level: 'info',
    message: `video_load_start:${ctx.surface}`,
    data: { post_id: ctx.postId },
  });
}

/** Fired on first `readyToPlay`. `loadMs` = time from load start to first frame. */
export function videoLoadCompleted(ctx: VideoTelemetryContext, loadMs: number): void {
  analytics.capture(ANALYTICS_EVENTS.VIDEO.LOAD_COMPLETED, {
    surface: ctx.surface,
    post_id: ctx.postId,
    load_ms: loadMs,
  });
  Sentry.addBreadcrumb({
    category: 'video',
    level: 'info',
    message: `video_load_complete:${ctx.surface} ${loadMs}ms`,
    data: { post_id: ctx.postId, load_ms: loadMs },
  });
}

/**
 * Fired when the player errors. Always goes to PostHog (video_load_error, with
 * will_fallback, is the counter). Sentry gets an EXCEPTION only when the video
 * is actually dead: an HLS failure that is about to recover via MP4 is a
 * breadcrumb, not an error. Reporting the self-healing case as an error made
 * REACT-NATIVE-4F look like a broken feed (79 events / 4 users) when every one
 * of those played fine a second later; that noise also buries real failures.
 * The frequency of HLS→MP4 fallbacks is still visible in PostHog.
 */
export function videoError(
  ctx: VideoTelemetryContext,
  opts: { source?: string | null; willFallback: boolean }
): void {
  analytics.capture(ANALYTICS_EVENTS.VIDEO.LOAD_ERROR, {
    surface: ctx.surface,
    post_id: ctx.postId,
    source: shortSource(opts.source),
    will_fallback: opts.willFallback,
  });
  if (opts.willFallback) {
    Sentry.addBreadcrumb({
      category: 'video',
      level: 'warning',
      message: `video_error:${ctx.surface} (recovering via MP4)`,
      data: { post_id: ctx.postId, source: shortSource(opts.source) ?? null },
    });
    return;
  }
  Sentry.captureException(
    new Error(
      `video_error:${ctx.surface}${opts.willFallback ? ' (recovering via MP4)' : ''}`
    ),
    {
      tags: {
        feature: 'video',
        video_surface: ctx.surface,
        video_will_fallback: String(opts.willFallback),
      },
      contexts: {
        video: {
          surface: ctx.surface,
          post_id: ctx.postId ?? null,
          source: shortSource(opts.source) ?? null,
        },
      },
    }
  );
}

/** Fired when the HLS source failed and we swapped in the optimized MP4. */
export function videoFallbackUsed(ctx: VideoTelemetryContext): void {
  analytics.capture(ANALYTICS_EVENTS.VIDEO.FALLBACK_USED, {
    surface: ctx.surface,
    post_id: ctx.postId,
  });
  Sentry.addBreadcrumb({
    category: 'video',
    level: 'warning',
    message: `video_fallback_mp4:${ctx.surface}`,
    data: { post_id: ctx.postId },
  });
}

/** Fired on tap-to-pause / tap-to-play. */
export function videoPlaybackToggled(
  ctx: VideoTelemetryContext,
  action: 'pause' | 'play',
  positionMs?: number
): void {
  analytics.capture(ANALYTICS_EVENTS.VIDEO.PLAYBACK_TOGGLED, {
    surface: ctx.surface,
    post_id: ctx.postId,
    action,
    position_ms: positionMs,
  });
}

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import i18n from '@/lib/i18n';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { MediaTooLargeError } from '@/lib/media/mediaService';
import { applyPublishedPost, publishPost } from './publishPost';
import { mediaStillThere, resolveParams, resolveUri } from './publishPaths';
import { useAuthStore } from '@/stores/authStore';
import {
  endAllPublishActivities,
  endPublishActivity,
  startPublishActivity,
  updatePublishActivity,
  type ActivityPhase,
} from '../../../../modules/atto-live-activity';
import {
  usePublishQueue,
  type PublishFailure,
  type PublishJob,
} from './publishQueueStore';

/** How long the "Posted" state stays in the strip, like Instagram's. */
const POSTED_VISIBLE_MS = 5000;

/**
 * Runs the publish queue, one post at a time, for the whole life of the app
 * (mounted once in the root layout). The composer only enqueues; everything
 * slow happens here while the person keeps using the app.
 */
export function PublishRunner(): null {
  const jobs = usePublishQueue((s) => s.jobs);
  const runningRef = useRef<string | null>(null);

  // A Live Activity left by a run that died belongs to a post the queue now
  // shows as interrupted: it must not keep spinning in the Dynamic Island.
  useEffect(() => {
    void endAllPublishActivities();
  }, []);

  useEffect(() => {
    if (runningRef.current) return;
    const next = jobs.find((j) => j.phase === 'queued');
    if (!next) return;
    runningRef.current = next.id;
    void runJob(next).finally(() => {
      runningRef.current = null;
      // Wake this effect up again for whatever was queued meanwhile.
      usePublishQueue.setState((s) => ({ jobs: [...s.jobs] }));
    });
  }, [jobs]);

  return null;
}

function classify(error: unknown): { failure: PublishFailure; message: string } {
  const t = i18n.t.bind(i18n);
  if (
    error instanceof MediaTooLargeError ||
    (error instanceof Error && /413|too large/i.test(error.message))
  ) {
    const size =
      error instanceof MediaTooLargeError && error.bytes > 0
        ? (error.bytes / 1_000_000).toFixed(1)
        : null;
    const max =
      error instanceof MediaTooLargeError && error.maxBytes
        ? (error.maxBytes / 1_000_000).toFixed(0)
        : null;
    return {
      failure: 'too_large',
      message:
        size && max
          ? t('feed:publish.failedTooLargeSized', { size, max })
          : t('feed:publish.failedTooLarge'),
    };
  }
  if (
    error instanceof Error &&
    /network|timed out|timeout|offline/i.test(error.message)
  ) {
    return { failure: 'network', message: t('feed:publish.failedNetwork') };
  }
  return { failure: 'other', message: t('feed:publish.failedOther') };
}

/**
 * The Live Activity mirror of one job: throttled updates, "paused" while ATTO
 * is in the background (the upload stops there, as Instagram's does), and
 * a final state that stays a few seconds before it goes away.
 */
function activityFor(job: PublishJob) {
  const t = i18n.t.bind(i18n);
  const username = useAuthStore.getState().user?.username ?? '';
  let id: string | null = null;
  let progress = 0;
  let phase: ActivityPhase = 'uploading';
  let lastSent = 0;
  let ended = false;
  const line = () =>
    phase === 'paused'
      ? t('feed:publish.activityPaused')
      : t('feed:publish.activityUploading', { username });
  const send = (force = false) => {
    if (!id || ended) return;
    const now = Date.now();
    if (!force && now - lastSent < 1000) return;
    lastSent = now;
    void updatePublishActivity(id, progress, phase, line());
  };
  const thumb = job.thumbnailUri ? resolveUri(job.thumbnailUri) : null;
  const ready = startPublishActivity(thumb, job.params.postType, line()).then((value) => {
    id = value;
    send(true);
  });
  const sub = AppState.addEventListener('change', (next) => {
    phase = next === 'active' ? 'uploading' : 'paused';
    send(true);
  });
  return {
    progress(value: number) {
      progress = value;
      send();
    },
    async finish(final: 'posted' | 'failed', message: string) {
      sub.remove();
      await ready;
      ended = true;
      if (id) await endPublishActivity(id, final, message, final === 'posted' ? 4 : 8);
    },
  };
}

async function runJob(job: PublishJob): Promise<void> {
  const { update, remove } = usePublishQueue.getState();
  const started = Date.now();
  const activity = activityFor(job);
  const isVideo = job.params.postType === 'video' || job.params.postType === 'reel';
  update(job.id, {
    phase: 'preparing',
    progress: 0,
    failure: undefined,
    message: undefined,
  });

  // The store is persisted, so progress is written at most once per percent.
  let lastPercent = -1;
  const onProgress = (p: number) => {
    const clamped = Math.max(0, Math.min(1, p));
    const percent = Math.floor(clamped * 1000) / 10;
    if (percent === lastPercent) return;
    lastPercent = percent;
    const phase =
      clamped >= 0.999 ? 'posting' : isVideo && clamped < 0.4 ? 'preparing' : 'uploading';
    // Up to 97%: the last stretch is the create call ("Posting...").
    const shown = Math.min(0.97, clamped * 0.97);
    update(job.id, { phase, progress: shown });
    activity.progress(shown);
  };

  const params = resolveParams(job.params);
  if (!(await mediaStillThere(params))) {
    const message = i18n.t('feed:publish.failedMissing');
    update(job.id, { phase: 'failed', failure: 'missing', message });
    void haptic('error');
    void activity.finish('failed', message);
    analytics.capture(ANALYTICS_EVENTS.FEED.PUBLISH_QUEUE, {
      outcome: 'failed',
      failure: 'missing',
      post_type: job.params.postType,
    });
    return;
  }

  try {
    const { post, authorId } = await publishPost({ ...params, onProgress });
    update(job.id, { phase: 'posting', progress: 0.99 });
    applyPublishedPost(post, authorId, params);
    const postId = (post as { id?: string | number } | undefined)?.id;
    update(job.id, {
      phase: 'done',
      progress: 1,
      message: postId !== undefined ? String(postId) : undefined,
    });
    void haptic('success');
    const username = useAuthStore.getState().user?.username ?? '';
    void activity.finish('posted', i18n.t('feed:publish.posted', { username }));
    analytics.capture(ANALYTICS_EVENTS.FEED.PUBLISH_QUEUE, {
      outcome: 'posted',
      post_type: job.params.postType,
      ms: Date.now() - started,
    });
    setTimeout(() => remove(job.id), POSTED_VISIBLE_MS);
  } catch (error: unknown) {
    const { failure, message } = classify(error);
    update(job.id, { phase: 'failed', failure, message });
    void haptic('error');
    void activity.finish('failed', message);
    analytics.capture(ANALYTICS_EVENTS.FEED.PUBLISH_QUEUE, {
      outcome: 'failed',
      failure,
      post_type: job.params.postType,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

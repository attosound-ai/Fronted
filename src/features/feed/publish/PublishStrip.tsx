import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AudioLines, Type, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAuthStore } from '@/stores/authStore';
import { usePublishQueue, type PublishJob } from './publishQueueStore';

/**
 * Instagram's upload strip, at the top of the feed under the accounts row:
 * the post's thumbnail, a thin progress bar across the width, and one line
 * that says what is happening. Measured on Instagram (Sep 29 2026): the bar
 * alone for the first seconds, then "Keep Instagram open to finish posting
 * • 6.0%", then "Posting to <account>...", then "Posted to <account>." with a
 * View button for about five seconds, and the strip goes away with the new
 * post right below it. ATTO adds what Instagram lacks: a failed post says
 * why and offers Retry and Discard, so nothing is lost in silence.
 */
export function PublishStrip() {
  const jobs = usePublishQueue((s) => s.jobs);
  if (jobs.length === 0) return null;
  return (
    <View style={styles.list}>
      {jobs.map((job) => (
        <StripRow key={job.id} job={job} />
      ))}
    </View>
  );
}

/** The bar shows alone this long before the words appear, like Instagram. */
const WORDS_AFTER_MS = 1500;

function StripRow({ job }: { job: PublishJob }) {
  const { t } = useTranslation('feed');
  const username = useAuthStore((s) => s.user?.username) ?? '';
  const { retry, remove } = usePublishQueue.getState();
  const [wordsVisible, setWordsVisible] = useState(
    Date.now() - job.createdAt > WORDS_AFTER_MS
  );
  useEffect(() => {
    if (wordsVisible) return;
    const id = setTimeout(() => setWordsVisible(true), WORDS_AFTER_MS);
    return () => clearTimeout(id);
  }, [wordsVisible]);

  const percent = (job.progress * 100).toFixed(1);
  const failed = job.phase === 'failed' || job.phase === 'interrupted';
  const done = job.phase === 'done';

  let line = '';
  if (done) line = t('publish.posted', { username });
  else if (job.phase === 'failed') line = job.message ?? t('publish.failedOther');
  else if (job.phase === 'interrupted') line = t('publish.interrupted');
  else if (job.phase === 'posting') line = t('publish.posting', { username });
  else if (wordsVisible) line = t('publish.keepOpen', { percent });

  const onRetry = () => {
    void haptic('light');
    analytics.capture(ANALYTICS_EVENTS.FEED.PUBLISH_QUEUE, {
      outcome: 'retried',
      post_type: job.params.postType,
    });
    retry(job.id);
  };
  const onDiscard = () => {
    void haptic('light');
    analytics.capture(ANALYTICS_EVENTS.FEED.PUBLISH_QUEUE, {
      outcome: 'discarded',
      post_type: job.params.postType,
    });
    remove(job.id);
  };
  const onView = () => {
    void haptic('light');
    if (job.message) router.push(`/post/${job.message}`);
    remove(job.id);
  };

  return (
    <View style={styles.row} accessibilityLiveRegion="polite" accessibilityLabel={line}>
      <Thumbnail job={job} />
      <View style={styles.middle}>
        {line.length > 0 && (
          <Text
            variant="small"
            numberOfLines={2}
            style={[styles.line, failed && styles.lineFailed]}
          >
            {line}
          </Text>
        )}
        {!done && !failed && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, Number(percent))}%` }]} />
          </View>
        )}
      </View>
      {done && job.message && (
        <Pressable onPress={onView} accessibilityRole="button" style={styles.button}>
          <Text variant="small" style={styles.buttonText}>
            {t('publish.view')}
          </Text>
        </Pressable>
      )}
      {failed && (
        <>
          {job.failure !== 'too_large' && (
            <Pressable onPress={onRetry} accessibilityRole="button" style={styles.button}>
              <Text variant="small" style={styles.buttonText}>
                {t('publish.retry')}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={onDiscard}
            accessibilityRole="button"
            accessibilityLabel={t('publish.discard')}
            hitSlop={10}
            style={styles.discard}
          >
            <X size={18} color="rgba(255,255,255,0.7)" strokeWidth={2.25} />
          </Pressable>
        </>
      )}
    </View>
  );
}

function Thumbnail({ job }: { job: PublishJob }) {
  if (job.thumbnailUri) {
    return (
      <Image source={{ uri: job.thumbnailUri }} style={styles.thumb} resizeMode="cover" />
    );
  }
  const Icon = job.params.postType === 'audio' ? AudioLines : Type;
  return (
    <View style={[styles.thumb, styles.thumbIcon]}>
      <Icon size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
  },
  thumb: {
    width: 31,
    height: 56,
    borderRadius: 7,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  thumbIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  middle: {
    flex: 1,
    gap: 8,
    justifyContent: 'center',
  },
  line: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 14,
  },
  lineFailed: {
    color: 'rgba(255,255,255,0.9)',
  },
  track: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  button: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  discard: {
    width: 28,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

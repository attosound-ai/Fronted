import { useCallback, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

import { withTimeout } from '@/lib/net/connectivity';
import type { OverdubStem } from '../../../../modules/atto-recorder';
import type { AudioSegment } from '@/types/call';
import type { LocalClip } from '../types';

const DOWNLOAD_TIMEOUT_MS = 30_000;
/** Beyond this the take would wait too long on a slow link; skip the rest. */
const MAX_STEMS = 12;

/**
 * Local copies of the clips that should play while a take is recorded.
 *
 * The recorder plays them itself, on its own engine and on one shared anchor
 * time, so the take lines up. The timeline's JS playback must NOT run at the
 * same time: expo-audio activates the audio session synchronously on the main
 * thread, and doing that while the recorder owns the session freezes the app.
 */
export function useOverdubStems(
  segments: (AudioSegment & { downloadUrl: string })[],
  segmentDurationMs: Map<string, number>
) {
  const [preparing, setPreparing] = useState(false);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const durationsRef = useRef(segmentDurationMs);
  durationsRef.current = segmentDurationMs;

  const prepare = useCallback(
    async (clips: LocalClip[], excludeLane: number): Promise<OverdubStem[]> => {
      const wanted = clips
        .filter((c) => c.laneIndex !== excludeLane)
        .sort((a, b) => a.positionInTimeline - b.positionInTimeline)
        .slice(0, MAX_STEMS);
      if (wanted.length === 0) return [];
      setPreparing(true);
      const stems: OverdubStem[] = [];
      try {
        for (const clip of wanted) {
          const segment = segmentsRef.current.find((s) => s.id === clip.segmentId);
          const url = segment?.downloadUrl;
          if (!url) continue;
          let path = url;
          if (!url.startsWith('file://') && !url.startsWith('/')) {
            const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
            const safeExt = ext && ext.length <= 4 ? ext : 'wav';
            path = `${FileSystem.cacheDirectory}od-${clip.segmentId}.${safeExt}`;
            const info = await FileSystem.getInfoAsync(path);
            const cached =
              info.exists &&
              'size' in info &&
              typeof info.size === 'number' &&
              info.size > 1024;
            if (!cached) {
              await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
              const dl = await withTimeout(
                FileSystem.downloadAsync(url, path),
                DOWNLOAD_TIMEOUT_MS
              );
              if (dl.status < 200 || dl.status >= 300) {
                await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
                continue;
              }
            }
          }
          // The stem file holds the whole segment, so its first frame sits at
          // the clip's position minus whatever the clip trimmed off the head.
          stems.push({
            path,
            startMs: Math.max(0, clip.positionInTimeline - clip.startInSegment),
            gainDb: 0,
          });
        }
      } finally {
        setPreparing(false);
      }
      return stems;
    },
    []
  );

  return { prepare, preparing };
}

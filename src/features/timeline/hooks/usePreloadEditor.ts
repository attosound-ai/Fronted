import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/lib/api/projectService';
import type { TimelineClip } from '@/types/project';

const DEFAULT_SAMPLES = 100;

export function usePreloadEditor(clips: TimelineClip[]) {
  const queryClient = useQueryClient();
  const [isPreloading, setIsPreloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const preloadEditor = useCallback(async () => {
    const uniqueSegmentIds = [...new Set(clips.map((c) => c.segmentId))];

    if (uniqueSegmentIds.length === 0) return;

    setIsPreloading(true);
    setProgress(0);

    try {
      // Batch-fetch all waveforms in a single API call
      const waveforms = await projectService.getWaveformsBatch(
        uniqueSegmentIds,
        DEFAULT_SAMPLES
      );

      // Populate React Query cache for each segment
      // Key matches exactly what useWaveformData uses: ['waveform', segmentId, 100]
      let loaded = 0;
      for (const segmentId of uniqueSegmentIds) {
        if (waveforms[segmentId]) {
          queryClient.setQueryData(
            ['waveform', segmentId, DEFAULT_SAMPLES],
            waveforms[segmentId]
          );
        }
        loaded++;
        setProgress(loaded / uniqueSegmentIds.length);
      }
    } catch {
      // Fallback: individual prefetches if batch fails
      let loaded = 0;
      await Promise.allSettled(
        uniqueSegmentIds.map(async (id) => {
          await queryClient.prefetchQuery({
            queryKey: ['waveform', id, DEFAULT_SAMPLES],
            queryFn: () => projectService.getWaveform(id, DEFAULT_SAMPLES),
            staleTime: Infinity,
          });
          loaded++;
          setProgress(loaded / uniqueSegmentIds.length);
        })
      );
    } finally {
      setIsPreloading(false);
    }
  }, [clips, queryClient]);

  return { isPreloading, progress, preloadEditor };
}

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/lib/api/projectService';
import { emitTelemetryMarker } from '@/lib/telemetry/callTelemetry';
import type { TimelineClip } from '@/types/project';
import { WAVEFORM_PEAKS } from './useWaveformData';

// Single source of truth for the peak count so the cache key seeded here is
// exactly the one useWaveformData reads.
const DEFAULT_SAMPLES = WAVEFORM_PEAKS;

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
      // Key matches exactly what useWaveformData uses: ['waveform', segmentId, WAVEFORM_PEAKS]
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
      // Memory attribution: waveform arrays (many segments × samples) are a prime
      // suspect for the in-call OOM. No-op off a call.
      void emitTelemetryMarker('waveforms_loaded', {
        segment_count: uniqueSegmentIds.length,
        samples: DEFAULT_SAMPLES,
      });
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

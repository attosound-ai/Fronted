import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { projectService } from '@/lib/api/projectService';

/**
 * Peak buckets fetched per segment. ONE dense envelope per segment, fetched
 * once (staleTime Infinity) and downsampled locally by WaveformView for
 * whatever width/zoom is on screen, so zooming never refetches and never looks
 * coarse. 2000 buckets = ~1 bucket per 4px on a 25-minute clip at max zoom and
 * ~16KB of numbers per segment. The old value was 100, which the DAW-reference
 * comparison exposed as a featureless blur. The backend caps at 4000.
 *
 * Every waveform query key MUST use this constant (usePreloadEditor seeds the
 * cache with it) or the preload and the live fetch silently miss each other.
 */
export const WAVEFORM_PEAKS = 2000;

export function useWaveformData(segmentId: string, samples = WAVEFORM_PEAKS) {
  return useQuery({
    queryKey: ['waveform', segmentId, samples],
    queryFn: () => projectService.getWaveform(segmentId, samples),
    enabled: !!segmentId,
    staleTime: Infinity, // Waveform data doesn't change
    placeholderData: keepPreviousData,
  });
}

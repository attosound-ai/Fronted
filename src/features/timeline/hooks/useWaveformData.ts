import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { projectService } from '@/lib/api/projectService';

const DEFAULT_SAMPLES = 100;

export function useWaveformData(segmentId: string, samples = DEFAULT_SAMPLES) {
  return useQuery({
    queryKey: ['waveform', segmentId, samples],
    queryFn: () => projectService.getWaveform(segmentId, samples),
    enabled: !!segmentId,
    staleTime: Infinity, // Waveform data doesn't change
    placeholderData: keepPreviousData,
  });
}

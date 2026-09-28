import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { projectService } from '@/lib/api/projectService';
import type { LocalClip } from '../types';
import { peaksParaDuracion } from './useWaveformData';

/**
 * One dense envelope per segment (same query key as useWaveformData, so
 * the preload seeds it), sliced to each clip's trimmed window. The native
 * timeline view downsamples per zoom itself, so JS only hands over the
 * clip's own slice of the segment peaks.
 */
export function useClipPeaks(
  clips: LocalClip[],
  segmentDurationMs: Map<string, number>
): Map<string, number[]> {
  const segmentIds = useMemo(
    () => Array.from(new Set(clips.map((c) => c.segmentId))).sort(),
    [clips]
  );
  // La resolución la manda la duración del segmento, no un número fijo: un
  // clip largo necesita muchos más picos para que al ampliar siga habiendo
  // forma que dibujar. La clave lleva el número, así que dos segmentos de
  // duraciones distintas no se pisan la caché.
  const results = useQueries({
    queries: segmentIds.map((segmentId) => {
      const picos = peaksParaDuracion(segmentDurationMs.get(segmentId));
      return {
        queryKey: ['waveform', segmentId, picos],
        queryFn: () => projectService.getWaveform(segmentId, picos),
        staleTime: Infinity,
      };
    }),
  });
  // A fingerprint of which segments have data, so the map below is rebuilt
  // when an envelope arrives and not on every render. A spread dependency
  // array is not allowed: its length must stay fixed.
  const loadedKey = results.map((r) => (r.data ? r.data.length : 0)).join(',');
  const peaksBySegment = useMemo(() => {
    const map = new Map<string, number[]>();
    segmentIds.forEach((id, i) => {
      const data = results[i]?.data;
      if (data && data.length > 0) map.set(id, data);
    });
    return map;
    // `results` is a new array every render; `loadedKey` is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentIds, loadedKey]);

  return useMemo(() => {
    const out = new Map<string, number[]>();
    for (const clip of clips) {
      const full = peaksBySegment.get(clip.segmentId);
      if (!full) continue;
      const total = segmentDurationMs.get(clip.segmentId) ?? clip.endInSegment;
      if (total <= 0) continue;
      const lo = Math.max(0, Math.floor((clip.startInSegment / total) * full.length));
      const hi = Math.min(
        full.length,
        Math.max(lo + 1, Math.ceil((clip.endInSegment / total) * full.length))
      );
      out.set(clip.id, full.slice(lo, hi));
    }
    return out;
  }, [clips, peaksBySegment, segmentDurationMs]);
}

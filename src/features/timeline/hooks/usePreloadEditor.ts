import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { projectService } from '@/lib/api/projectService';
import { emitTelemetryMarker } from '@/lib/telemetry/callTelemetry';
import type { TimelineClip } from '@/types/project';
import { peaksParaDuracion } from './useWaveformData';
import { WAVEFORM_KEY } from '../utils/waveformKeys';

/**
 * El número de picos ya no es fijo: depende de la duración del segmento, para
 * que un audio largo no se quede sin forma al ampliar. Aquí solo conocemos el
 * tramo que usa cada clip (`endInSegment`), que es una cota inferior de la
 * duración del segmento, y con eso basta: si la cota se queda corta, la
 * petición en vivo pedirá su número y esta siembra simplemente no se
 * aprovechará, que es el mismo caso que cuando no hay precargado. Lo que NO
 * puede pasar es sembrar con una clave que nadie lee, así que se agrupa por
 * número y se siembra exactamente la clave que luego se pide.
 */
function picosDeClips(clips: TimelineClip[], segmentId: string): number {
  let masLargo = 0;
  for (const c of clips) {
    if (c.segmentId === segmentId && c.endInSegment > masLargo) masLargo = c.endInSegment;
  }
  return peaksParaDuracion(masLargo);
}

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
      // Una tanda por cada resolución distinta: el lote manda un solo número
      // para todos, así que los segmentos que piden más van en su propia
      // llamada en vez de sembrar una clave equivocada.
      const porPicos = new Map<number, string[]>();
      for (const id of uniqueSegmentIds) {
        const n = picosDeClips(clips, id);
        porPicos.set(n, [...(porPicos.get(n) ?? []), id]);
      }
      const waveforms: Record<string, number[]> = {};
      const picosPorSegmento = new Map<string, number>();
      for (const [n, ids] of porPicos) {
        const tanda = await projectService.getWaveformsBatch(ids, n);
        for (const id of ids) {
          if (tanda[id]) waveforms[id] = tanda[id];
          picosPorSegmento.set(id, n);
        }
      }

      // Populate React Query cache for each segment
      // Key matches exactly what useWaveformData uses: [WAVEFORM_KEY, segmentId, WAVEFORM_PEAKS]
      let loaded = 0;
      for (const segmentId of uniqueSegmentIds) {
        if (waveforms[segmentId]) {
          queryClient.setQueryData(
            [WAVEFORM_KEY, segmentId, picosPorSegmento.get(segmentId)],
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
        // Ya no es un número único: se manda el mayor, que es el que marca el
        // coste de memoria que este marcador vigila.
        samples: Math.max(...picosPorSegmento.values(), 0),
      });
    } catch {
      // Fallback: individual prefetches if batch fails
      let loaded = 0;
      await Promise.allSettled(
        uniqueSegmentIds.map(async (id) => {
          const n = picosDeClips(clips, id);
          await queryClient.prefetchQuery({
            queryKey: [WAVEFORM_KEY, id, n],
            queryFn: () => projectService.getWaveform(id, n),
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

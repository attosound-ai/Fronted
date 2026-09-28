import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';

import { projectService } from '@/lib/api/projectService';
import type { LocalClip } from '../types';
import { peaksParaDuracion } from './useWaveformData';
import { DETALLE_PICOS, necesitaDetalle, ventanaDeDetalle } from '../utils/detailWindow';

export interface DetallePicos {
  peaks: number[];
  /** El tramo que cubren, en ms desde el principio del CLIP. */
  startMs: number;
  endMs: number;
}

export interface RangoVisible {
  /** En tiempo de la línea de tiempo, no del segmento. */
  startMs: number;
  endMs: number;
}

/**
 * Picos a resolución de pantalla del trozo que se está mirando, para cuando la
 * envolvente del segmento se queda sin puntos que dar.
 *
 * Solo entra en juego a partir de DETALLE_DESDE_PPS y solo para los clips que
 * de verdad lo necesitan (ver `necesitaDetalle`): un clip corto tiene picos de
 * sobra y sigue con su envolvente de siempre. Mientras la ventana no ha
 * llegado, el clip también sigue con su envolvente, así que ampliar nunca deja
 * un hueco ni parpadea.
 *
 * Lo que cuesta: una petición por ventana, de unos veinte kilobytes, y el
 * servidor la resuelve leyendo solo esos bytes del archivo (wav-window.ts en
 * telephony). Desplazarse dentro de la pantalla no pide nada porque la ventana
 * va cuadrada a una rejilla.
 */
export function useDetailPeaks(
  clips: LocalClip[],
  segmentDurationMs: Map<string, number>,
  pixelsPerSecond: number,
  visible: RangoVisible | null
): Map<string, DetallePicos> {
  // Qué pedir: una entrada por clip visible que no llegue a resolución.
  const peticiones = useMemo(() => {
    if (!visible) return [];
    const lista: {
      clipId: string;
      segmentId: string;
      fromRatio: number;
      toRatio: number;
      /** Relativo al principio del clip, que es como lo quiere la vista nativa. */
      startMs: number;
      endMs: number;
    }[] = [];

    for (const clip of clips) {
      const segDur = segmentDurationMs.get(clip.segmentId) ?? 0;
      if (segDur <= 0) continue;
      if (!necesitaDetalle(segDur, peaksParaDuracion(segDur), pixelsPerSecond)) continue;

      const largo = clip.endInSegment - clip.startInSegment;
      if (largo <= 0) continue;
      const inicioEnLinea = clip.positionInTimeline;
      // Lo visible, llevado a tiempo del segmento.
      const desdeSeg = clip.startInSegment + (visible.startMs - inicioEnLinea);
      const hastaSeg = clip.startInSegment + (visible.endMs - inicioEnLinea);
      const ventana = ventanaDeDetalle(
        desdeSeg,
        hastaSeg,
        clip.startInSegment,
        clip.endInSegment
      );
      if (!ventana) continue;

      lista.push({
        clipId: clip.id,
        segmentId: clip.segmentId,
        // Seis decimales, los mismos con los que el servidor arma su clave de
        // caché: pedir el mismo tramo con más precisión sería otra entrada.
        fromRatio: Number((ventana.startMs / segDur).toFixed(6)),
        toRatio: Number((ventana.endMs / segDur).toFixed(6)),
        startMs: ventana.startMs - clip.startInSegment,
        endMs: ventana.endMs - clip.startInSegment,
      });
    }
    return lista;
  }, [clips, segmentDurationMs, pixelsPerSecond, visible]);

  const results = useQueries({
    queries: peticiones.map((p) => ({
      queryKey: ['waveform-detail', p.segmentId, DETALLE_PICOS, p.fromRatio, p.toRatio],
      queryFn: () =>
        projectService.getWaveform(p.segmentId, DETALLE_PICOS, p.fromRatio, p.toRatio),
      staleTime: Infinity,
      // Media hora en memoria: al volver sobre el mismo sitio se pinta sin red.
      gcTime: 30 * 60_000,
      retry: 1,
    })),
  });

  const listo = results.map((r) => (r.data ? r.data.length : 0)).join(',');
  return useMemo(() => {
    const out = new Map<string, DetallePicos>();
    peticiones.forEach((p, i) => {
      const data = results[i]?.data;
      if (data && data.length > 0) {
        out.set(p.clipId, { peaks: data, startMs: p.startMs, endMs: p.endMs });
      }
    });
    return out;
    // `results` es un array nuevo en cada render; `listo` es lo que cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peticiones, listo]);
}

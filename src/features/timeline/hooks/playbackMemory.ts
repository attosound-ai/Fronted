/**
 * La memoria a cada paso de darle a reproducir.
 *
 * El 28 de septiembre de 2026 se midió en el teléfono: reproducir un proyecto
 * de 41 minutos sube la memoria de 240 MB a 1185 en menos de diez segundos y
 * el sistema mata la app. Con un proyecto de 11 segundos no se mueve un mega.
 * Tres veces seguidas, con el zoom al tope y con el zoom por defecto, así que
 * lo que manda es la duración del audio y no lo que se dibuja.
 *
 * Lo que el total NO dice es qué paso la gasta. Esto marca la memoria en cada
 * uno, con la duración del segmento de cada pista al lado, y manda una sola
 * fila por pulsación de play.
 */
import DeviceInfo from 'react-native-device-info';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

const MB = 1024 * 1024;

/** Megabytes en uso, o null si el sistema no lo sabe decir. */
export async function memoriaMB(): Promise<number | null> {
  try {
    const bytes = await DeviceInfo.getUsedMemory();
    return Number.isFinite(bytes) ? Math.round(bytes / MB) : null;
  } catch {
    return null;
  }
}

export interface PasoDeMemoria {
  paso: string;
  mb: number | null;
  msDesdeElPlay: number;
}

/**
 * Un recorrido de medidas. Se crea al pulsar play y se cierra cuando ya ha
 * sonado un rato; si la pulsación se cancela antes, no manda nada.
 */
export class RecorridoDeMemoria {
  private readonly pasos: PasoDeMemoria[] = [];
  private readonly t0 = Date.now();
  private cerrado = false;

  constructor(
    private readonly contexto: {
      projectId: string;
      totalDurationMs: number;
      laneCount: number;
      clipCount: number;
    }
  ) {}

  async marcar(paso: string): Promise<void> {
    if (this.cerrado) return;
    this.pasos.push({
      paso,
      mb: await memoriaMB(),
      msDesdeElPlay: Date.now() - this.t0,
    });
  }

  cancelar(): void {
    this.cerrado = true;
  }

  cerrar(extra: Record<string, unknown> = {}): void {
    if (this.cerrado || this.pasos.length === 0) return;
    this.cerrado = true;
    const conNumero = this.pasos.filter((p) => p.mb !== null);
    const primero = conNumero[0]?.mb ?? null;
    const ultimo = conNumero[conNumero.length - 1]?.mb ?? null;
    analytics.capture(ANALYTICS_EVENTS.PROJECT.PLAYBACK_MEMORY, {
      project_id: this.contexto.projectId,
      total_duration_ms: this.contexto.totalDurationMs,
      lane_count: this.contexto.laneCount,
      clip_count: this.contexto.clipCount,
      mb_start: primero,
      mb_end: ultimo,
      mb_growth: primero !== null && ultimo !== null ? ultimo - primero : null,
      steps: this.pasos.map((p) => `${p.paso}:${p.mb ?? '?'}@${p.msDesdeElPlay}`),
      ...extra,
    });
  }
}

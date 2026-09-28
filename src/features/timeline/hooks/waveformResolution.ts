/**
 * Cuántos picos pedir para un segmento, en función de su duración.
 *
 * Sin dependencias a propósito, para poder probarlo.
 *
 * El fallo que esto arregla: el número era fijo, 2000 para todo. Sirve para un
 * minuto y se queda ciego en cuanto el audio es largo. En un archivo de 35
 * minutos cada pico cubría 1,05 segundos, así que al ampliar la vista a doce
 * segundos la capa nativa recibía ONCE picos para toda la pantalla y dibujaba
 * una rampa y una recta. El cliente lo describió como "esa onda se ve rara"
 * (28 de septiembre de 2026).
 *
 * Un pico cada 15 ms, con suelo para los clips cortos y techo para no mandar
 * megas de números. Con el techo, 35 minutos dan 87 ms por pico: 137 puntos en
 * una pantalla de doce segundos, contra los once de antes.
 *
 * El techo NO puede pasar de lo que el backend acepta (24000) o se sembraría
 * una clave de caché con un número que la respuesta no cumple.
 */
const MS_POR_PICO = 15;
export const WAVEFORM_PEAKS_MIN = 2000;
export const WAVEFORM_PEAKS_MAX = 24000;

export function peaksParaDuracion(durationMs: number | undefined): number {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return WAVEFORM_PEAKS_MIN;
  }
  const ideal = Math.round(durationMs / MS_POR_PICO);
  return Math.min(WAVEFORM_PEAKS_MAX, Math.max(WAVEFORM_PEAKS_MIN, ideal));
}

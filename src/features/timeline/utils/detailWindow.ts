/**
 * La ventana de detalle: qué trozo de un segmento hay que pedir con más
 * resolución cuando el zoom es más profundo de lo que su envolvente aguanta.
 *
 * El problema. La envolvente de un segmento se pide UNA vez, con un pico cada
 * 15 ms (waveformResolution). Eso dibuja de maravilla mientras un pico ocupe
 * menos de un punto de pantalla, y deja de dibujar en cuanto ocupa varios: a
 * 400 puntos por segundo cada pico mide 6 puntos y la onda se vuelve una
 * escalera. Por eso el zoom no podía pasar de ahí.
 *
 * La solución es la de cualquier editor de audio: cuando se amplía mucho ya no
 * se dibuja el archivo entero, se dibuja lo que se ve, y eso sí se puede pedir
 * a resolución de pantalla porque son décimas de segundo. Aquí vive la parte
 * que decide cuándo hace falta y qué tramo exacto pedir.
 *
 * Todo puro y sin dependencias, para poder probarlo.
 */

/** Picos por ventana. Tres pantallas a poco menos de un punto por pico. */
export const DETALLE_PICOS = 2048;

/**
 * A partir de este zoom se mira si hace falta detalle. Por debajo ni se
 * pregunta: la envolvente del segmento da de sobra y no hay que gastar ni una
 * petición ni un renderizado siguiendo el desplazamiento.
 */
export const DETALLE_DESDE_PPS = 200;

/**
 * Cuántos puntos de pantalla puede ocupar un pico antes de que se note la
 * escalera. Dos es generoso: a un punto por pico la curva es continua, y a dos
 * todavía no se ven los escalones en una pantalla de 3x.
 */
export const DETALLE_PT_POR_PICO = 2;

/** Cuántos ms cubre cada pico de la envolvente de un segmento. */
export function msPorPico(segmentDurationMs: number, picos: number): number {
  if (!(segmentDurationMs > 0) || !(picos > 0)) return 0;
  return segmentDurationMs / picos;
}

/** Si a este zoom la envolvente del segmento ya no tiene puntos que dar. */
export function necesitaDetalle(
  segmentDurationMs: number,
  picos: number,
  pixelsPerSecond: number
): boolean {
  if (!(pixelsPerSecond >= DETALLE_DESDE_PPS)) return false;
  const ms = msPorPico(segmentDurationMs, picos);
  if (ms <= 0) return false;
  return (ms * pixelsPerSecond) / 1000 > DETALLE_PT_POR_PICO;
}

export interface Ventana {
  /** Inicio dentro del SEGMENTO, en ms. */
  startMs: number;
  endMs: number;
}

/**
 * La ventana a pedir: tres veces lo que se ve, con lo visible en medio, y
 * cuadrada a una rejilla.
 *
 * La rejilla es lo que hace que esto sea viable. Sin ella cada píxel de
 * desplazamiento sería un tramo distinto, o sea una petición distinta y una
 * entrada de caché distinta, y desplazarse costaría cientos de peticiones. Con
 * el paso cuadrado a una potencia de dos de milisegundos, desplazarse dentro
 * de la pantalla no pide nada, y salirse pide exactamente una.
 *
 * Devuelve null si lo que se ve no toca al segmento.
 */
export function ventanaDeDetalle(
  visibleStartMs: number,
  visibleEndMs: number,
  limiteInicioMs: number,
  limiteFinMs: number
): Ventana | null {
  const ancho = visibleEndMs - visibleStartMs;
  if (!(ancho > 0)) return null;
  if (visibleEndMs <= limiteInicioMs || visibleStartMs >= limiteFinMs) return null;

  // Paso: la potencia de dos de ms más cercana por arriba al ancho visible.
  // Así el paso solo cambia una vez por octava de zoom y no en cada pellizco.
  const paso = 2 ** Math.ceil(Math.log2(Math.max(1, ancho)));
  const k = Math.floor(visibleStartMs / paso);
  const startMs = Math.max(limiteInicioMs, (k - 1) * paso);
  const endMs = Math.min(limiteFinMs, (k + 2) * paso);
  if (!(endMs > startMs)) return null;
  return { startMs, endMs };
}

/**
 * Si vale la pena pedir detalle MIENTRAS SUENA a este zoom.
 *
 * Reproduciendo, la vista sigue a la cabeza. Si una pantalla dura menos de un
 * segundo, pasa volando y el detalle no se puede leer; pedirlo sería una
 * ventana nueva cada pocos cientos de milisegundos, con su petición, su
 * renderizado del editor y su cruce a nativo, para nada. Medido el 28 de
 * septiembre de 2026: al tope, sonando, la memoria subía unos 50 MB por
 * minuto solo por ese churn. En pausa el detalle vuelve enseguida.
 */
export function detalleMientrasSuena(
  pixelsPerSecond: number,
  laneWidthPx: number
): boolean {
  if (!(pixelsPerSecond > 0) || !(laneWidthPx > 0)) return false;
  return (laneWidthPx / pixelsPerSecond) * 1000 >= 1000;
}

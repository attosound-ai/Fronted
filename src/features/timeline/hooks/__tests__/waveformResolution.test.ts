import test from 'node:test';
import assert from 'node:assert/strict';

import {
  peaksParaDuracion,
  WAVEFORM_PEAKS_MIN,
  WAVEFORM_PEAKS_MAX,
} from '../waveformResolution';

// Lo que se fija aquí no es un número bonito, es que la resolución SIGA a la
// duración. El fallo que arregla esto fue tener 2000 picos para todo: en 35
// minutos cada pico cubría 1,05 s y la onda se dibujaba como una recta.

const msPorPico = (durMs: number) => durMs / peaksParaDuracion(durMs);

test('un clip corto no baja del suelo', () => {
  assert.equal(peaksParaDuracion(5_000), WAVEFORM_PEAKS_MIN);
  assert.equal(peaksParaDuracion(1), WAVEFORM_PEAKS_MIN);
});

test('un clip largo no pasa del techo', () => {
  assert.equal(peaksParaDuracion(60 * 60_000), WAVEFORM_PEAKS_MAX);
});

test('entre medias, un pico cada 15 ms', () => {
  assert.equal(peaksParaDuracion(60_000), 4000);
  assert.equal(peaksParaDuracion(120_000), 8000);
});

test('la resolución nunca empeora al crecer la duración', () => {
  // Esta es la propiedad que de verdad importa: más largo nunca puede dar
  // menos picos que más corto.
  let previo = 0;
  for (const min of [0.5, 1, 2, 5, 10, 20, 35, 60, 120]) {
    const n = peaksParaDuracion(min * 60_000);
    assert.ok(n >= previo, `${min} min dio ${n}, menos que el anterior ${previo}`);
    previo = n;
  }
});

test('el caso del cliente mejora de forma medible', () => {
  // 35 minutos, la vista ampliada a 12 segundos.
  const dur = 35 * 60_000;
  const antes = dur / 2000; // el número fijo de antes
  const ahora = msPorPico(dur);
  assert.ok(antes > 1000, `antes eran ${antes.toFixed(0)} ms por pico`);
  assert.ok(ahora < 100, `ahora son ${ahora.toFixed(0)} ms por pico`);
  const picosEnPantalla = 12_000 / ahora;
  assert.ok(
    picosEnPantalla > 100,
    `solo ${picosEnPantalla.toFixed(0)} picos en pantalla`
  );
});

test('nunca se piden más picos de los que el backend acepta', () => {
  // El backend recorta a 24000; pedir más sería sembrar una clave de caché que
  // no se corresponde con lo que devuelve.
  for (const min of [1, 10, 35, 90, 600]) {
    assert.ok(peaksParaDuracion(min * 60_000) <= 24_000);
  }
});

test('una duración ausente o absurda cae al suelo', () => {
  assert.equal(peaksParaDuracion(undefined), WAVEFORM_PEAKS_MIN);
  assert.equal(peaksParaDuracion(0), WAVEFORM_PEAKS_MIN);
  assert.equal(peaksParaDuracion(-10), WAVEFORM_PEAKS_MIN);
  assert.equal(peaksParaDuracion(NaN), WAVEFORM_PEAKS_MIN);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  necesitaDetalle,
  msPorPico,
  ventanaDeDetalle,
  detalleMientrasSuena,
  DETALLE_DESDE_PPS,
} from '../detailWindow';

// El caso real: un segmento de 35 minutos con el techo de picos (24000), que
// es un pico cada 87 ms.
const LARGO = 35 * 60_000;
const PICOS = 24000;

test('msPorPico dice lo que cubre cada valor de la envolvente', () => {
  assert.ok(Math.abs(msPorPico(LARGO, PICOS) - 87.5) < 0.01);
  assert.equal(msPorPico(0, PICOS), 0);
  assert.equal(msPorPico(LARGO, 0), 0);
});

test('a zoom normal la envolvente del segmento basta y no se pide nada', () => {
  // 25 puntos por segundo, que es como abre el editor.
  assert.equal(necesitaDetalle(LARGO, PICOS, 25), false);
  // Y justo por debajo del umbral tampoco se pregunta.
  assert.equal(necesitaDetalle(LARGO, PICOS, DETALLE_DESDE_PPS - 1), false);
});

test('a zoom profundo un pico ocupa varios puntos y ahí sí hace falta', () => {
  // 400 pt/s era el techo viejo: 87,5 ms por pico son 35 puntos por pico.
  assert.equal(necesitaDetalle(LARGO, PICOS, 400), true);
  assert.equal(necesitaDetalle(LARGO, PICOS, 2000), true);
});

test('un segmento corto tiene picos de sobra y no necesita detalle', () => {
  // 10 s con el suelo de 2000 picos son 5 ms por pico: a 400 pt/s son 2
  // puntos por pico, justo en el límite, así que todavía no.
  assert.equal(necesitaDetalle(10_000, 2000, 400), false);
  // Al doble de zoom sí.
  assert.equal(necesitaDetalle(10_000, 2000, 800), true);
});

test('la ventana cubre tres pantallas con lo visible dentro', () => {
  const v = ventanaDeDetalle(10_000, 10_200, 0, LARGO)!;
  assert.ok(v.startMs <= 10_000, 'empieza antes de lo visible');
  assert.ok(v.endMs >= 10_200, 'acaba después de lo visible');
  // El paso es la potencia de dos por encima de 200 ms, o sea 256.
  assert.equal(v.endMs - v.startMs, 256 * 3);
});

test('desplazarse dentro de la pantalla no cambia la ventana', () => {
  const a = ventanaDeDetalle(10_000, 10_200, 0, LARGO)!;
  const b = ventanaDeDetalle(10_050, 10_250, 0, LARGO)!;
  assert.deepEqual(a, b, 'un desplazamiento pequeño repite la misma petición');
});

test('salirse del tramo pide la siguiente ventana, no una cualquiera', () => {
  const a = ventanaDeDetalle(10_000, 10_200, 0, LARGO)!;
  const b = ventanaDeDetalle(10_400, 10_600, 0, LARGO)!;
  assert.notDeepEqual(a, b);
  assert.equal(b.startMs - a.startMs, 256);
});

test('la ventana nunca se sale del tramo que cubre el clip', () => {
  const v = ventanaDeDetalle(5_000, 5_200, 4_900, 5_150)!;
  assert.equal(v.startMs, 4_900);
  assert.equal(v.endMs, 5_150);
});

test('lo que no se ve no se pide', () => {
  assert.equal(ventanaDeDetalle(10_000, 10_200, 20_000, 30_000), null);
  assert.equal(ventanaDeDetalle(40_000, 40_200, 20_000, 30_000), null);
  assert.equal(ventanaDeDetalle(10_000, 10_000, 0, LARGO), null);
});

test('sonando, el detalle solo se pide si la pantalla dura al menos un segundo', () => {
  // Zona de pistas de 312 puntos. A 200 pt/s la pantalla dura 1,56 s: sí.
  assert.equal(detalleMientrasSuena(200, 312), true);
  // A 312 pt/s dura justo un segundo: todavía sí.
  assert.equal(detalleMientrasSuena(312, 312), true);
  // A 400 pt/s dura 0,78 s: pasa volando, no.
  assert.equal(detalleMientrasSuena(400, 312), false);
  // Al tope, 4000 pt/s, 78 ms por pantalla: ni hablar.
  assert.equal(detalleMientrasSuena(4000, 312), false);
  assert.equal(detalleMientrasSuena(0, 312), false);
});

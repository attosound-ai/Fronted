import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fitZoomFor,
  zoomFloorFor,
  clampZoom,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_FLOOR,
} from '../zoomRange';

// Lo que se fija aquí es que el suelo del zoom lo mande la DURACIÓN y no una
// constante. El fallo que arregla esto lo reportó Anthony el 28 de septiembre
// de 2026: "we still can't zoom out enough to see an entire track or album".
//
// La zona de pistas de un iPhone 15 Pro Max: 430 de ancho, 110 de paneles y 8
// de margen. A zoom 1 son 100 puntos por segundo.
const ZONA = 430 - 110 - 8;
const pps = (nivel: number) => nivel * 100;

test('fitZoomFor mete el proyecto entero en la zona de pistas', () => {
  // 60 s en 312 puntos son 5,2 puntos por segundo.
  assert.ok(Math.abs(pps(fitZoomFor(60_000, ZONA)) - 5.2) < 1e-6);
});

test('fitZoomFor sirve a 35 minutos, que es lo que el suelo viejo no podía', () => {
  const nivel = fitZoomFor(35 * 60_000, ZONA);
  // Cabe clavado, al punto.
  assert.ok(Math.abs(35 * 60 * pps(nivel) - ZONA) < 1e-3);
  // Y está muy por debajo de donde el botón de menos se paraba.
  assert.ok(nivel < ZOOM_MIN);
});

test('fitZoomFor nunca pasa del suelo absoluto', () => {
  assert.equal(fitZoomFor(24 * 60 * 60_000, ZONA), ZOOM_FLOOR);
});

test('sin duración o sin ancho no hay nada que encajar', () => {
  assert.equal(fitZoomFor(0, ZONA), ZOOM_MAX);
  assert.equal(fitZoomFor(60_000, 0), ZOOM_MAX);
  assert.equal(fitZoomFor(Number.NaN, ZONA), ZOOM_MAX);
  assert.equal(fitZoomFor(60_000, Number.NaN), ZOOM_MAX);
});

test('un proyecto corto conserva exactamente el rango de siempre', () => {
  assert.equal(zoomFloorFor(20_000, ZONA), ZOOM_MIN);
});

test('uno más largo que una pantalla a ZOOM_MIN sí abre el suelo', () => {
  assert.ok(zoomFloorFor(60_000, ZONA) < ZOOM_MIN);
  assert.equal(zoomFloorFor(60_000, ZONA), fitZoomFor(60_000, ZONA));
});

test('antes de medir la pantalla el suelo se queda en ZOOM_MIN', () => {
  assert.equal(zoomFloorFor(35 * 60_000, 0), ZOOM_MIN);
});

test('clampZoom mantiene el techo y aguanta un número roto', () => {
  assert.equal(clampZoom(99), ZOOM_MAX);
  assert.equal(clampZoom(Number.NaN), ZOOM_MIN);
});

test('clampZoom ya no pone el suelo en ZOOM_MIN: eso lo hace el suelo por proyecto', () => {
  assert.equal(clampZoom(0.01), 0.01);
  assert.equal(clampZoom(0), ZOOM_FLOOR);
});

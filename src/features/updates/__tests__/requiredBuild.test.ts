import test from 'node:test';
import assert from 'node:assert/strict';

import { debeActualizar } from '../releaseGate';

// La regla importante no es cuándo bloquea, sino cuándo NO debe bloquear: un
// dato ausente o raro no puede dejar a nadie fuera de su propia app.

test('bloquea cuando el build es menor que el mínimo', () => {
  assert.equal(debeActualizar(220, 224), true);
});

test('no bloquea cuando el build es el mínimo o mayor', () => {
  assert.equal(debeActualizar(224, 224), false);
  assert.equal(debeActualizar(230, 224), false);
});

test('sin mínimo configurado no bloquea a nadie', () => {
  assert.equal(debeActualizar(220, 0), false);
  assert.equal(debeActualizar(220, -5), false);
  assert.equal(debeActualizar(220, NaN), false);
});

test('si no sabemos qué build somos, no bloquea', () => {
  // nativeBuildVersion puede venir vacío; bloquear a ciegas dejaría fuera a
  // todo el mundo sin forma de volver.
  assert.equal(debeActualizar(0, 224), false);
  assert.equal(debeActualizar(NaN, 224), false);
});

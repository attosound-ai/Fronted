import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUBBLE_EFFECTS,
  SCREEN_EFFECTS,
  EFFECT_DURATION_MS,
  balloonParticles,
  celebrationParticles,
  confettiParticles,
  echoCopies,
  effectFromMetadata,
  fireworkBursts,
  hasEffectPlayed,
  heartParticles,
  laserBeams,
  makeRandom,
  markEffectPlayed,
  resetPlayedEffects,
  seedFromId,
} from '../effectCatalog';

test('every effect has a duration', () => {
  for (const name of [...BUBBLE_EFFECTS, ...SCREEN_EFFECTS]) {
    assert.equal(typeof EFFECT_DURATION_MS[name], 'number');
  }
  // Invisible ink waits for a tap instead of ending on its own.
  assert.equal(EFFECT_DURATION_MS.invisible, 0);
});

test('effectFromMetadata only accepts a known kind and name', () => {
  assert.deepEqual(effectFromMetadata({ effect: { kind: 'bubble', name: 'slam' } }), {
    kind: 'bubble',
    name: 'slam',
  });
  assert.deepEqual(effectFromMetadata({ effect: { kind: 'screen', name: 'confetti' } }), {
    kind: 'screen',
    name: 'confetti',
  });
  assert.equal(
    effectFromMetadata({ effect: { kind: 'bubble', name: 'confetti' } }),
    null
  );
  assert.equal(effectFromMetadata({ effect: { kind: 'other', name: 'slam' } }), null);
  assert.equal(effectFromMetadata({ effect: 'slam' }), null);
  assert.equal(effectFromMetadata({}), null);
  assert.equal(effectFromMetadata(null), null);
  assert.equal(effectFromMetadata('nonsense'), null);
});

test('the random source is deterministic and inside 0 to 1', () => {
  const a = makeRandom(42);
  const b = makeRandom(42);
  for (let i = 0; i < 50; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(makeRandom(1)(), makeRandom(2)());
});

test('seedFromId is stable and never zero', () => {
  assert.equal(seedFromId('abc'), seedFromId('abc'));
  assert.notEqual(seedFromId('abc'), seedFromId('abd'));
  assert.ok(seedFromId('') > 0);
});

test('confetti falls from above with a finite life', () => {
  const particles = confettiParticles(seedFromId('m1'));
  assert.equal(particles.length, 70);
  assert.deepEqual(particles, confettiParticles(seedFromId('m1')));
  for (const p of particles) {
    assert.ok(p.y < 0, 'starts above the screen');
    assert.ok(p.x >= 0 && p.x <= 1);
    assert.ok(p.duration > 0 && p.duration < 4000);
    assert.ok(Math.abs(p.drift) <= 0.2);
  }
});

test('balloons and celebration rise from below', () => {
  for (const p of balloonParticles(3)) assert.ok(p.y > 1);
  for (const p of celebrationParticles(3)) assert.ok(p.y > 1);
});

test('hearts start near the bottom middle and are red', () => {
  for (const p of heartParticles(9)) {
    assert.ok(p.x >= 0.3 && p.x <= 0.7);
    assert.ok(p.y >= 0.75 && p.y <= 0.95);
    assert.equal(p.color, '#FF3B5C');
  }
});

test('lasers cross the screen in both directions', () => {
  const beams = laserBeams(5);
  assert.ok(beams.some((b) => b.drift > 0));
  assert.ok(beams.some((b) => b.drift < 0));
  for (const b of beams) assert.ok(b.y > 0 && b.y < 1);
});

test('fireworks bursts stay on screen and carry their sparks', () => {
  const bursts = fireworkBursts(11);
  assert.equal(bursts.length, 6);
  for (const burst of bursts) {
    assert.ok(burst.x > 0 && burst.x < 1);
    assert.ok(burst.y > 0 && burst.y < 1);
    assert.equal(burst.sparks.length, 14);
    for (const spark of burst.sparks) {
      assert.ok(spark.angle >= 0 && spark.angle < 380);
      assert.ok(spark.distance > 0);
    }
  }
});

test('echo copies land anywhere on the screen', () => {
  const copies = echoCopies(2);
  assert.equal(copies.length, 26);
  for (const c of copies) {
    assert.ok(c.x >= 0 && c.x <= 1);
    assert.ok(c.y >= 0 && c.y <= 1);
    assert.ok(c.size > 0);
  }
});

test('an effect plays once per message', () => {
  resetPlayedEffects();
  assert.equal(hasEffectPlayed('x'), false);
  markEffectPlayed('x');
  assert.equal(hasEffectPlayed('x'), true);
  assert.equal(hasEffectPlayed('y'), false);
  resetPlayedEffects();
  assert.equal(hasEffectPlayed('x'), false);
});

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
  effectIdsOf,
  isFreshForEffect,
  nextScreenEffect,
  seedPlayedEffects,
  type EffectMemory,
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

// ── One effect per message, on both phones ─────────────────────────────

function memory(): EffectMemory & { ids: Set<string> } {
  const ids = new Set<string>();
  return { ids, has: (id) => ids.has(id), mark: (id) => void ids.add(id) };
}
const NOW = Date.parse('2026-10-06T23:20:00Z');
const FRESH = 60_000;
const confetti = { effect: { kind: 'screen', name: 'confetti' } };
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();

test('a message goes by its own id and by the client key it was sent with', () => {
  assert.deepEqual(effectIdsOf({ messageId: 'real-1', clientKey: 'temp-1' }), [
    'real-1',
    'temp-1',
  ]);
  assert.deepEqual(effectIdsOf({ messageId: 'temp-1', clientKey: 'temp-1' }), ['temp-1']);
  assert.deepEqual(effectIdsOf({ messageId: 'real-1' }), ['real-1']);
  assert.deepEqual(effectIdsOf({ messageId: '', clientKey: null }), []);
});

test('the receiver starts the effect once, however many times the thread changes', () => {
  const mem = memory();
  const thread = [
    { messageId: 'real-1', metadata: confetti, createdAt: at(1), content: 'hi' },
  ];
  assert.deepEqual(nextScreenEffect(thread, mem, NOW, FRESH), {
    name: 'confetti',
    messageId: 'real-1',
    text: 'hi',
  });
  assert.equal(nextScreenEffect(thread, mem, NOW, FRESH), null);
  assert.equal(nextScreenEffect([...thread], mem, NOW + 500, FRESH), null);
});

test('the sender starts it once: the server copy of the optimistic row stays quiet', () => {
  const mem = memory();
  const optimistic = [
    {
      messageId: 'temp-9',
      clientKey: 'temp-9',
      metadata: confetti,
      createdAt: at(0),
      content: 'hi',
    },
  ];
  assert.equal(nextScreenEffect(optimistic, mem, NOW, FRESH)?.messageId, 'temp-9');
  // The REST answer (or the live echo) swaps the id and keeps the client key.
  const confirmed = [
    {
      messageId: 'real-9',
      clientKey: 'temp-9',
      metadata: confetti,
      createdAt: at(0),
      content: 'hi',
    },
  ];
  assert.equal(nextScreenEffect(confirmed, mem, NOW + 300, FRESH), null);
  // And the real id is remembered too, for the next time the chat opens.
  assert.equal(mem.has('real-9'), true);
});

test('what is in the thread when the chat opens never plays', () => {
  const mem = memory();
  const thread = [
    { messageId: 'real-1', metadata: confetti, createdAt: at(5), content: 'old' },
    {
      messageId: 'real-2',
      clientKey: 'temp-2',
      metadata: confetti,
      createdAt: at(2),
      content: 'mine',
    },
  ];
  seedPlayedEffects(thread, mem);
  assert.equal(nextScreenEffect(thread, mem, NOW, FRESH), null);
  assert.deepEqual([...mem.ids].sort(), ['real-1', 'real-2', 'temp-2']);
});

test('history that loads later stays quiet, and is not offered again', () => {
  const mem = memory();
  const old = [
    { messageId: 'real-3', metadata: confetti, createdAt: at(3600), content: 'old' },
  ];
  assert.equal(nextScreenEffect(old, mem, NOW, FRESH), null);
  assert.equal(mem.has('real-3'), true);
});

test('only the first new effect of a pass starts; the next one waits its turn', () => {
  const mem = memory();
  const thread = [
    { messageId: 'real-5', metadata: confetti, createdAt: at(1), content: 'a' },
    {
      messageId: 'real-4',
      metadata: { effect: { kind: 'screen', name: 'balloons' } },
      createdAt: at(2),
      content: 'b',
    },
  ];
  assert.equal(nextScreenEffect(thread, mem, NOW, FRESH)?.messageId, 'real-5');
  assert.equal(nextScreenEffect(thread, mem, NOW, FRESH)?.messageId, 'real-4');
  assert.equal(nextScreenEffect(thread, mem, NOW, FRESH), null);
});

test('bubble effects and plain messages are not screen effects', () => {
  const mem = memory();
  const thread = [
    {
      messageId: 'real-6',
      metadata: { effect: { kind: 'bubble', name: 'slam' } },
      createdAt: at(1),
    },
    { messageId: 'real-7', metadata: null, createdAt: at(1) },
  ];
  assert.equal(nextScreenEffect(thread, mem, NOW, FRESH), null);
  // The row owns bubble effects: the screen pass must not mark them played.
  assert.equal(mem.has('real-6'), false);
});

test('a phone whose clock runs behind still plays the effect', () => {
  // Stamped two seconds in the future from this phone's point of view.
  assert.equal(isFreshForEffect(at(-2), NOW, FRESH), true);
  assert.equal(isFreshForEffect(new Date(NOW + 2000), NOW, FRESH), true);
  assert.equal(isFreshForEffect(NOW - 59_000, NOW, FRESH), true);
  // A minute old is history; so is a stamp that is plainly wrong or missing.
  assert.equal(isFreshForEffect(at(60), NOW, FRESH), false);
  assert.equal(isFreshForEffect(at(-3600), NOW, FRESH), false);
  assert.equal(isFreshForEffect(null, NOW, FRESH), false);
  assert.equal(isFreshForEffect('not a date', NOW, FRESH), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { containsRecovery, healCaptures, type NativeHealEvent } from '../engineHealModel';

const NOW = 1_791_600_000_000;

const larry: NativeHealEvent[] = [
  {
    phase: 'stall',
    at: 1791599990.1,
    cause: 'callbacks_frozen',
    category: 'AVAudioSessionCategoryPlayback',
  },
  { phase: 'attempt', at: 1791599990.1, cause: 'callbacks_frozen', level: 1, attempt: 1 },
  {
    phase: 'result',
    at: 1791599990.9,
    ok: true,
    recover_ms: 800,
    attempts: 1,
    cause: 'callbacks_frozen',
  },
];

test('each phase maps to its event, oldest first, with the session it saw', () => {
  const c = healCaptures([...larry].reverse(), 0, 'live', NOW);
  assert.deepEqual(
    c.map((x) => x.name),
    ['call_audio_stall_detected', 'call_audio_heal_attempt', 'call_audio_heal_result']
  );
  assert.equal(c[0].props.session_category, 'AVAudioSessionCategoryPlayback');
  assert.equal(c[1].props.level, 1);
  assert.equal(c[2].props.recover_ms, 800);
  assert.equal(c[2].props.source, 'live');
});

test('rows already reported are skipped when the ring is drained later', () => {
  const live = healCaptures(larry.slice(0, 1), 0, 'live', NOW);
  const lastAt = live[live.length - 1].at;
  const ring = healCaptures(larry, lastAt, 'ring', NOW);
  // The stall and the attempt share a timestamp: the attempt is reported once more
  // only if it is strictly newer, which it is not.
  assert.deepEqual(
    ring.map((x) => x.name),
    ['call_audio_heal_result']
  );
  assert.equal(ring[0].props.source, 'ring');
});

test('a ring drained after a lock screen call says how late it is', () => {
  const c = healCaptures(larry, 0, 'ring', NOW);
  assert.ok((c[0].props.report_delay_ms as number) >= 9000);
});

test('malformed and unknown rows are dropped, never thrown on', () => {
  const junk = [
    {},
    { phase: 'stall' },
    { phase: 'nope', at: 1 },
    { phase: 'stall', at: Number.NaN },
    null as unknown as NativeHealEvent,
  ];
  assert.deepEqual(healCaptures(junk, 0, 'ring', NOW), []);
});

test('only a successful result asks for the route to be re-applied', () => {
  assert.equal(containsRecovery(healCaptures(larry, 0, 'live', NOW)), true);
  assert.equal(containsRecovery(healCaptures(larry.slice(0, 2), 0, 'live', NOW)), false);
  const exhausted = healCaptures(
    [{ phase: 'exhausted', at: 2, attempts: 3, cause: 'callbacks_frozen' }],
    0,
    'live',
    NOW
  );
  assert.equal(containsRecovery(exhausted), false);
});

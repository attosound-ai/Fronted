import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newMicSilentWatch,
  newRemoteSilentWatch,
  stepMicSilentWatch,
  stepRemoteSilentWatch,
  type MicSample,
} from '../micSilentWatch';

const T0 = 5_000_000;

function sample(over: Partial<MicSample>): MicSample {
  return {
    sid: 'CA1',
    connected: true,
    muted: false,
    onHold: false,
    micLevel: 0,
    nowMs: T0,
    ...over,
  };
}

test('bj203 Oct 10 2026: mic level 0 for the whole call is reported once', () => {
  const w = newMicSilentWatch();
  const verdicts = [];
  for (let t = 0; t <= 220_000; t += 10_000) {
    verdicts.push(stepMicSilentWatch(w, sample({ nowMs: T0 + t })));
  }
  const silent = verdicts.filter((v) => v?.kind === 'silent');
  assert.equal(silent.length, 1);
  assert.equal(verdicts[1]?.kind, 'silent');
});

test('a quiet room is not silence: level 30 never reports', () => {
  const w = newMicSilentWatch();
  for (let t = 0; t <= 120_000; t += 2000) {
    assert.equal(stepMicSilentWatch(w, sample({ nowMs: T0 + t, micLevel: 30 })), null);
  }
});

test('muted or held zeroes are never reported, and restart the clock', () => {
  const w = newMicSilentWatch();
  for (let t = 0; t <= 60_000; t += 2000) {
    assert.equal(
      stepMicSilentWatch(
        w,
        sample({ nowMs: T0 + t, muted: t < 30_000, onHold: t >= 30_000 })
      ),
      null
    );
  }
  // Unmuted with a working mic.
  assert.equal(stepMicSilentWatch(w, sample({ nowMs: T0 + 62_000, micLevel: 40 })), null);
});

test('a mic that comes back is reported as recovered', () => {
  const w = newMicSilentWatch();
  stepMicSilentWatch(w, sample({ nowMs: T0 }));
  assert.equal(stepMicSilentWatch(w, sample({ nowMs: T0 + 12_000 }))?.kind, 'silent');
  assert.deepEqual(stepMicSilentWatch(w, sample({ nowMs: T0 + 14_000, micLevel: 25 })), {
    kind: 'recovered',
    silentForMs: 14_000,
  });
});

test('short pauses in speech never report, and a new call starts clean', () => {
  const w = newMicSilentWatch();
  for (let t = 0; t <= 60_000; t += 2000) {
    const level = t % 8000 === 0 ? 20 : 0; // a level above 0 every 8 s
    assert.equal(stepMicSilentWatch(w, sample({ nowMs: T0 + t, micLevel: level })), null);
  }
  assert.equal(stepMicSilentWatch(w, sample({ sid: 'CA2', nowMs: T0 + 70_000 })), null);
  assert.equal(
    stepMicSilentWatch(w, sample({ sid: 'CA2', nowMs: T0 + 80_000 }))?.kind,
    'silent'
  );
});

test('the Oct 11 Larry call: inbound bytes keep coming with near zero level for minutes', () => {
  const w = newRemoteSilentWatch();
  // Levels and packets from the call (CAd41133...), 60 s samples in background.
  const samples = [
    [0, 14664, 248],
    [65_000, 17881, 11],
    [125_000, 20883, 41],
    [185_000, 23883, 8],
    [271_000, 28179, 9],
    [331_000, 31181, 8],
  ];
  const verdicts = samples.map(([t, rx, lvl]) =>
    stepRemoteSilentWatch(w, {
      sid: 'CAd4',
      connected: true,
      onHold: false,
      remoteLevel: lvl,
      packetsReceived: rx,
      nowMs: T0 + t,
    })
  );
  assert.deepEqual(
    verdicts.map((v) => v?.kind ?? null),
    [null, null, 'remote_silent', null, null, null]
  );
});

test('a normal conversation with pauses never reports the far party silent', () => {
  const w = newRemoteSilentWatch();
  let rx = 0;
  for (let t = 0; t <= 600_000; t += 10_000) {
    rx += 500;
    const lvl = t % 40_000 === 0 ? 3000 : 30; // speaks at least every 40 s
    assert.equal(
      stepRemoteSilentWatch(w, {
        sid: 'CA1',
        connected: true,
        onHold: false,
        remoteLevel: lvl,
        packetsReceived: rx,
        nowMs: T0 + t,
      }),
      null
    );
  }
});

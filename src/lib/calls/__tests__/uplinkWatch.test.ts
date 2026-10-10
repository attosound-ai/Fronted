import { test } from 'node:test';
import assert from 'node:assert/strict';

import { newUplinkWatch, stepUplinkWatch, type UplinkSample } from '../uplinkWatch';

const T0 = 1_000_000;

function sample(over: Partial<UplinkSample>): UplinkSample {
  return {
    sid: 'CA1',
    connected: true,
    connectedAtMs: T0,
    muted: false,
    onHold: false,
    packetsSent: 0,
    nowMs: T0,
    ...over,
  };
}

test('the Larry call of Oct 10 2026 (0 packets for 36 s) is reported once', () => {
  const w = newUplinkWatch();
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 2000 })), null);
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 4000 })), null);
  const v = stepUplinkWatch(w, sample({ nowMs: T0 + 6000 }));
  assert.deepEqual(v, {
    kind: 'dead',
    connectedMs: 6000,
    flatForMs: 4000,
    neverSent: true,
  });
  for (let t = 8000; t <= 36000; t += 2000) {
    assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + t })), null);
  }
});

test('a healthy call never reports', () => {
  const w = newUplinkWatch();
  for (let t = 0; t <= 60000; t += 2000) {
    assert.equal(
      stepUplinkWatch(w, sample({ nowMs: T0 + t, packetsSent: t / 20 })),
      null
    );
  }
});

test('an uplink that stops moving mid call is reported with what it had sent', () => {
  const w = newUplinkWatch();
  stepUplinkWatch(w, sample({ nowMs: T0 + 2000, packetsSent: 100 }));
  stepUplinkWatch(w, sample({ nowMs: T0 + 4000, packetsSent: 200 }));
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 8000, packetsSent: 200 })), null);
  assert.deepEqual(stepUplinkWatch(w, sample({ nowMs: T0 + 10000, packetsSent: 200 })), {
    kind: 'dead',
    connectedMs: 10000,
    flatForMs: 6000,
    neverSent: false,
  });
});

test('the uplink coming back is reported as recovered', () => {
  const w = newUplinkWatch();
  stepUplinkWatch(w, sample({ nowMs: T0 + 1000 }));
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 7000 }))?.kind, 'dead');
  assert.deepEqual(stepUplinkWatch(w, sample({ nowMs: T0 + 9000, packetsSent: 40 })), {
    kind: 'recovered',
    deadForMs: 2000,
  });
});

test('muted or held calls are left alone', () => {
  const w = newUplinkWatch();
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 9000, muted: true })), null);
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 12000, onHold: true })), null);
});

test('ringing and connecting are not judged, and a new call starts clean', () => {
  const w = newUplinkWatch();
  assert.equal(stepUplinkWatch(w, sample({ connected: false, nowMs: T0 + 20000 })), null);
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 7000 }))?.kind, 'dead');
  assert.equal(
    stepUplinkWatch(
      w,
      sample({ sid: 'CA2', connectedAtMs: T0 + 8000, nowMs: T0 + 9000 })
    ),
    null
  );
  assert.equal(
    stepUplinkWatch(
      w,
      sample({ sid: 'CA2', connectedAtMs: T0 + 8000, nowMs: T0 + 14000 })
    )?.kind,
    'dead'
  );
});

test('coming back from hold or mute is not judged against the pause', () => {
  const w = newUplinkWatch();
  stepUplinkWatch(w, sample({ nowMs: T0 + 2000, packetsSent: 100 }));
  stepUplinkWatch(w, sample({ nowMs: T0 + 4000, packetsSent: 200 }));
  // 30 s on hold, the counter does not move.
  for (let t = 6000; t <= 34000; t += 2000) {
    assert.equal(
      stepUplinkWatch(w, sample({ nowMs: T0 + t, packetsSent: 200, onHold: true })),
      null
    );
  }
  // Unhold: the first samples still read 200 while audio restarts.
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 36000, packetsSent: 200 })), null);
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 38000, packetsSent: 260 })), null);
  // Muted for 20 s, then unmuted.
  for (let t = 40000; t <= 60000; t += 2000) {
    assert.equal(
      stepUplinkWatch(w, sample({ nowMs: T0 + t, packetsSent: 260, muted: true })),
      null
    );
  }
  assert.equal(stepUplinkWatch(w, sample({ nowMs: T0 + 62000, packetsSent: 260 })), null);
});

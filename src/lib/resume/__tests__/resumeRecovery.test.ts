import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideResumeRecovery, isDark, type WindowHealth } from '../resumeRecovery';

const healthy: WindowHealth = {
  hasWindow: true,
  drew: true,
  samples: 20000,
  brightPixels: 640,
};
const black: WindowHealth = {
  hasWindow: true,
  drew: true,
  samples: 20000,
  brightPixels: 0,
};
// A dark photo in the viewer: almost black, but the close button is white.
const darkPhoto: WindowHealth = {
  hasWindow: true,
  drew: true,
  samples: 20000,
  brightPixels: 6,
};

test('a normal return does nothing: no remount, no repaint', () => {
  assert.deepEqual(
    decideResumeRecovery({
      first: healthy,
      afterRepaint: null,
      callLive: false,
      modal: null,
    }),
    { action: 'not_needed', holdReason: null }
  );
});

test('a dark photo is not a dark screen', () => {
  assert.equal(isDark(darkPhoto), false);
  assert.equal(
    decideResumeRecovery({
      first: darkPhoto,
      afterRepaint: null,
      callLive: false,
      modal: null,
    }).action,
    'not_needed'
  );
});

test('a black screen that a repaint fixes keeps the user where they were', () => {
  assert.deepEqual(
    decideResumeRecovery({
      first: black,
      afterRepaint: healthy,
      callLive: false,
      modal: null,
    }),
    { action: 'repainted', holdReason: null }
  );
});

test('still black after the repaint: remount as the last resort', () => {
  assert.deepEqual(
    decideResumeRecovery({
      first: black,
      afterRepaint: black,
      callLive: false,
      modal: null,
    }),
    { action: 'last_resort', holdReason: null }
  );
});

test('never remount over a live call or a presented modal', () => {
  assert.deepEqual(
    decideResumeRecovery({
      first: black,
      afterRepaint: black,
      callLive: true,
      modal: null,
    }),
    { action: 'held', holdReason: 'call_live' }
  );
  assert.deepEqual(
    decideResumeRecovery({
      first: black,
      afterRepaint: black,
      callLive: false,
      modal: 'create-post',
    }),
    { action: 'held', holdReason: 'modal_open' }
  );
});

test('when the window cannot be measured nothing drastic happens', () => {
  const cases: (WindowHealth | null)[] = [
    null,
    { hasWindow: false },
    { hasWindow: true, drew: false, samples: 20000, brightPixels: 0 },
    { hasWindow: true, drew: true, samples: 0, brightPixels: 0 },
  ];
  for (const first of cases) {
    assert.equal(
      decideResumeRecovery({ first, afterRepaint: black, callLive: false, modal: null })
        .action,
      'unmeasured'
    );
  }
  assert.equal(
    decideResumeRecovery({
      first: black,
      afterRepaint: null,
      callLive: false,
      modal: null,
    }).action,
    'unmeasured'
  );
});

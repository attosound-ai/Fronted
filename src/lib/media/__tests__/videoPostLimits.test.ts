import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkVideoPost,
  clock,
  SHRUNK_BYTES_PER_SECOND,
  VIDEO_MAX_POST_SECONDS,
  VIDEO_MAX_UPLOAD_BYTES,
} from '../videoPostLimits';

// Medido en la Mac con AttoVideoShrink: 60 s de 4K HLG salieron en
// 15,781,229 bytes. La estimación debe quedar un poco por encima, nunca debajo.
test('the estimate covers what the compressor really writes', () => {
  const est = 60 * SHRUNK_BYTES_PER_SECOND;
  assert.ok(est >= 15_781_229, String(est));
  assert.ok(est < 15_781_229 * 1.06, String(est));
});

test('the longest post is 6:00, and it really fits', () => {
  assert.equal(VIDEO_MAX_POST_SECONDS, 360);
  assert.equal(clock(VIDEO_MAX_POST_SECONDS), '6:00');
  assert.ok(VIDEO_MAX_POST_SECONDS * SHRUNK_BYTES_PER_SECOND <= VIDEO_MAX_UPLOAD_BYTES);
});

test('the 12:11 video of Sep 29 is refused at once, not after eight minutes', () => {
  const check = checkVideoPost(4_894_929_308, 731);
  assert.equal(check.fits, false);
  assert.equal(check.compress, true);
});

test('a small video goes up as it is', () => {
  assert.deepEqual(checkVideoPost(12_000_000, 20), {
    fits: true,
    estimatedBytes: 12_000_000,
    compress: false,
  });
});

test('a big but short video is compressed and fits', () => {
  const check = checkVideoPost(151_514_084, 60);
  assert.equal(check.fits, true);
  assert.equal(check.compress, true);
});

test('an unknown duration is let through for the upload to decide', () => {
  assert.equal(checkVideoPost(500_000_000, null).fits, true);
});

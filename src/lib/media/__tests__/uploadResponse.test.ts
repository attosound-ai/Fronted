import assert from 'node:assert/strict';
import { test } from 'node:test';

import { interpretUploadResponse, isStalled } from '../uploadResponse';

test('a 200 with the hosted address is a success', () => {
  const out = interpretUploadResponse(
    200,
    JSON.stringify({ secure_url: 'https://x/y.mp4', bytes: 5, width: 1080, height: 1920 })
  );
  assert.equal(out.kind, 'ok');
  if (out.kind === 'ok') assert.equal(out.result.secure_url, 'https://x/y.mp4');
});

test('a 200 that is not the expected answer is an error, never a success', () => {
  for (const body of ['', 'not json', '{}', '{"error":{"message":"x"}}', 'null', '[]']) {
    assert.equal(interpretUploadResponse(200, body).kind, 'error', body);
  }
});

test('413 is too large without a size', () => {
  assert.deepEqual(interpretUploadResponse(413, ''), { kind: 'too_large', bytes: -1 });
});

test('the 400 the host sends for an oversized file carries both numbers', () => {
  const body =
    '{"error":{"message":"File size too large. Got 104857600. Maximum is 10485760."}}';
  assert.deepEqual(interpretUploadResponse(400, body), {
    kind: 'too_large',
    bytes: 104857600,
    maxBytes: 10485760,
  });
});

test('any other 400 is a plain failure with its status and text', () => {
  const out = interpretUploadResponse(400, '{"error":{"message":"Invalid Signature"}}');
  assert.equal(out.kind, 'error');
  if (out.kind === 'error') {
    assert.equal(out.httpStatus, 400);
    assert.equal(out.message, 'Cloudinary upload failed (400)');
    assert.ok(out.body.includes('Invalid Signature'));
  }
});

test('no status is the connection', () => {
  const out = interpretUploadResponse(0, null);
  assert.equal(out.kind, 'error');
  if (out.kind === 'error') assert.equal(out.message, 'Network error during upload (0)');
});

test('a server error keeps its status', () => {
  const out = interpretUploadResponse(503, 'unavailable');
  assert.equal(out.kind === 'error' && out.httpStatus === 503, true);
});

test('a long error text is cut', () => {
  const out = interpretUploadResponse(500, 'x'.repeat(5000));
  assert.equal(out.kind === 'error' && out.body.length === 600, true);
});

test('sixty seconds without a byte in the foreground is a stall', () => {
  assert.equal(
    isStalled({ nowMs: 100_000, lastMoveMs: 30_000, lastActiveMs: 0, limitMs: 60_000 }),
    true
  );
  assert.equal(
    isStalled({ nowMs: 100_000, lastMoveMs: 50_000, lastActiveMs: 0, limitMs: 60_000 }),
    false
  );
});

test('time in the background does not count: the client case', () => {
  // Left the app 10 s into the upload, came back 33 s later (Oct 6 2026).
  // Even after five minutes away the upload gets a fresh minute on return.
  const lastMove = 10_000;
  const back = 310_000;
  assert.equal(
    isStalled({
      nowMs: back + 1_000,
      lastMoveMs: lastMove,
      lastActiveMs: back,
      limitMs: 60_000,
    }),
    false
  );
  assert.equal(
    isStalled({
      nowMs: back + 61_000,
      lastMoveMs: lastMove,
      lastActiveMs: back,
      limitMs: 60_000,
    }),
    true
  );
});

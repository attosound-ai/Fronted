import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSplashCache, splashBox } from '../splashLogo';

test('a well formed cache entry is returned as is', () => {
  const raw = JSON.stringify({ uri: 'https://res.cloudinary.com/x/splash.png', aspect: 1 });
  assert.deepEqual(parseSplashCache(raw), {
    uri: 'https://res.cloudinary.com/x/splash.png',
    aspect: 1,
  });
});

test('malformed cache entries read as nothing', () => {
  const bad = [
    null,
    undefined,
    '',
    'not json',
    'null',
    JSON.stringify({ aspect: 1 }),
    JSON.stringify({ uri: 'http://insecure/x.png', aspect: 1 }),
    JSON.stringify({ uri: 'content://x.png', aspect: 1 }),
    JSON.stringify({ uri: '/var/x.png', aspect: 1 }),
    JSON.stringify({ uri: 'https://x/y.png' }),
    JSON.stringify({ uri: 'https://x/y.png', aspect: 0 }),
    JSON.stringify({ uri: 'https://x/y.png', aspect: -2 }),
    JSON.stringify({ uri: 'https://x/y.png', aspect: 50 }),
    JSON.stringify({ uri: 'https://x/y.png', aspect: 'wide' }),
  ];
  for (const raw of bad) assert.equal(parseSplashCache(raw as string), null, String(raw));
});

test('the round web mark gets a compact square box on a phone', () => {
  assert.deepEqual(splashBox(1, 430), { width: 129, height: 129 });
});

test('the wide wordmark spans most of the window', () => {
  const box = splashBox(1024 / 360, 430);
  assert.equal(box.width, 335);
  assert.equal(box.height, 118);
});

test('boxes are capped on tablets', () => {
  assert.equal(splashBox(1, 1200).width, 180);
  assert.equal(splashBox(3, 1200).width, 520);
});

test('a tall image keeps its ratio inside the compact box', () => {
  const box = splashBox(0.5, 430);
  assert.equal(box.width, 129);
  assert.equal(box.height, 258);
});

test('a nonsense ratio falls back to a square', () => {
  for (const a of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const box = splashBox(a, 430);
    assert.equal(box.width, box.height);
  }
});

test('a downloaded copy keeps the admin URL it came from', () => {
  const raw = JSON.stringify({
    uri: 'file:///var/mobile/Documents/splash-logo.png',
    remote: 'https://res.cloudinary.com/x/splash.png?v=2',
    aspect: 1,
  });
  assert.deepEqual(parseSplashCache(raw), {
    uri: 'file:///var/mobile/Documents/splash-logo.png',
    remote: 'https://res.cloudinary.com/x/splash.png?v=2',
    aspect: 1,
  });
});

test('a remote that is not https is dropped, the entry survives', () => {
  const raw = JSON.stringify({ uri: 'file:///a.png', remote: 'http://x/y.png', aspect: 2 });
  assert.deepEqual(parseSplashCache(raw), { uri: 'file:///a.png', aspect: 2 });
});

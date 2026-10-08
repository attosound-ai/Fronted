import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  pickFallbackAccount,
  REFRESH_MARGIN_MS,
  sessionIsUsable,
  switchRoute,
} from '../switchRoute';

const NOW = Date.parse('2026-10-07T22:20:00Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A token shaped like the server's: the user id in `sub`, the end in `exp` (seconds). */
function jwt(sub: string | number, expMs: number): string {
  const part = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: String(sub), exp: Math.floor(expMs / 1000) })}.firma`;
}

function session(userId: number, accessLeftMs: number, refreshLeftMs: number) {
  return {
    accessToken: jwt(userId, NOW + accessLeftMs),
    refreshToken: jwt(userId, NOW + refreshLeftMs),
  };
}

test('going back and forth: the session issued seconds ago is used as it is', () => {
  assert.equal(switchRoute(153, session(153, 14 * MINUTE, 7 * DAY), NOW), 'stored');
});

test('an access token that already expired does not send the switch to the server', () => {
  // The request client renews it with the account's own refresh token.
  assert.equal(switchRoute(153, session(153, -3 * 60 * MINUTE, 6 * DAY), NOW), 'stored');
});

test('a session older than a week is asked for again', () => {
  assert.equal(switchRoute(153, session(153, -8 * DAY, -1 * DAY), NOW), 'link');
});

test('a refresh token about to end is not trusted', () => {
  assert.equal(switchRoute(153, session(153, MINUTE, REFRESH_MARGIN_MS - 1000), NOW), 'link');
  assert.equal(switchRoute(153, session(153, MINUTE, REFRESH_MARGIN_MS + 1000), NOW), 'stored');
});

test('an account the phone holds no session for goes through the server', () => {
  assert.equal(switchRoute(153, null, NOW), 'link');
  assert.equal(switchRoute(153, undefined, NOW), 'link');
  assert.equal(switchRoute(153, { accessToken: null, refreshToken: null }, NOW), 'link');
  assert.equal(
    switchRoute(153, { accessToken: jwt(153, NOW + MINUTE), refreshToken: '' }, NOW),
    'link'
  );
});

test('tokens that belong to another account are never used (Aug 1 2026)', () => {
  const alive = session(152, 14 * MINUTE, 7 * DAY);
  assert.equal(switchRoute(153, alive, NOW), 'link');
  assert.equal(
    switchRoute(153, { accessToken: jwt(153, NOW + MINUTE), refreshToken: alive.refreshToken }, NOW),
    'link'
  );
  assert.equal(
    switchRoute(153, { accessToken: alive.accessToken, refreshToken: jwt(153, NOW + DAY) }, NOW),
    'link'
  );
});

test('a token that cannot be read goes through the server', () => {
  assert.equal(switchRoute(153, { accessToken: 'x.y.z', refreshToken: 'basura' }, NOW), 'link');
  const noExp = `${Buffer.from('{}').toString('base64url')}.${Buffer.from('{"sub":"153"}').toString('base64url')}.f`;
  assert.equal(
    switchRoute(153, { accessToken: jwt(153, NOW + MINUTE), refreshToken: noExp }, NOW),
    'link'
  );
});

test('the id may arrive as text and still match', () => {
  assert.equal(sessionIsUsable('153' as unknown as number, session(153, MINUTE, DAY), NOW), true);
});

// ── Where to land when the session in use dies ──────────────────────────────

const rep = { user: { id: 152 }, tokens: session(152, MINUTE, 6 * DAY) };
const creator = { user: { id: 153 }, tokens: session(153, MINUTE, 6 * DAY) };
const third = { user: { id: 300 }, tokens: session(300, MINUTE, 6 * DAY) };

test('the session died: fall back on the account the user was on before', () => {
  assert.equal(pickFallbackAccount([rep, creator, third], 153, 300, NOW), third);
});

test('no account to prefer: the first one that is alive', () => {
  assert.equal(pickFallbackAccount([rep, creator, third], 153, null, NOW), rep);
  assert.equal(pickFallbackAccount([rep, creator, third], 153, 999, NOW), rep);
});

test('the dead account is never the fallback, even when it was the one before', () => {
  assert.equal(pickFallbackAccount([rep, creator], 153, 153, NOW), rep);
});

test('accounts whose own session is dead are not a way out', () => {
  const stale = { user: { id: 152 }, tokens: session(152, -8 * DAY, -1 * DAY) };
  assert.equal(pickFallbackAccount([stale, creator], 153, 152, NOW), null);
  assert.equal(pickFallbackAccount([creator], 153, null, NOW), null);
  assert.equal(pickFallbackAccount([], 153, null, NOW), null);
});

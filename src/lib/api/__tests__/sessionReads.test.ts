import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSessionRead } from '../sessionReads';

test('the reads a switch reloads anyway are dropped', () => {
  for (const url of [
    '/posts/feed',
    '/users/152',
    '/users/152/stats',
    '/posts/user/153',
    '/posts/bookmarks',
    '/users/discover',
    '/notifications/unread-count',
    '/messages/conversations',
    '/payments/subscriptions/me',
    '/payments/bridge-number',
    '/users/me/linked-accounts',
    '/creator-logos',
  ]) {
    assert.equal(isSessionRead('get', url), true, url);
    assert.equal(isSessionRead('GET', url), true, url);
  }
});

test('a request with no method is a read, as axios treats it', () => {
  assert.equal(isSessionRead(undefined, '/posts/feed'), true);
});

test('what was sent is never dropped: it finishes as the account that sent it', () => {
  for (const method of ['post', 'PUT', 'patch', 'DELETE']) {
    assert.equal(isSessionRead(method, '/posts/abc/comments'), false, method);
    assert.equal(isSessionRead(method, '/messages'), false, method);
  }
});

test('calls, sign in and public settings are left alone', () => {
  for (const url of [
    '/telephony/tokens/voice',
    '/telephony/projects',
    '/auth/me',
    '/auth/check-username',
    '/otp/send',
    '/signup/sessions/me',
    '/content/app-logo',
    '/content/app-release',
    '/payments/subscriptions/plans',
    '/payments/subscriptions/paywall',
  ]) {
    assert.equal(isSessionRead('get', url), false, url);
  }
});

test('a request without an address is left alone', () => {
  assert.equal(isSessionRead('get', undefined), false);
  assert.equal(isSessionRead('get', ''), false);
});

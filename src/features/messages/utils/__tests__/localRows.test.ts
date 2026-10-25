import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keepLocalRows } from '../localRows';

interface Row {
  messageId: string;
  clientKey?: string;
  content: string;
  status?: string;
}

const TEMP = 'temp-1792955400000';
const REAL = '9f1c2a40-b1d2-11f1-a452-a2aaf4379a06';
const older: Row = { messageId: 'older-1', content: 'hi', status: 'sent' };
const uploading: Row = {
  messageId: TEMP,
  clientKey: TEMP,
  content: 'file:///video.mov',
  status: 'sending',
};

test('the reported case: a refetch mid upload keeps the video row', () => {
  const fresh = [older];
  const cached = [uploading, older];
  assert.deepEqual(keepLocalRows(fresh, cached), [uploading, older]);
});

test('a failed row survives the refetch so Retry stays on screen', () => {
  const failed = { ...uploading, status: 'failed' };
  assert.deepEqual(keepLocalRows([older], [failed, older]), [failed, older]);
});

test('a send that reached the server in between is not shown twice', () => {
  const onServer: Row = {
    messageId: REAL,
    clientKey: TEMP,
    content: 'https://v',
    status: 'sent',
  };
  assert.deepEqual(keepLocalRows([onServer, older], [uploading, older]), [
    onServer,
    older,
  ]);
});

test('a row the echo already gave the server id is matched by that id', () => {
  const swapped: Row = { ...uploading, messageId: REAL };
  const onServer: Row = { messageId: REAL, content: 'https://v', status: 'sent' };
  assert.deepEqual(keepLocalRows([onServer, older], [swapped, older]), [onServer, older]);
});

test('confirmed rows are never carried over: the server page wins', () => {
  const sent: Row = { messageId: 'gone-on-server', content: 'deleted', status: 'sent' };
  assert.deepEqual(keepLocalRows([older], [sent, older]), [older]);
});

test('nothing local: the fresh page comes back as is', () => {
  const fresh = [older];
  assert.equal(keepLocalRows(fresh, [older]), fresh);
});

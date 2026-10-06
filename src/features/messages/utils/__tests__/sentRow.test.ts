import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reconcileSentRow } from '../sentRow';

interface Row {
  messageId: string;
  clientKey?: string;
  content: string;
  status?: string;
}

const TEMP: string = 'temp-1791311217983';
const REAL: string = '856f18d0-c1b3-11f1-a452-a2aaf4379a06';
const older: Row = { messageId: 'older-1', content: 'hi', status: 'sent' };
const patch = { content: 'https://host/photo.jpg', status: 'sent' };

test('the reported case: the echo landed first and took over the temporary row', () => {
  // What the cache holds when the answer to the send arrives (Oct 6, 18:27:00).
  const afterEcho: Row[] = [
    {
      messageId: REAL,
      clientKey: TEMP,
      content: 'https://host/photo.jpg',
      status: 'sent',
    },
    older,
  ];
  const out = reconcileSentRow(afterEcho, TEMP, REAL, patch);
  assert.equal(out.length, 2, 'the photo must still be in the thread');
  assert.deepEqual(out[0], { messageId: REAL, clientKey: TEMP, ...patch });
  assert.equal(out[1], older);
});

test('the old rule, for the record, removed that row', () => {
  const afterEcho: Row[] = [
    {
      messageId: REAL,
      clientKey: TEMP,
      content: 'https://host/photo.jpg',
      status: 'sent',
    },
    older,
  ];
  const oldRule = afterEcho.filter(
    (m) => !(m.messageId === REAL && m.messageId !== TEMP)
  );
  assert.equal(oldRule.length, 1, 'this is the bug: only the older message survives');
});

test('the answer to the send arrived first: the temporary row becomes the sent one', () => {
  const sending: Row[] = [
    { messageId: TEMP, clientKey: TEMP, content: 'file:///local.jpg', status: 'sending' },
    older,
  ];
  const out = reconcileSentRow(sending, TEMP, REAL, patch);
  assert.deepEqual(out[0], { messageId: REAL, clientKey: TEMP, ...patch });
  assert.equal(out.length, 2);
});

test('the echo was added as a second row: one copy is kept, ours', () => {
  const both: Row[] = [
    { messageId: REAL, content: 'https://host/photo.jpg', status: 'sent' },
    { messageId: TEMP, clientKey: TEMP, content: 'file:///local.jpg', status: 'sending' },
    older,
  ];
  const out = reconcileSentRow(both, TEMP, REAL, patch);
  assert.equal(out.length, 2);
  assert.equal(out.filter((m) => m.messageId === REAL).length, 1);
  assert.equal(out[0].clientKey, TEMP);
});

test('a temporary row without a client key still gets one, so the list key does not change', () => {
  const out = reconcileSentRow(
    [{ messageId: TEMP, content: 'x' } as Row],
    TEMP,
    REAL,
    patch
  );
  assert.equal(out[0].clientKey, TEMP);
  assert.equal(out[0].messageId, REAL);
});

test('our row is gone (the chat was refetched meanwhile): nothing is removed', () => {
  const refetched: Row[] = [
    { messageId: REAL, content: 'https://host/photo.jpg' },
    older,
  ];
  const out = reconcileSentRow(refetched, TEMP, REAL, patch);
  assert.equal(out, refetched);
});

test('other messages, and other sends in flight, are left alone', () => {
  const other: Row = {
    messageId: 'temp-999',
    clientKey: 'temp-999',
    content: 'b',
    status: 'sending',
  };
  const rows: Row[] = [
    other,
    { messageId: TEMP, clientKey: TEMP, content: 'a', status: 'sending' },
    older,
  ];
  const out = reconcileSentRow(rows, TEMP, REAL, patch);
  assert.equal(out[0], other);
  assert.equal(out[2], older);
  assert.equal(out.length, 3);
});

test('two photos sent one after the other both stay', () => {
  const REAL2 = '8c3f0a10-c1b3-11f1-a452-a2aaf4379a06';
  const TEMP2 = 'temp-1791311228000';
  let rows: Row[] = [
    { messageId: REAL2, clientKey: TEMP2, content: 'https://host/2.jpg', status: 'sent' },
    { messageId: REAL, clientKey: TEMP, content: 'https://host/1.jpg', status: 'sent' },
    older,
  ];
  rows = reconcileSentRow(rows, TEMP, REAL, {
    content: 'https://host/1.jpg',
    status: 'sent',
  });
  rows = reconcileSentRow(rows, TEMP2, REAL2, {
    content: 'https://host/2.jpg',
    status: 'sent',
  });
  assert.deepEqual(
    rows.map((m) => m.messageId),
    [REAL2, REAL, 'older-1']
  );
});

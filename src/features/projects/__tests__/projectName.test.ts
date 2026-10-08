import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanProjectName, decideRename, PROJECT_NAME_MAX } from '../projectName';

test('a new name is saved without the spaces around it', () => {
  assert.deepEqual(decideRename('LTBL', '  Larry talks, day 2  '), {
    kind: 'rename',
    name: 'Larry talks, day 2',
  });
});

test('line breaks and runs of spaces become one space', () => {
  assert.equal(cleanProjectName('Feeling\n\nok   now'), 'Feeling ok now');
});

test('nothing typed, or only spaces, renames nothing', () => {
  assert.deepEqual(decideRename('Atto', ''), { kind: 'empty' });
  assert.deepEqual(decideRename('Atto', '   \n '), { kind: 'empty' });
  assert.equal(cleanProjectName('  '), null);
});

test('the same name is not sent again, spaces aside', () => {
  assert.deepEqual(decideRename('Atto talk', 'Atto talk'), { kind: 'unchanged' });
  assert.deepEqual(decideRename('Atto talk', '  Atto   talk '), { kind: 'unchanged' });
});

test('a change of capitals alone is a rename', () => {
  assert.deepEqual(decideRename('new', 'New'), { kind: 'rename', name: 'New' });
});

test('a name longer than the server takes is cut to the limit, never ending in a space', () => {
  const long = `${'a'.repeat(PROJECT_NAME_MAX - 1)} bcd`;
  const name = cleanProjectName(long)!;
  assert.equal(name.length, PROJECT_NAME_MAX - 1);
  assert.equal(name, 'a'.repeat(PROJECT_NAME_MAX - 1));
  assert.equal(cleanProjectName('x'.repeat(500))!.length, PROJECT_NAME_MAX);
});

test('emoji and accents are kept', () => {
  assert.equal(cleanProjectName(' Canción nueva 🎤 '), 'Canción nueva 🎤');
});

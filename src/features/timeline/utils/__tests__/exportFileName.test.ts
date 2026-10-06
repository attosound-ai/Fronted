import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanBaseName, exportFileName } from '../exportFileName';

test('the File name field wins over the title and the project name', () => {
  assert.equal(
    exportFileName({
      fileName: 'final version',
      title: 'My song',
      projectName: 'Demo',
      extension: 'm4a',
    }),
    'final version.m4a'
  );
});

test('an empty File name falls back to the title, then to the project name', () => {
  assert.equal(
    exportFileName({
      fileName: '  ',
      title: 'My song',
      projectName: 'Demo',
      extension: 'mp3',
    }),
    'My song.mp3'
  );
  assert.equal(
    exportFileName({ fileName: '', title: '', projectName: 'Demo', extension: 'wav' }),
    'Demo.wav'
  );
});

test('nothing typed anywhere still gives a readable name', () => {
  assert.equal(exportFileName({ extension: 'm4a' }), 'ATTO mix.m4a');
});

test('a typed extension is not doubled', () => {
  assert.equal(exportFileName({ fileName: 'final.mp3', extension: 'mp3' }), 'final.mp3');
  assert.equal(exportFileName({ fileName: 'final.wav', extension: 'm4a' }), 'final.m4a');
});

test('a dot that is not an audio extension stays in the name', () => {
  assert.equal(
    exportFileName({ fileName: 'take v1.2', extension: 'm4a' }),
    'take v1.2.m4a'
  );
});

test('path separators and forbidden characters cannot escape the folder', () => {
  assert.equal(cleanBaseName('../../etc/passwd'), 'etc passwd');
  assert.equal(cleanBaseName('a/b\\c:d*e?f"g<h>i|j'), 'a b c d e f g h i j');
});

test('no hidden files and no trailing dots or spaces', () => {
  assert.equal(cleanBaseName('  .secret.  '), 'secret');
  assert.equal(cleanBaseName('...'), '');
});

test('control characters and line breaks become one space', () => {
  assert.equal(cleanBaseName('line one\nline\ttwo'), 'line one line two');
});

test('very long names are cut, accents and other alphabets are kept', () => {
  assert.equal(cleanBaseName('x'.repeat(200)).length, 80);
  assert.equal(
    exportFileName({ fileName: 'Versión final ñ 日本', extension: 'm4a' }),
    'Versión final ñ 日本.m4a'
  );
});

test('the extension is normalised', () => {
  assert.equal(exportFileName({ fileName: 'a', extension: '.M4A' }), 'a.m4a');
  assert.equal(exportFileName({ fileName: 'a', extension: '' }), 'a.wav');
});

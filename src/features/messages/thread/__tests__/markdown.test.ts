import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hasMarkdown, parseMarkdown, stripMarkdown, wrapSelection } from '../markdown';

test('plain text is one span and skips the parser', () => {
  assert.equal(hasMarkdown('hola que tal'), false);
  assert.deepEqual(parseMarkdown('hola que tal'), [{ text: 'hola que tal' }]);
});

test('bold, italic, strike and code in the WhatsApp and Slack spelling', () => {
  assert.deepEqual(parseMarkdown('di *hola* y _adios_ ~ya~ `x`'), [
    { text: 'di ' },
    { text: 'hola', bold: true },
    { text: ' y ' },
    { text: 'adios', italic: true },
    { text: ' ' },
    { text: 'ya', strike: true },
    { text: ' ' },
    { text: 'x', code: true },
  ]);
  assert.deepEqual(parseMarkdown('**fuerte**'), [{ text: 'fuerte', bold: true }]);
});

test('markers that do not hug a word stay literal', () => {
  assert.deepEqual(parseMarkdown('2 * 3 * 4'), [{ text: '2 * 3 * 4' }]);
  assert.deepEqual(parseMarkdown('snake_case_name'), [{ text: 'snake_case_name' }]);
  assert.deepEqual(parseMarkdown('*sin cierre'), [{ text: '*sin cierre' }]);
  assert.deepEqual(parseMarkdown('a*b*'), [{ text: 'a*b*' }]);
});

test('stripMarkdown keeps the words only', () => {
  assert.equal(stripMarkdown('*hola* _tu_'), 'hola tu');
  assert.equal(stripMarkdown('sin nada'), 'sin nada');
});

test('wrapSelection wraps a range or inserts a pair at the caret', () => {
  assert.deepEqual(wrapSelection('hola mundo', 5, 10, 'bold'), {
    text: 'hola *mundo*',
    caret: 12,
  });
  assert.deepEqual(wrapSelection('hola', 4, 4, 'italic'), { text: 'hola__', caret: 5 });
  assert.deepEqual(wrapSelection('ab', 2, 0, 'code'), { text: '`ab`', caret: 4 });
});

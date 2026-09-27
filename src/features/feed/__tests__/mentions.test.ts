import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  activeMention,
  applyMention,
  mentionedUsernames,
  survivingTags,
  tagMapFrom,
  tagMetadata,
} from '../utils/mentions';

test('a mention is active while the token is still being typed', () => {
  assert.deepEqual(activeMention('hola @da', 8), { start: 5, query: 'da' });
  assert.deepEqual(activeMention('@da', 3), { start: 0, query: 'da' });
  assert.deepEqual(activeMention('hola @', 6), { start: 5, query: '' });
});

test('a mention stops being active once the word is finished', () => {
  assert.equal(activeMention('hola @david ', 12), null);
  assert.equal(activeMention('correo a@b.com', 14), null);
  assert.equal(activeMention('nada que ver', 12), null);
});

test('the caret decides which mention is active, not the text after it', () => {
  assert.deepEqual(activeMention('@ana y @ju', 4), { start: 0, query: 'ana' });
});

test('picking a name replaces what was typed and leaves one space', () => {
  const text = 'gracias @da por todo';
  const active = activeMention(text, 11);
  assert.ok(active);
  assert.deepEqual(applyMention(text, active, 'david_espejo'), {
    text: 'gracias @david_espejo por todo',
    caret: 22,
  });
});

test('picking a name at the end of the caption still ends with a space', () => {
  const text = 'con @an';
  const active = activeMention(text, 7);
  assert.ok(active);
  assert.deepEqual(applyMention(text, active, 'ana'), { text: 'con @ana ', caret: 9 });
});

test('the usernames written in a caption come back once each, in order', () => {
  assert.deepEqual(mentionedUsernames('@ana y @juan y @ANA otra vez'), [
    'ana',
    'juan',
  ]);
  assert.deepEqual(mentionedUsernames('sin nadie'), []);
});

test('a tag dies when its name leaves the caption', () => {
  const picked = [
    { id: '1', username: 'ana' },
    { id: '2', username: 'juan' },
  ];
  assert.deepEqual(survivingTags('solo @ana', picked), [{ id: '1', username: 'ana' }]);
  assert.deepEqual(survivingTags('nadie', picked), []);
});

test('the metadata round trips to a username to id map', () => {
  const tagged = [
    { id: '7', username: 'ana' },
    { id: '9', username: 'Juan' },
  ];
  const meta = tagMetadata(tagged);
  assert.deepEqual(meta, { taggedUserIds: '7,9', taggedUsernames: 'ana,Juan' });
  assert.deepEqual(tagMapFrom(meta), { ana: '7', juan: '9' });
});

test('a post with no tags carries no metadata and maps to nothing', () => {
  assert.deepEqual(tagMetadata([]), {});
  assert.deepEqual(tagMapFrom(undefined), {});
  assert.deepEqual(tagMapFrom({ taggedUserIds: '1' }), {});
});

// Los dos fallos que David encontró el 27 de septiembre de 2026 grabando el
// video, y que salían del mismo sitio: la pantalla calculaba la mención con el
// texto del render anterior. Aquí se fija la regla que lo evita.

test('a name with a dot in it is found by what is written, not by one letter less', () => {
  const texto = 'En el estudio con @andrey.';
  const activa = activeMention(texto, texto.length);
  assert.deepEqual(activa, { start: 18, query: 'andrey.' });
});

test('picking leaves nothing of what was typed after the inserted name', () => {
  const texto = 'En el estudio con @andrey.';
  const activa = activeMention(texto, texto.length);
  assert.ok(activa);
  const { text, caret } = applyMention(texto, activa, 'andrey.plazas');
  assert.equal(text, 'En el estudio con @andrey.plazas ');
  assert.equal(caret, text.length);
});

test('a mention computed one keystroke late is what stranded the last letter', () => {
  // Con la mención vieja ("andrey") sobre el texto nuevo ("@andrey."), el punto
  // sobrevive y acaba detrás del nombre. Ese era el bug.
  const texto = 'En el estudio con @andrey.';
  const vieja = { start: 18, query: 'andrey' };
  assert.equal(
    applyMention(texto, vieja, 'andrey.plazas').text,
    'En el estudio con @andrey.plazas .'
  );
});

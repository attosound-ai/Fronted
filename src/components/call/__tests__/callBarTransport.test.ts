import { test } from 'node:test';
import assert from 'node:assert/strict';

import { showCallBarTransport } from '../callBarTransport';

const base = {
  engineMode: true,
  surface: 'timeline',
  status: 'playing',
  pathname: '/recording',
};

// Lo que vio David el 1 de octubre: en la grabadora de la llamada aparecía un
// segundo play en la barra, encima del play del propio editor.
test('the in-call recorder is the editor: no second play button', () => {
  assert.equal(showCallBarTransport(base), false);
  assert.equal(showCallBarTransport({ ...base, pathname: '/(tabs)/recording' }), false);
});

test('the editor opened from Projects hides it too', () => {
  assert.equal(showCallBarTransport({ ...base, pathname: '/project/4dd' }), false);
});

test('away from the editor with the track still sounding, the bar can stop it', () => {
  assert.equal(showCallBarTransport({ ...base, pathname: '/' }), true);
  assert.equal(
    showCallBarTransport({ ...base, pathname: '/messages', status: 'paused' }),
    true
  );
});

test('a feed video or post playing in the call keeps its control anywhere', () => {
  assert.equal(showCallBarTransport({ ...base, surface: 'feed' }), true);
});

test('nothing playing, or not the engine path: no button', () => {
  assert.equal(showCallBarTransport({ ...base, pathname: '/', status: 'idle' }), false);
  assert.equal(
    showCallBarTransport({ ...base, pathname: '/', engineMode: false }),
    false
  );
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  expectedAspect,
  knownCoverAspect,
  POST_CARD_MIN_WIDTH,
  POST_CARD_WIDTH,
  POST_COVER_MAX_HEIGHT,
  postCoverBox,
  rememberCoverAspect,
  resetCoverAspects,
} from '../postCover';

test('a 9:16 post is shown whole, as a tall card, not as a strip of its middle (David, Oct 7 2026)', () => {
  const box = postCoverBox(1080 / 1920, 'reel');
  assert.deepEqual(box, { width: 191, height: POST_COVER_MAX_HEIGHT });
  // The shape of the card is the shape of the post.
  assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.01);
});

test('before the cover is measured a reel is already tall', () => {
  assert.deepEqual(postCoverBox(null, 'reel'), postCoverBox(9 / 16, 'reel'));
});

test('a square cover is a square, a landscape one is wide', () => {
  assert.deepEqual(postCoverBox(1, 'image'), { width: POST_CARD_WIDTH, height: 248 });
  assert.deepEqual(postCoverBox(16 / 9, 'video'), { width: POST_CARD_WIDTH, height: 140 });
  assert.deepEqual(postCoverBox(4 / 5, 'image'), { width: POST_CARD_WIDTH, height: 310 });
});

test('what each kind of post looks like until its cover is known', () => {
  assert.equal(expectedAspect('reel'), 9 / 16);
  assert.equal(expectedAspect('audio'), 1);
  assert.equal(expectedAspect('video'), 16 / 9);
  assert.equal(expectedAspect('image'), 4 / 5);
  assert.equal(expectedAspect('algo nuevo'), 4 / 5);
  assert.deepEqual(postCoverBox(null, 'audio'), { width: POST_CARD_WIDTH, height: 248 });
});

test('extreme shapes are held back: a panorama and a very long screenshot', () => {
  assert.deepEqual(postCoverBox(5, 'image'), { width: POST_CARD_WIDTH, height: 124 });
  const long = postCoverBox(0.2, 'image');
  assert.equal(long.height, POST_COVER_MAX_HEIGHT);
  assert.equal(long.width, POST_CARD_MIN_WIDTH);
});

test('an audio post keeps the whole width for its player, whatever its cover', () => {
  assert.deepEqual(postCoverBox(9 / 16, 'audio'), {
    width: POST_CARD_WIDTH,
    height: POST_COVER_MAX_HEIGHT,
  });
  assert.equal(postCoverBox(1, 'audio').width, POST_CARD_WIDTH);
});

test('no card is ever wider than the bubble allows or taller than the limit', () => {
  for (const type of ['reel', 'video', 'audio', 'image']) {
    for (const aspect of [null, 0.1, 0.5, 0.5625, 0.8, 1, 1.5, 1.78, 2, 4]) {
      const box = postCoverBox(aspect, type);
      assert.ok(box.width <= POST_CARD_WIDTH, `${type} ${aspect}`);
      assert.ok(box.width >= POST_CARD_MIN_WIDTH, `${type} ${aspect}`);
      assert.ok(box.height <= POST_COVER_MAX_HEIGHT, `${type} ${aspect}`);
      assert.ok(box.height >= 124, `${type} ${aspect}`);
    }
  }
});

test('a measured cover is remembered for the next time the card is drawn', () => {
  resetCoverAspects();
  const uri = 'https://res.cloudinary.com/dxzcutnlp/video/upload/c_limit,w_1080,h_1920,f_jpg,q_auto,so_0/atto/videos/a';
  assert.equal(knownCoverAspect(uri), null);

  rememberCoverAspect(uri, 0.5625);

  assert.equal(knownCoverAspect(uri), 0.5625);
  assert.equal(knownCoverAspect('otra'), null);
  assert.equal(knownCoverAspect(null), null);
});

test('a size that is not a real shape is not remembered', () => {
  resetCoverAspects();
  rememberCoverAspect('a', 0);
  rememberCoverAspect('b', Number.NaN);
  rememberCoverAspect('', 1);
  assert.equal(knownCoverAspect('a'), null);
  assert.equal(knownCoverAspect('b'), null);
});

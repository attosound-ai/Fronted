import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  COVER_METADATA_KEY,
  buildPostMetadata,
  coverPublicIdOf,
  resolveCoverUrl,
} from '../coverArt';

// ── buildPostMetadata ──

test('no input produces an empty map, never keys with empty values', () => {
  assert.deepEqual(buildPostMetadata({}), {});
});

test('duration is stored only when it is a positive number', () => {
  assert.deepEqual(buildPostMetadata({ durationSec: 28.5 }), { duration: '28.5' });
  assert.deepEqual(buildPostMetadata({ durationSec: 0 }), {});
  assert.deepEqual(buildPostMetadata({ durationSec: -3 }), {});
  assert.deepEqual(buildPostMetadata({ durationSec: Number.NaN }), {});
  assert.deepEqual(buildPostMetadata({ durationSec: null }), {});
});

test('width and height are stored together or not at all', () => {
  assert.deepEqual(buildPostMetadata({ width: 1080, height: 1920 }), {
    width: '1080',
    height: '1920',
  });
  assert.deepEqual(buildPostMetadata({ width: 1080 }), {});
  assert.deepEqual(buildPostMetadata({ height: 1920 }), {});
  assert.deepEqual(buildPostMetadata({ width: 0, height: 1920 }), {});
});

test('the cover id is trimmed and an empty one is dropped', () => {
  assert.deepEqual(buildPostMetadata({ coverPublicId: 'covers/abc' }), {
    [COVER_METADATA_KEY]: 'covers/abc',
  });
  assert.deepEqual(buildPostMetadata({ coverPublicId: '  covers/abc  ' }), {
    [COVER_METADATA_KEY]: 'covers/abc',
  });
  assert.deepEqual(buildPostMetadata({ coverPublicId: '   ' }), {});
  assert.deepEqual(buildPostMetadata({ coverPublicId: '' }), {});
  assert.deepEqual(buildPostMetadata({ coverPublicId: null }), {});
});

test('a cover rides along with the other keys without disturbing them', () => {
  assert.deepEqual(
    buildPostMetadata({ durationSec: 12, width: 100, height: 200, coverPublicId: 'c/1' }),
    { duration: '12', width: '100', height: '200', [COVER_METADATA_KEY]: 'c/1' }
  );
});

// ── coverPublicIdOf ──

test('only an audio post carries a cover', () => {
  const metadata = { [COVER_METADATA_KEY]: 'covers/abc' };
  assert.equal(coverPublicIdOf('audio', metadata), 'covers/abc');
  assert.equal(coverPublicIdOf('image', metadata), undefined);
  assert.equal(coverPublicIdOf('video', metadata), undefined);
  assert.equal(coverPublicIdOf('reel', metadata), undefined);
  assert.equal(coverPublicIdOf('text', metadata), undefined);
  assert.equal(coverPublicIdOf(null, metadata), undefined);
  assert.equal(coverPublicIdOf(undefined, metadata), undefined);
});

test('an audio post without metadata has no cover', () => {
  assert.equal(coverPublicIdOf('audio', undefined), undefined);
  assert.equal(coverPublicIdOf('audio', null), undefined);
  assert.equal(coverPublicIdOf('audio', {}), undefined);
  assert.equal(coverPublicIdOf('audio', { [COVER_METADATA_KEY]: '' }), undefined);
  assert.equal(coverPublicIdOf('audio', { [COVER_METADATA_KEY]: '   ' }), undefined);
});

test('an unrelated metadata key never reads as a cover', () => {
  assert.equal(coverPublicIdOf('audio', { thumbnailUrl: 'x', duration: '12' }), undefined);
});

// ── resolveCoverUrl ──

test('the resolver builds the url for an audio post with a cover', () => {
  const url = resolveCoverUrl(
    'audio',
    { [COVER_METADATA_KEY]: 'covers/abc' },
    (id) => `https://cdn/${id}.jpg`
  );
  assert.equal(url, 'https://cdn/covers/abc.jpg');
});

test('a resolver that answers nothing falls back to the stored id', () => {
  const stored = 'https://example.com/already-a-url.jpg';
  assert.equal(
    resolveCoverUrl('audio', { [COVER_METADATA_KEY]: stored }, () => null),
    stored
  );
  assert.equal(
    resolveCoverUrl('audio', { [COVER_METADATA_KEY]: stored }, () => ''),
    stored
  );
  assert.equal(
    resolveCoverUrl('audio', { [COVER_METADATA_KEY]: stored }, () => undefined),
    stored
  );
});

test('without a cover the resolver is never called', () => {
  let calls = 0;
  const url = resolveCoverUrl('audio', {}, () => {
    calls += 1;
    return 'never';
  });
  assert.equal(url, undefined);
  assert.equal(calls, 0);
});

test('a non audio post never resolves a cover even with one stored', () => {
  const url = resolveCoverUrl(
    'image',
    { [COVER_METADATA_KEY]: 'covers/abc' },
    (id) => `https://cdn/${id}.jpg`
  );
  assert.equal(url, undefined);
});

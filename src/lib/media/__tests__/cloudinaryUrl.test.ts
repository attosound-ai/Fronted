import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cloudinaryHlsUrl,
  cloudinaryPoster,
  cloudinaryUrl,
  cloudinaryVideoMp4,
  hlsToMp4Fallback,
  isCompleteUri,
  sponsoredVideo,
} from '../cloudinaryUrl';

// The exact shape recorded on Oct 6 2026 while a video was still uploading.
const LOCAL =
  'file:///var/mobile/Containers/Data/Application/305FD66D-EA5E-4A1F-AE0B-0BBEFE778413/Library/Caches/ImagePicker/clip.mov';

test('a video still on the phone plays from its own file, never through Cloudinary', () => {
  assert.equal(cloudinaryHlsUrl(LOCAL), LOCAL);
  assert.equal(cloudinaryVideoMp4(LOCAL), LOCAL);
  assert.equal(cloudinaryUrl(LOCAL), LOCAL);
  assert.equal(cloudinaryHlsUrl(LOCAL)!.includes('res.cloudinary.com'), false);
});

test('no poster can be derived from a local file', () => {
  assert.equal(cloudinaryPoster(LOCAL), null);
});

test('every kind of complete address is recognised', () => {
  for (const uri of [
    'https://cdn.example.com/a.mp4',
    'http://10.0.0.2/a.mp4',
    'file:///tmp/a.mov',
    'content://media/external/video/12',
    'ph://ABC-123/L0/001',
    'assets-library://asset/asset.MOV?id=1',
    'data:video/mp4;base64,AAAA',
    'blob:1234',
    '/var/mobile/a.mov',
  ]) {
    assert.equal(isCompleteUri(uri), true, uri);
  }
});

test('Cloudinary ids, with folders or an extension, are still ids', () => {
  for (const id of [
    'atto/chat/abc123',
    'atto/ads/pudjpl9jxu3ufquynuqe.mp4',
    'abc',
    'a_b-c/d.e',
  ]) {
    assert.equal(isCompleteUri(id), false, id);
  }
});

test('an id still builds the streaming address', () => {
  const url = cloudinaryHlsUrl('atto/chat/abc123.mp4')!;
  assert.ok(url.startsWith('https://res.cloudinary.com/'));
  assert.ok(url.endsWith('/video/upload/sp_auto/atto/chat/abc123.m3u8'));
});

test('a web address goes through unchanged, as before', () => {
  assert.equal(
    cloudinaryHlsUrl('https://cdn.example.com/a.mp4'),
    'https://cdn.example.com/a.mp4'
  );
});

test('an address we built for streaming still falls back to mp4', () => {
  const hls = cloudinaryHlsUrl('atto/chat/abc123')!;
  const mp4 = cloudinaryVideoMp4(hls)!;
  assert.ok(
    mp4.includes('/video/upload/f_auto:video,q_auto,w_1080,c_limit/atto/chat/abc123')
  );
  assert.equal(mp4.endsWith('.m3u8'), false);
});

test('empty input stays empty', () => {
  assert.equal(cloudinaryHlsUrl(null), null);
  assert.equal(cloudinaryHlsUrl(''), null);
  assert.equal(cloudinaryPoster(undefined), null);
});

// ── Sponsored videos ─────────────────────────────────────────────────────────
// The six ads in production on Oct 7 2026 were stored as whole addresses, one
// of them in another cloud. These are two of them, as the server returns them.
const SAMSUNG =
  'https://res.cloudinary.com/da9vymoah/video/upload/v1779493417/atto/ads/pudjpl9jxu3ufquynuqe.mp4';
const APPLE =
  'https://res.cloudinary.com/dxzcutnlp/video/upload/v1775428922/ssstik.io__apple_1775428901068_w4e8oy.mp4';

test('an ad stored as the whole address of its file is streamed, in the cloud it lives in', () => {
  assert.equal(
    sponsoredVideo(SAMSUNG).videoUrl,
    'https://res.cloudinary.com/da9vymoah/video/upload/sp_auto/atto/ads/pudjpl9jxu3ufquynuqe.m3u8'
  );
  assert.equal(
    sponsoredVideo(APPLE).videoUrl,
    'https://res.cloudinary.com/dxzcutnlp/video/upload/sp_auto/ssstik.io__apple_1775428901068_w4e8oy.m3u8'
  );
});

test('that ad gets a poster, so nobody looks at a black rectangle while it loads', () => {
  assert.equal(
    sponsoredVideo(SAMSUNG).posterUrl,
    'https://res.cloudinary.com/da9vymoah/video/upload/c_limit,w_1080,h_1920,f_jpg,q_auto,so_0/atto/ads/pudjpl9jxu3ufquynuqe'
  );
});

test('the players can still fall back to mp4 from the stream of an ad, without leaving its cloud', () => {
  const { videoUrl } = sponsoredVideo(SAMSUNG);
  const expected =
    'https://res.cloudinary.com/da9vymoah/video/upload/f_auto:video,q_auto,w_1080,c_limit/atto/ads/pudjpl9jxu3ufquynuqe';
  assert.equal(hlsToMp4Fallback(videoUrl), expected);
  // Full screen reels and the in call injection ask through this one.
  assert.equal(cloudinaryVideoMp4(videoUrl), expected);
  // The feed card passes the address through the streaming builder again.
  assert.equal(cloudinaryHlsUrl(videoUrl), videoUrl);
});

test('an ad given as an id works as it always did', () => {
  const { videoUrl, posterUrl } = sponsoredVideo('atto/ads/abc123.mp4');
  assert.equal(videoUrl, cloudinaryHlsUrl('atto/ads/abc123.mp4'));
  assert.equal(posterUrl, cloudinaryPoster('atto/ads/abc123.mp4', 'reel'));
  assert.ok(videoUrl!.endsWith('/video/upload/sp_auto/atto/ads/abc123.m3u8'));
});

test('an address that is not an original on Cloudinary is used as it comes', () => {
  const others = [
    'https://cdn.example.com/a.mp4',
    // already says how it wants to be served
    'https://res.cloudinary.com/dxzcutnlp/video/upload/sp_auto/atto/ads/abc123.m3u8',
    'https://res.cloudinary.com/dxzcutnlp/video/upload/q_auto,w_720/v1775428922/atto/ads/abc123.mp4',
    // an image, not a video
    'https://res.cloudinary.com/dxzcutnlp/image/upload/v1775428922/atto/ads/abc123.jpg',
    // a look alike host
    'https://res.cloudinary.com.evil.example/x/video/upload/v1/a.mp4',
    LOCAL,
  ];
  for (const url of others) {
    assert.deepEqual(sponsoredVideo(url), { videoUrl: url, posterUrl: null }, url);
  }
});

test('an ad without a video has nothing to play', () => {
  assert.deepEqual(sponsoredVideo(null), { videoUrl: null, posterUrl: null });
  assert.deepEqual(sponsoredVideo(''), { videoUrl: null, posterUrl: null });
});

test('a chat video keeps playing its own file: the ad rule does not reach it', () => {
  // The chat stores the whole Cloudinary address of the clip the phone
  // already compressed. Streaming it would mean a new derivation and a wait
  // on first play, the complaint of Oct 6 2026.
  const chat = 'https://res.cloudinary.com/dxzcutnlp/video/upload/v1759700000/chat/abc123.mp4';
  assert.equal(cloudinaryHlsUrl(chat), chat);
  assert.equal(cloudinaryVideoMp4(chat), chat);
  assert.equal(cloudinaryPoster(chat), null);
});

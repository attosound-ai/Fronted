import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cloudinaryHlsUrl,
  cloudinaryPoster,
  cloudinaryUrl,
  cloudinaryVideoMp4,
  isCompleteUri,
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

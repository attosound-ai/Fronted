import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bannerPreview, mediaPreviewLabel, previewFromServer } from '../messagePreview';

// Stands in for i18n: the key itself, so a test reads which label was chosen.
const t = (key: string) => key;

const VIDEO_URL =
  'https://res.cloudinary.com/dxzcutnlp/video/upload/v1791302607/atto/chat/abc123.mp4';
const IMAGE_URL = 'https://res.cloudinary.com/dxzcutnlp/image/upload/v1/atto/chat/p.jpg';
const RAW_URL = 'https://res.cloudinary.com/dxzcutnlp/raw/upload/v1/atto/chat/doc.pdf';

test('the reported case: a video never shows its address in the banner', () => {
  assert.equal(bannerPreview(VIDEO_URL, 'video', t), 'media.previewVideo');
  assert.equal(bannerPreview('[video]', 'video', t), 'media.previewVideo');
  assert.equal(bannerPreview('[video]', null, t), 'media.previewVideo');
  // A server that sends neither the type nor a marker.
  assert.equal(bannerPreview(VIDEO_URL, null, t), 'media.previewVideo');
});

test('every media type gets its own label from the type', () => {
  assert.equal(bannerPreview(IMAGE_URL, 'image', t), 'media.previewImage');
  assert.equal(bannerPreview('x', 'video_note', t), 'media.previewVideoNote');
  assert.equal(bannerPreview('x', 'audio', t), 'media.previewAudio');
  assert.equal(bannerPreview('x', 'file', t), 'media.previewFile');
  assert.equal(bannerPreview('{"name":"Ana"}', 'contact', t), 'media.previewContact');
  assert.equal(bannerPreview('x', 'post', t), 'media.previewPost');
});

test('without a type, the shape of a hosted address decides', () => {
  assert.equal(bannerPreview(IMAGE_URL, undefined, t), 'media.previewImage');
  assert.equal(bannerPreview(RAW_URL, undefined, t), 'media.previewFile');
  assert.equal(bannerPreview(`  ${VIDEO_URL}  `, undefined, t), 'media.previewVideo');
});

test('a text message is shown as written, even when it is a link', () => {
  assert.equal(bannerPreview('hello there', 'text', t), 'hello there');
  assert.equal(bannerPreview(VIDEO_URL, 'text', t), VIDEO_URL);
  assert.equal(bannerPreview('https://example.com/a', null, t), 'https://example.com/a');
});

test('plain text from an older server stays plain text', () => {
  assert.equal(bannerPreview('see you at 8', null, t), 'see you at 8');
  assert.equal(bannerPreview('', null, t), '');
  assert.equal(bannerPreview(null, null, t), '');
});

test('a type this build does not know falls back to the marker, then the address, then the text', () => {
  assert.equal(bannerPreview(VIDEO_URL, 'hologram', t), 'media.previewVideo');
  assert.equal(bannerPreview('something', 'hologram', t), 'something');
});

test('thread markers keep their text', () => {
  assert.equal(previewFromServer('[thread] hi', t), 'hi');
  assert.equal(bannerPreview('[thread] hi', 'text', t), 'hi');
});

test('the list helpers still behave as before', () => {
  assert.equal(mediaPreviewLabel('audio', t), 'media.previewAudio');
  assert.equal(mediaPreviewLabel('text', t), null);
  assert.equal(previewFromServer('[audio]', t), 'media.previewAudio');
  assert.equal(previewFromServer('[unknown]', t), '[unknown]');
});

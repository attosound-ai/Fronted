import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_POST_MAX_BYTES,
  estimateExportBytes,
  longestThatFitsMs,
  megabytes,
  smallerSettingThatFits,
} from '../postSize';

// El caso real del cliente (28 de septiembre de 2026): una mezcla de unos
// 31 minutos salió como WAV de 8 kHz mono y pesó 29,556,198 bytes. Cloudinary
// la rechazó; el audio más grande que sí subió pesaba 19.6 MB.
const MIN = 60_000;

test('WAV at 8 kHz mono is 16 kB per second, like the file that failed', () => {
  const ms = ((29_556_198 - 44) / 16_000) * 1000;
  assert.equal(estimateExportBytes(ms, { format: 'wav' }), 29_556_198);
  assert.ok(estimateExportBytes(ms, {}) > AUDIO_POST_MAX_BYTES);
});

test('the largest audio that ever uploaded fits under the limit', () => {
  assert.ok(19_623_654 <= AUDIO_POST_MAX_BYTES);
});

test('AAC is capped by what an 8 kHz signal can carry', () => {
  // 128 kbps asked, but 8 kHz mono came out at 270,712 bytes a minute
  // (ffmpeg, pink noise, the server's flags).
  assert.equal(estimateExportBytes(MIN, { format: 'aac', quality: 'medium' }), 270_000);
  // At 48 kHz the asked bitrate holds.
  assert.equal(
    estimateExportBytes(MIN, { format: 'aac', quality: 'medium', sampleRate: 48000 }),
    960_000
  );
});

test('a 31 minute project fits as AAC 64 kbps, and that is the offered fix', () => {
  const fix = smallerSettingThatFits(31 * MIN, { format: 'wav' });
  assert.deepEqual(fix, { format: 'aac', quality: 'low' });
  assert.ok(estimateExportBytes(31 * MIN, fix!) < AUDIO_POST_MAX_BYTES);
});

test('no fix is offered when already at the smallest setting or when nothing fits', () => {
  assert.equal(smallerSettingThatFits(10 * MIN, { format: 'aac', quality: 'low' }), null);
  // Stereo 48 kHz AAC low is 64 kbps: 8 MB per 1000 s, so 60 minutes is 28.8 MB.
  assert.equal(
    smallerSettingThatFits(60 * MIN, { format: 'wav', sampleRate: 48000, channels: 2 }),
    null
  );
});

test('MP3 at 8 kHz follows what LAME really writes', () => {
  // Measured: q7 89,684, q4 123,884, q0 195,380 bytes for one minute.
  assert.equal(estimateExportBytes(MIN, { format: 'mp3', quality: 'low' }), 90_000);
  assert.equal(estimateExportBytes(MIN, { format: 'mp3', quality: 'high' }), 195_000);
});

test('longest post: about 20 minutes as 8 kHz WAV', () => {
  const ms = longestThatFitsMs({ format: 'wav' });
  assert.ok(ms > 20 * MIN && ms < 21 * MIN, String(ms));
});

test('sizes read in MB with one decimal', () => {
  assert.equal(megabytes(29_556_198), '29.6');
  assert.equal(megabytes(AUDIO_POST_MAX_BYTES), '20.0');
});

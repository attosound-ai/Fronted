/**
 * How big an exported mix will be, and whether it can be posted.
 *
 * Audio posts upload to Cloudinary as `raw`, and this account's raw limit is
 * about 20 MB: the largest audio that ever uploaded was 19.6 MB and the
 * smallest refused was 25.7 MB (PostHog feed_media_upload, Sep 2026). The
 * client's 31 minute mix went out as an 8 kHz WAV of 29.6 MB and failed
 * after the whole mixdown with a bare "too large". Knowing the size up front
 * lets the exporter say so before anything runs, and offer what fits.
 */

import { AUDIO_UPLOAD_MAX_BYTES } from '../../../lib/media/uploadLimits';

export type PostFormat = 'wav' | 'mp3' | 'aac' | 'alac' | 'flac';
export type PostQuality = 'low' | 'medium' | 'high';

export interface SizeOptions {
  format?: PostFormat;
  quality?: PostQuality;
  sampleRate?: number;
  channels?: 1 | 2;
}

/** The most an audio post can carry (see uploadLimits). */
export const AUDIO_POST_MAX_BYTES = AUDIO_UPLOAD_MAX_BYTES;

const AAC_KBPS: Record<PostQuality, number> = { low: 64, medium: 128, high: 256 };
// The server encodes MP3 as VBR (-q:a 7, 4, 0); these are typical averages.
const MP3_KBPS: Record<PostQuality, number> = { low: 100, medium: 165, high: 245 };
// At 8 kHz LAME drops to MPEG 2.5 and spends far less, measured on a minute
// of pink noise (the worst case) with the server's exact settings.
const MP3_KBPS_8K: Record<PostQuality, number> = { low: 12, medium: 17, high: 26 };

/**
 * Estimated file size in bytes, on the high side. The editor's audio is
 * 8 kHz mono unless the exporter asks for more, and an encoder cannot spend
 * more bits than the signal carries: ffmpeg's AAC at 8 kHz mono writes about
 * 36 kbps whatever bitrate is asked (4.5 bits per sample, measured), so a
 * low sample rate caps the lossy formats. Lossless ratios are pink noise,
 * which compresses worst; real audio comes out smaller.
 */
export function estimateExportBytes(durationMs: number, options: SizeOptions): number {
  const seconds = Math.max(0, durationMs) / 1000;
  const sampleRate = options.sampleRate ?? 8000;
  const channels = options.channels ?? 1;
  const quality = options.quality ?? 'medium';
  const pcmBytesPerSecond = sampleRate * channels * 2;
  switch (options.format ?? 'wav') {
    case 'aac': {
      const bits = Math.min(AAC_KBPS[quality] * 1000, 4.5 * sampleRate * channels);
      return Math.round((bits / 8) * seconds);
    }
    case 'mp3': {
      const kbps =
        sampleRate <= 12000 ? MP3_KBPS_8K[quality] * channels : MP3_KBPS[quality];
      const bits = kbps * 1000;
      return Math.round((bits / 8) * seconds);
    }
    case 'flac':
    case 'alac':
      return Math.round(pcmBytesPerSecond * 0.9 * seconds);
    default:
      return Math.round(pcmBytesPerSecond * seconds) + 44;
  }
}

/** Megabytes with one decimal, the way the messages show sizes. */
export function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

/**
 * The smallest setting that still sounds right: AAC at 64 kbps keeping the
 * user's sample rate and channels. Returns it only when it changes something
 * and fits, so the exporter can offer it as the one tap fix.
 */
export function smallerSettingThatFits(
  durationMs: number,
  options: SizeOptions,
  maxBytes: number = AUDIO_POST_MAX_BYTES
): SizeOptions | null {
  const smaller: SizeOptions = { ...options, format: 'aac', quality: 'low' };
  if (options.format === 'aac' && options.quality === 'low') return null;
  return estimateExportBytes(durationMs, smaller) <= maxBytes ? smaller : null;
}

/** The longest duration that fits in a post with these settings, in ms. */
export function longestThatFitsMs(
  options: SizeOptions,
  maxBytes: number = AUDIO_POST_MAX_BYTES
): number {
  const perMinute = estimateExportBytes(60_000, options);
  if (perMinute <= 0) return Infinity;
  return Math.floor((maxBytes / perMinute) * 60_000);
}

/**
 * What a video post can be, known the moment the video is picked.
 *
 * A post uploads one request to Cloudinary, which refuses anything over about
 * 100 MB; the app stops at 95. Videos over 40 MB are compressed on the phone
 * by AttoVideoShrink at a FIXED rate (2 Mbps HEVC 1080p plus 128 kbps AAC,
 * measured 15.78 MB for 60 s), so the compressed size is duration times rate.
 * Before this the app compressed first and only then found out: a 12 minute
 * video meant eight minutes of spinner and then "too large" (Sep 29 2026).
 */

/** Files at or under this go up as they are, with no compression. */
export const VIDEO_COMPRESS_THRESHOLD_BYTES = 40 * 1024 * 1024;
/** One Cloudinary upload request, with margin under its ~100 MB. */
export const VIDEO_MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

/** Bytes per second AttoVideoShrink writes, plus 3% for the container. */
export const SHRUNK_BYTES_PER_SECOND = ((2_000_000 + 128_000) / 8) * 1.03;

/**
 * The longest video that fits, rounded down to a quarter minute so the
 * message reads naturally ("up to 6:00").
 */
export const VIDEO_MAX_POST_SECONDS =
  Math.floor(VIDEO_MAX_UPLOAD_BYTES / SHRUNK_BYTES_PER_SECOND / 15) * 15;

export interface VideoPostCheck {
  fits: boolean;
  /** What will be uploaded: the original, or the compressed estimate. */
  estimatedBytes: number;
  compress: boolean;
}

/**
 * Whether a picked video can be posted. `durationSec` and `bytes` may be
 * unknown (null); then it is let through and the upload decides.
 */
export function checkVideoPost(
  bytes: number | null,
  durationSec: number | null
): VideoPostCheck {
  if (bytes !== null && bytes <= VIDEO_COMPRESS_THRESHOLD_BYTES) {
    return { fits: true, estimatedBytes: bytes, compress: false };
  }
  if (durationSec === null || !Number.isFinite(durationSec) || durationSec <= 0) {
    return { fits: true, estimatedBytes: bytes ?? 0, compress: true };
  }
  const estimatedBytes = Math.round(durationSec * SHRUNK_BYTES_PER_SECOND);
  return {
    fits: estimatedBytes <= VIDEO_MAX_UPLOAD_BYTES,
    estimatedBytes,
    compress: true,
  };
}

/** m:ss for the messages. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

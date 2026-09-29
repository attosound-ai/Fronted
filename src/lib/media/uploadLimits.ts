/**
 * Upload ceilings, measured, not documented: Cloudinary refuses a `raw`
 * upload (how audio posts go) somewhere between 19.6 MB, the largest that
 * ever went through, and 25.7 MB, the smallest refused (PostHog
 * feed_media_upload, Sep 2026). 20 MB keeps every file that worked.
 */
export const AUDIO_UPLOAD_MAX_BYTES = 20_000_000;

/**
 * The telephony service refuses an import over 50 MiB (multer limit in the
 * projects controller). The editor keeps audio as 8 kHz mono WAV, 16 kB a
 * second, so that is about 54 minutes of audio once converted.
 */
export const IMPORT_MAX_BYTES = 50 * 1024 * 1024;
/** Minutes of 8 kHz mono WAV that fit in one import. */
export const IMPORT_MAX_MINUTES = Math.floor(IMPORT_MAX_BYTES / 16_000 / 60);

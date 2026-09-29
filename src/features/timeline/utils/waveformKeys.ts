/**
 * Query keys of the waveform peaks. The peaks are persisted to MMKV for a
 * day, so a server fix to how peaks are computed is only seen after the key
 * changes. Bump the version together with the server's cache key
 * (telephony:waveform:vN). v3, Sep 29 2026: iPhone WAV imports (extensible
 * format, audio at byte 4096) no longer draw their header as a spike.
 */
export const WAVEFORM_KEY = 'waveform-v3';
export const WAVEFORM_DETAIL_KEY = 'waveform-detail-v3';

/**
 * Microphone silent watchdog: is the far party hearing a microphone at all?
 *
 * Oct 10 2026, bj203: the iPhone had the microphone permission denied for ATTO
 * since Sep 11 (can_ask_again false). Calls connected, packets flowed (WebRTC
 * sends silence frames), so the uplink watchdog stayed quiet, and the inmate
 * never heard the creator: mic_audio_level was 0 in every sample of every call,
 * while every other user has it above 0 in over 90 % of samples. A level of
 * exactly 0 for MIC_SILENT_AFTER_MS, connected and not muted or held, is that.
 *
 * Pure (no React Native imports) so it runs under `node --test`.
 */

export const MIC_SILENT_AFTER_MS = 10_000;

export interface MicSilentWatch {
  sid: string | null;
  silentSinceMs: number | null;
  reportedAtMs: number | null;
}

export interface MicSample {
  sid: string | null;
  connected: boolean;
  muted: boolean;
  onHold: boolean;
  micLevel: number | null;
  nowMs: number;
}

export type MicVerdict =
  | { kind: 'silent'; silentForMs: number }
  | { kind: 'recovered'; silentForMs: number }
  | null;

export function newMicSilentWatch(): MicSilentWatch {
  return { sid: null, silentSinceMs: null, reportedAtMs: null };
}

export function stepMicSilentWatch(w: MicSilentWatch, s: MicSample): MicVerdict {
  if (s.sid !== w.sid) {
    w.sid = s.sid;
    w.silentSinceMs = null;
    w.reportedAtMs = null;
  }
  if (!s.connected || s.micLevel == null) return null;
  if (s.muted || s.onHold) {
    // Muting zeroes the level on purpose; start over after it.
    w.silentSinceMs = null;
    return null;
  }
  if (s.micLevel > 0) {
    const was = w.reportedAtMs != null && w.silentSinceMs != null;
    const silentForMs = w.silentSinceMs != null ? s.nowMs - w.silentSinceMs : 0;
    w.silentSinceMs = null;
    if (was) {
      w.reportedAtMs = null;
      return { kind: 'recovered', silentForMs };
    }
    return null;
  }
  if (w.silentSinceMs == null) w.silentSinceMs = s.nowMs;
  const silentForMs = s.nowMs - w.silentSinceMs;
  if (w.reportedAtMs == null && silentForMs >= MIC_SILENT_AFTER_MS) {
    w.reportedAtMs = s.nowMs;
    return { kind: 'silent', silentForMs };
  }
  return null;
}

/**
 * Uplink watchdog: is this phone sending audio into a connected call?
 *
 * Oct 10 2026: the client's call with Larry was answered from the lock screen,
 * connected, and sent 0 packets for 36 s; the far party heard silence and gave
 * up. Every stats sample said packets_sent 0, but nothing ever raised a hand.
 * This turns those samples into one `dead` verdict per outage, and a
 * `recovered` verdict if the uplink moves again. Muted and held calls are left
 * alone: both stop the uplink by design.
 *
 * Pure (no React Native imports) so it runs under `node --test`.
 */

export const UPLINK_DEAD_AFTER_MS = 6000;

export interface UplinkWatch {
  sid: string | null;
  deadAtMs: number | null;
  lastSent: number | null;
  lastMovedAtMs: number | null;
}

export interface UplinkSample {
  sid: string | null;
  connected: boolean;
  connectedAtMs: number | null;
  muted: boolean;
  onHold: boolean;
  packetsSent: number | null;
  nowMs: number;
}

export type UplinkVerdict =
  | { kind: 'dead'; connectedMs: number; flatForMs: number; neverSent: boolean }
  | { kind: 'recovered'; deadForMs: number }
  | null;

export function newUplinkWatch(): UplinkWatch {
  return { sid: null, deadAtMs: null, lastSent: null, lastMovedAtMs: null };
}

export function stepUplinkWatch(w: UplinkWatch, s: UplinkSample): UplinkVerdict {
  if (s.sid !== w.sid) {
    w.sid = s.sid;
    w.deadAtMs = null;
    w.lastSent = null;
    w.lastMovedAtMs = null;
  }
  const sent = s.packetsSent;
  if (!s.connected || s.connectedAtMs == null || sent == null) return null;
  if (w.lastSent == null || sent !== w.lastSent) {
    w.lastSent = sent;
    w.lastMovedAtMs = s.nowMs;
    if (sent > 0) {
      if (w.deadAtMs == null) return null;
      const deadForMs = s.nowMs - w.deadAtMs;
      w.deadAtMs = null;
      return { kind: 'recovered', deadForMs };
    }
  }
  if (s.muted || s.onHold) {
    // Muted or held stops the uplink on purpose. Keep the baseline fresh so the
    // first sample after unmute or unhold is not judged against the pause
    // (review, Oct 10 2026: it fired a false call_uplink_dead).
    w.lastSent = sent;
    w.lastMovedAtMs = s.nowMs;
    return null;
  }
  if (w.deadAtMs != null) return null;
  const connectedMs = s.nowMs - s.connectedAtMs;
  const flatForMs = w.lastMovedAtMs != null ? s.nowMs - w.lastMovedAtMs : 0;
  // Nothing sent since connecting, or the counter stopped moving for as long.
  const neverSent = sent === 0;
  const dead =
    (neverSent && connectedMs >= UPLINK_DEAD_AFTER_MS) ||
    flatForMs >= UPLINK_DEAD_AFTER_MS;
  if (!dead) return null;
  w.deadAtMs = s.nowMs;
  return { kind: 'dead', connectedMs, flatForMs, neverSent };
}

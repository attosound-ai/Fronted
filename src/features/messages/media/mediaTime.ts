/**
 * A length as a clock, the way every messenger writes it on a video or a
 * voice note: 0:05, 1:02, 12:34, and 1:02:03 past the hour. Empty when the
 * length is not known, so nothing is drawn rather than "0:00".
 */
export function formatClock(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  if (total <= 0) return '0:01';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

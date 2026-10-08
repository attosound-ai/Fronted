/**
 * The last thing known about each account of this phone, a few accounts at
 * most: the plan of each one, and what each one had on screen. Switching back
 * to an account shows that at once while the fresh copy loads, instead of an
 * empty screen. Plain objects, so the same book can live in memory or be
 * persisted.
 */
export type Recent<T> = Record<string, { value: T; at: number }>;

/** Writes the entry of an account, dropping the oldest ones beyond `max`. */
export function remember<T>(
  book: Recent<T>,
  accountId: number | string,
  value: T,
  at: number,
  max: number
): Recent<T> {
  const next: Recent<T> = { ...book, [String(accountId)]: { value, at } };
  const keys = Object.keys(next);
  if (keys.length <= max) return next;
  const keep = keys.sort((a, b) => next[b].at - next[a].at).slice(0, max);
  const trimmed: Recent<T> = {};
  for (const key of keep) trimmed[key] = next[key];
  return trimmed;
}

/** The entry of an account, or null when there is none or it is older than `maxAgeMs`. */
export function recall<T>(
  book: Recent<T>,
  accountId: number | string,
  now: number,
  maxAgeMs: number
): T | null {
  const entry = book[String(accountId)];
  if (!entry) return null;
  return now - entry.at <= maxAgeMs ? entry.value : null;
}

export function forget<T>(book: Recent<T>, accountId: number | string): Recent<T> {
  const key = String(accountId);
  if (!(key in book)) return book;
  const next = { ...book };
  delete next[key];
  return next;
}

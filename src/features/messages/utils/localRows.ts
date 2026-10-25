/**
 * Carries the rows that only exist on this phone (a message still sending, or
 * one that failed and waits for Retry) into a fresh first page from the server.
 *
 * Every refetch of the open chat (the socket coming back, pull to refresh, the
 * read marks, the 30 s staleness) replaced the cache with what the server had.
 * A video that was still uploading or had failed is not on the server yet, so
 * it vanished from the thread, and a failure after that had no row left to
 * show the red mark or the Retry button (David, Oct 25 2026, on a flaky
 * connection: "no se envió y luego desapareció del chat").
 *
 * A local row is dropped only when the server page already has it, by id or by
 * client key, so a send that landed in between never shows twice.
 */
export interface LocalRow {
  messageId: string;
  clientKey?: string;
  status?: string;
}

function isLocal(m: LocalRow): boolean {
  return m.status === 'sending' || m.status === 'failed';
}

export function keepLocalRows<T extends LocalRow>(fresh: T[], cached: T[]): T[] {
  const local = cached.filter(isLocal);
  if (local.length === 0) return fresh;
  const known = new Set<string>();
  for (const m of fresh) {
    known.add(m.messageId);
    if (m.clientKey) known.add(m.clientKey);
  }
  const missing = local.filter(
    (m) => !known.has(m.messageId) && !(m.clientKey && known.has(m.clientKey))
  );
  // Pages are newest first and a local row is always the newest thing typed.
  return missing.length === 0 ? fresh : [...missing, ...fresh];
}

/**
 * The client key each message of this session was sent with, by its server id.
 *
 * A row in the thread is keyed by its client key so the optimistic copy and the
 * server's copy are one row. The server never stores that key: when the thread
 * is reloaded (every 14 minutes, when the access token expires and the socket
 * reconnects) the rows came back without it, their list key changed, and every
 * message sent in the session was mounted again: its entry animation replayed
 * and so did its effect (seen Oct 7 2026). Remembering the key here keeps the
 * row the same row for as long as the app is open.
 */
const LIMIT = 500;
const keys = new Map<string, string>();

export function rememberClientKey(
  messageId: string | null | undefined,
  clientKey: string | null | undefined
): void {
  if (!messageId || !clientKey || messageId === clientKey) return;
  if (keys.get(messageId) === clientKey) return;
  keys.set(messageId, clientKey);
  if (keys.size > LIMIT) {
    // Oldest first: a Map keeps insertion order.
    const oldest = keys.keys().next().value;
    if (oldest !== undefined) keys.delete(oldest);
  }
}

export function clientKeyFor(messageId: string | null | undefined): string | undefined {
  return messageId ? keys.get(messageId) : undefined;
}

/**
 * The key a row keeps for life: the one it was sent with when this session
 * knows it, whatever the copy in hand carries.
 */
export function stableClientKey(message: {
  messageId: string;
  clientKey?: string | null;
}): string | undefined {
  if (message.clientKey) {
    rememberClientKey(message.messageId, message.clientKey);
    return message.clientKey;
  }
  return clientKeyFor(message.messageId);
}

/** Only for tests. */
export function resetClientKeys(): void {
  keys.clear();
}

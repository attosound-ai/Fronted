/**
 * Leaves exactly one row for a media message once the server has confirmed
 * it, whichever arrived first: the answer to the send, or the realtime echo.
 *
 * The row is "ours" when it still has the temporary id OR carries it as its
 * client key. That second half is the whole point: when the echo lands first
 * it replaces the temporary row in place, giving it the server id and keeping
 * the temporary id only as the client key. The old code then removed "any
 * other row with the server id", which by then was that very row, and found
 * nothing left to mark as sent: the photo or video vanished from the thread
 * right after sending and only came back when the chat was opened again
 * (client, Oct 6 2026: "it keeps deleting itself"; in the app since Sep 21).
 */
export interface SentRow {
  messageId: string;
  clientKey?: string;
}

export function reconcileSentRow<T extends SentRow>(
  messages: T[],
  tempId: string,
  realId: string,
  patch: Partial<T>
): T[] {
  const ours = (m: T) => m.messageId === tempId || m.clientKey === tempId;
  if (!messages.some(ours)) return messages;
  return (
    messages
      // A second copy of the same message, added by the echo next to ours.
      .filter((m) => ours(m) || m.messageId !== realId)
      .map((m) =>
        ours(m)
          ? { ...m, ...patch, messageId: realId, clientKey: m.clientKey ?? tempId }
          : m
      )
  );
}

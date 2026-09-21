/**
 * Pure helpers for the local conversation preferences (no React Native
 * imports so they run under node's test runner).
 */

export interface ArchivedMark {
  /** `lastMessageAt` of the conversation when it was archived. A newer
   * message brings the conversation back to the list on its own. */
  lastMessageAt: string | null;
  archivedAt: number;
}

/** True when the conversation is archived and nothing newer arrived since. */
export function isArchived(
  archived: Record<string, ArchivedMark>,
  conversationId: string,
  lastMessageAt: string | null
): boolean {
  const mark = archived[conversationId];
  if (!mark) return false;
  if (!lastMessageAt || !mark.lastMessageAt) return true;
  return Date.parse(lastMessageAt) <= Date.parse(mark.lastMessageAt);
}

/**
 * Pinned first (newest pin on top), then by last activity, the way WhatsApp
 * and Telegram order their lists.
 */
export function orderConversations<
  T extends { conversationId: string; lastMessageAt: string | null },
>(list: T[], pinned: Record<string, number>): T[] {
  return [...list].sort((a, b) => {
    const pa = pinned[a.conversationId] ?? 0;
    const pb = pinned[b.conversationId] ?? 0;
    if (pa !== pb) return pb - pa;
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    return tb - ta;
  });
}

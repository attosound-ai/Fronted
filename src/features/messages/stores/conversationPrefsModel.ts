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

/**
 * Drafts belong to an account, not just to a conversation: two linked accounts
 * on one phone can share a conversation (a representative and their creator
 * writing to each other), and one saw the other's unsent text (David, Oct 5
 * 2026). Conversation ids are UUIDs, so ":" never appears in them.
 */
export function draftKey(
  accountId: string | number | null | undefined,
  conversationId: string
): string {
  return `${accountId == null || accountId === '' ? 'anon' : accountId}:${conversationId}`;
}

/** Drafts saved before keys carried the account cannot be attributed: drop them. */
export function dropLegacyDrafts(drafts: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(drafts ?? {})) {
    if (key.includes(':')) out[key] = text;
  }
  return out;
}

/**
 * What to store as the draft when leaving a chat. Text loaded into the
 * composer by "Edit" is an existing message, never a draft: storing it made
 * the old message come back as unsent text (and send again as a duplicate).
 */
export function draftToStore(
  fieldText: string,
  editing: boolean,
  draftBeforeEdit: string | null
): string {
  return editing ? (draftBeforeEdit ?? '') : fieldText;
}

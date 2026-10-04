/**
 * iMessage edit rules, mirrored from chat-service EditPolicy so the menu only
 * offers Edit when the server will accept it: the sender's own text message,
 * within 15 minutes of sending, at most 5 edits. Pure, tested under node.
 */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_EDITS = 5;

export type EditBlock =
  | 'not_own'
  | 'not_text'
  | 'deleted'
  | 'pending'
  | 'window_closed'
  | 'limit_reached';

export interface EditCandidate {
  isOwn: boolean;
  contentType?: string | null;
  isDeleted?: boolean;
  status?: 'sending' | 'sent' | 'failed';
  createdAt: Date | string | number | null | undefined;
  editHistory?: readonly unknown[] | null;
}

export type EditAvailability = { ok: true; editsLeft: number } | { ok: false; reason: EditBlock };

export function editAvailability(m: EditCandidate, now: number = Date.now()): EditAvailability {
  if (!m.isOwn) return { ok: false, reason: 'not_own' };
  if (m.isDeleted) return { ok: false, reason: 'deleted' };
  if ((m.contentType ?? 'text') !== 'text') return { ok: false, reason: 'not_text' };
  if (m.status === 'sending' || m.status === 'failed') return { ok: false, reason: 'pending' };
  const sent = m.createdAt == null ? NaN : new Date(m.createdAt).getTime();
  if (!Number.isFinite(sent) || now - sent > EDIT_WINDOW_MS) {
    return { ok: false, reason: 'window_closed' };
  }
  const used = m.editHistory?.length ?? 0;
  if (used >= MAX_EDITS) return { ok: false, reason: 'limit_reached' };
  return { ok: true, editsLeft: MAX_EDITS - used };
}

/** The text to save, or null when there is nothing to save (empty or unchanged). */
export function editToSave(original: string, draft: string): string | null {
  const next = draft.trim();
  if (next.length === 0) return null;
  if (next === original.trim()) return null;
  return next;
}

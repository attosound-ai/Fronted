/**
 * The comments a person has written that the server does not have yet: the
 * ones on their way and the ones that could not be sent.
 *
 * A comment used to be shown at once and, when the request failed, taken away
 * without a word: the client watched his own comment vanish after fifteen
 * seconds of a spinning button, twice, on a weak connection, and lost what he
 * had typed (Oct 7 2026, "Where am I commenting?"). A comment that could not be
 * sent now stays where he wrote it, says so, and can be sent again or
 * discarded, the way Instagram does it.
 *
 * Kept apart from the list that comes from the server on purpose: that list is
 * reloaded at any moment (someone else comments, the sheet reopens) and a
 * reload must not erase a comment that is still only on this phone.
 *
 * Pure, no React and no native imports, so the rules can be unit tested.
 */

export type PendingStatus = 'sending' | 'failed';

export interface PendingComment {
  /** Local id, `temp-…`: never sent to the server. */
  id: string;
  postId: string;
  text: string;
  parentId: string | null;
  /** ISO time it was written. */
  createdAt: string;
  status: PendingStatus;
  /** How many times it has been sent. */
  attempts: number;
}

/** Pending comments by post, newest first inside each post. */
export type Outbox = Record<string, PendingComment[]>;

const NONE: PendingComment[] = [];

export function pendingFor(outbox: Outbox, postId: string): PendingComment[] {
  return outbox[postId] ?? NONE;
}

export function newPendingComment(
  postId: string,
  text: string,
  parentId: string | null | undefined,
  now: number
): PendingComment {
  return {
    id: `temp-${now}-${Math.round(Math.random() * 1e6)}`,
    postId,
    text,
    parentId: parentId ?? null,
    createdAt: new Date(now).toISOString(),
    status: 'sending',
    attempts: 1,
  };
}

/** A comment just written goes to the top of its post, on its way. */
export function enqueue(outbox: Outbox, comment: PendingComment): Outbox {
  return {
    ...outbox,
    [comment.postId]: [comment, ...pendingFor(outbox, comment.postId)],
  };
}

function patch(
  outbox: Outbox,
  postId: string,
  id: string,
  change: (comment: PendingComment) => PendingComment
): Outbox {
  const list = pendingFor(outbox, postId);
  const current = list.find((c) => c.id === id);
  if (!current) return outbox;
  const changed = change(current);
  // Nothing to change: the same object goes back, so nothing redraws.
  if (changed === current) return outbox;
  return { ...outbox, [postId]: list.map((c) => (c.id === id ? changed : c)) };
}

/** The request failed: the comment stays, marked, with its text intact. */
export function markFailed(outbox: Outbox, postId: string, id: string): Outbox {
  return patch(outbox, postId, id, (c) =>
    c.status === 'failed' ? c : { ...c, status: 'failed' }
  );
}

/**
 * The person asked to send it again. Only a failed comment can be retried: one
 * that is already on its way must not be sent twice.
 */
export function markRetrying(outbox: Outbox, postId: string, id: string): Outbox {
  return patch(outbox, postId, id, (c) =>
    c.status === 'failed' ? { ...c, status: 'sending', attempts: c.attempts + 1 } : c
  );
}

/** Sent, or discarded by the person: it leaves the outbox. */
export function remove(outbox: Outbox, postId: string, id: string): Outbox {
  const list = pendingFor(outbox, postId);
  if (!list.some((c) => c.id === id)) return outbox;
  const rest = list.filter((c) => c.id !== id);
  if (rest.length > 0) return { ...outbox, [postId]: rest };
  const next = { ...outbox };
  delete next[postId];
  return next;
}

export function find(outbox: Outbox, postId: string, id: string): PendingComment | null {
  return pendingFor(outbox, postId).find((c) => c.id === id) ?? null;
}

/**
 * How many of a post's pending comments count toward the number under the
 * post: the ones on their way do (the person sees their comment counted at
 * once), the failed ones do not (the server never got them).
 */
export function countedPending(outbox: Outbox, postId: string): number {
  return pendingFor(outbox, postId).filter((c) => c.status === 'sending').length;
}

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
 * Each comment waits for the account that wrote it. A phone can hold several
 * accounts (a representative and the creator it manages), and a comment that
 * failed as one of them must not show up, or be sent again, as the other: the
 * lists are kept per account and post.
 *
 * Pure, no React and no native imports, so the rules can be unit tested.
 */

export type PendingStatus = 'sending' | 'failed';

export interface PendingComment {
  /** Local id, `temp-…`: never sent to the server. */
  id: string;
  /** The account that wrote it: the only one that sees it and can send it. */
  accountId: string;
  postId: string;
  text: string;
  parentId: string | null;
  /** ISO time it was written. */
  createdAt: string;
  status: PendingStatus;
  /** How many times it has been sent. */
  attempts: number;
}

/** Pending comments by slot (an account on a post), newest first inside each. */
export type Outbox = Record<string, PendingComment[]>;

const NONE: PendingComment[] = [];

/** Where the comments of one account on one post wait. */
export function outboxSlot(accountId: string | number, postId: string): string {
  return `${accountId}|${postId}`;
}

export function pendingFor(outbox: Outbox, slot: string): PendingComment[] {
  return outbox[slot] ?? NONE;
}

export function newPendingComment(
  accountId: string | number,
  postId: string,
  text: string,
  parentId: string | null | undefined,
  now: number
): PendingComment {
  return {
    id: `temp-${now}-${Math.round(Math.random() * 1e6)}`,
    accountId: String(accountId),
    postId,
    text,
    parentId: parentId ?? null,
    createdAt: new Date(now).toISOString(),
    status: 'sending',
    attempts: 1,
  };
}

/** A comment just written goes to the top of its slot, on its way. */
export function enqueue(outbox: Outbox, comment: PendingComment): Outbox {
  const slot = outboxSlot(comment.accountId, comment.postId);
  return { ...outbox, [slot]: [comment, ...pendingFor(outbox, slot)] };
}

function patch(
  outbox: Outbox,
  slot: string,
  id: string,
  change: (comment: PendingComment) => PendingComment
): Outbox {
  const list = pendingFor(outbox, slot);
  const current = list.find((c) => c.id === id);
  if (!current) return outbox;
  const changed = change(current);
  // Nothing to change: the same object goes back, so nothing redraws.
  if (changed === current) return outbox;
  return { ...outbox, [slot]: list.map((c) => (c.id === id ? changed : c)) };
}

/** The request failed: the comment stays, marked, with its text intact. */
export function markFailed(outbox: Outbox, slot: string, id: string): Outbox {
  return patch(outbox, slot, id, (c) =>
    c.status === 'failed' ? c : { ...c, status: 'failed' }
  );
}

/**
 * The person asked to send it again. Only a failed comment can be retried: one
 * that is already on its way must not be sent twice.
 */
export function markRetrying(outbox: Outbox, slot: string, id: string): Outbox {
  return patch(outbox, slot, id, (c) =>
    c.status === 'failed' ? { ...c, status: 'sending', attempts: c.attempts + 1 } : c
  );
}

/** Sent, or discarded by the person: it leaves the outbox. */
export function remove(outbox: Outbox, slot: string, id: string): Outbox {
  const list = pendingFor(outbox, slot);
  if (!list.some((c) => c.id === id)) return outbox;
  const rest = list.filter((c) => c.id !== id);
  if (rest.length > 0) return { ...outbox, [slot]: rest };
  const next = { ...outbox };
  delete next[slot];
  return next;
}

export function find(outbox: Outbox, slot: string, id: string): PendingComment | null {
  return pendingFor(outbox, slot).find((c) => c.id === id) ?? null;
}

/**
 * How many of an account's pending comments on a post count toward the number
 * under the post: the ones on their way do (the person sees their comment counted at
 * once), the failed ones do not (the server never got them).
 */
export function countedPending(outbox: Outbox, slot: string): number {
  return pendingFor(outbox, slot).filter((c) => c.status === 'sending').length;
}

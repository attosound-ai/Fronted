/**
 * The bridge rings every linked account on this phone with one <Dial>, so one
 * incoming call reaches the app as N invites. Declining one has to reject the
 * others, or the caller keeps hearing ringback until the 30 s dial timeout.
 * Pure bookkeeping (no SDK imports) so it runs under the node test runner.
 */
export interface InviteLike {
  callSid: string;
  from: string | null;
  params: Record<string, string | undefined>;
}

export function siblingKey(invite: InviteLike): string {
  const parent = invite.params.ParentCallSid;
  if (parent) return `p:${parent}`;
  return `f:${invite.from ?? ''}|${invite.params.TargetUserId ?? ''}`;
}

const DECLINE_MEMORY_MS = 60_000;

export class InviteSiblings<T> {
  private pending = new Map<string, { key: string; handle: T }>();
  private declined = new Map<string, number>();

  add(invite: InviteLike, handle: T): void {
    this.pending.set(invite.callSid, { key: siblingKey(invite), handle });
  }

  remove(callSid: string): void {
    this.pending.delete(callSid);
  }

  /** True when the user already declined this call on a sibling invite. */
  wasDeclined(invite: InviteLike, now: number = Date.now()): boolean {
    this.prune(now);
    return this.declined.has(siblingKey(invite));
  }

  /**
   * The user declined `invite`: remember the call and return the handles of
   * the other pending invites of the same call (removed from the registry) so
   * the caller can reject them.
   */
  declineAndTakeSiblings(invite: InviteLike, now: number = Date.now()): T[] {
    this.prune(now);
    const key = siblingKey(invite);
    this.declined.set(key, now);
    this.pending.delete(invite.callSid);
    const out: T[] = [];
    for (const [sid, entry] of this.pending) {
      if (entry.key === key) {
        out.push(entry.handle);
        this.pending.delete(sid);
      }
    }
    return out;
  }

  /** Other pending invites of the same call, without removing them. */
  siblingsOf(invite: InviteLike): T[] {
    const key = siblingKey(invite);
    const out: T[] = [];
    for (const [sid, entry] of this.pending) {
      if (sid !== invite.callSid && entry.key === key) out.push(entry.handle);
    }
    return out;
  }

  size(): number {
    return this.pending.size;
  }

  private prune(now: number): void {
    for (const [key, at] of this.declined) {
      if (now - at >= DECLINE_MEMORY_MS) this.declined.delete(key);
    }
  }
}

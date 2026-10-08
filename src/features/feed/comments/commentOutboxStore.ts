import { create } from 'zustand';
import {
  enqueue,
  markFailed,
  markRetrying,
  remove,
  type Outbox,
  type PendingComment,
} from './commentOutbox';

/**
 * The comment outbox, shared by every comments sheet of the session. In
 * memory only: a comment that never reached the server does not need to
 * outlive the app.
 */
interface CommentOutboxState {
  outbox: Outbox;
  enqueue: (comment: PendingComment) => void;
  markFailed: (slot: string, id: string) => void;
  markRetrying: (slot: string, id: string) => void;
  remove: (slot: string, id: string) => void;
}

export const useCommentOutbox = create<CommentOutboxState>()((set) => ({
  outbox: {},
  enqueue: (comment) => set((s) => ({ outbox: enqueue(s.outbox, comment) })),
  markFailed: (slot, id) =>
    set((s) => {
      const outbox = markFailed(s.outbox, slot, id);
      return outbox === s.outbox ? s : { outbox };
    }),
  markRetrying: (slot, id) =>
    set((s) => {
      const outbox = markRetrying(s.outbox, slot, id);
      return outbox === s.outbox ? s : { outbox };
    }),
  remove: (slot, id) =>
    set((s) => {
      const outbox = remove(s.outbox, slot, id);
      return outbox === s.outbox ? s : { outbox };
    }),
}));

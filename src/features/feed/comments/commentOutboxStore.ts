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
  markFailed: (postId: string, id: string) => void;
  markRetrying: (postId: string, id: string) => void;
  remove: (postId: string, id: string) => void;
}

export const useCommentOutbox = create<CommentOutboxState>()((set) => ({
  outbox: {},
  enqueue: (comment) => set((s) => ({ outbox: enqueue(s.outbox, comment) })),
  markFailed: (postId, id) =>
    set((s) => {
      const outbox = markFailed(s.outbox, postId, id);
      return outbox === s.outbox ? s : { outbox };
    }),
  markRetrying: (postId, id) =>
    set((s) => {
      const outbox = markRetrying(s.outbox, postId, id);
      return outbox === s.outbox ? s : { outbox };
    }),
  remove: (postId, id) =>
    set((s) => {
      const outbox = remove(s.outbox, postId, id);
      return outbox === s.outbox ? s : { outbox };
    }),
}));

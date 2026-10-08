/**
 * The attachments waiting in the composer before they are sent, the way
 * iMessage, WhatsApp and Telegram hold a picture while you write a line to go
 * with it. Pure, no native imports, so the ordering and the caption rule are
 * tested.
 *
 * David, Oct 8 2026: picking a photo sent it at once; it should sit in the
 * input as an attachment, let you type a message, and go as one bubble with
 * the picture and the text together.
 */
import type { OutgoingMedia } from './outgoingMedia';

export interface PendingAttachment {
  /** Stable key for the tray and for removal; not sent. */
  id: string;
  media: OutgoingMedia;
}

export interface AttachmentSend {
  media: OutgoingMedia;
  /** The caption rides on one message only; see `planAttachmentSend`. */
  caption?: string;
}

/** As many as WhatsApp lets you stage at once before sending them. */
export const MAX_PENDING_ATTACHMENTS = 10;

let seq = 0;
/** A pending attachment with a key that is unique within a session. */
export function makePending(media: OutgoingMedia): PendingAttachment {
  seq += 1;
  return { id: `att-${Date.now()}-${seq}`, media };
}

/**
 * Add to the tray without passing the cap. Returns the same array when nothing
 * fits, so a caller can tell the user the tray is full.
 */
export function addPending(
  current: PendingAttachment[],
  incoming: OutgoingMedia[]
): { next: PendingAttachment[]; added: number; overflow: boolean } {
  const room = MAX_PENDING_ATTACHMENTS - current.length;
  if (room <= 0) return { next: current, added: 0, overflow: incoming.length > 0 };
  const take = incoming.slice(0, room).map(makePending);
  return {
    next: [...current, ...take],
    added: take.length,
    overflow: incoming.length > room,
  };
}

export function removePending(
  current: PendingAttachment[],
  id: string
): PendingAttachment[] {
  return current.filter((a) => a.id !== id);
}

/**
 * Turn the tray plus the typed caption into the messages to send, in the order
 * they sit in the tray. The caption rides on the LAST attachment only, so an
 * album of photos sends as one run of bubbles with the line under the last
 * one, the way WhatsApp attaches a caption to an album (David's choice,
 * Oct 8 2026). An empty or blank caption rides on nothing.
 */
export function planAttachmentSend(
  items: PendingAttachment[],
  caption: string
): AttachmentSend[] {
  const line = caption.trim();
  const last = items.length - 1;
  return items.map((it, i) => ({
    media: it.media,
    caption: line && i === last ? line : undefined,
  }));
}

/** A short count for the tray's own label, e.g. "3 attachments". */
export function pendingSummaryKey(count: number): 'one' | 'other' {
  return count === 1 ? 'one' : 'other';
}

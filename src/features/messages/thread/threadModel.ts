/**
 * Pure rules for laying out a message thread the way iMessage, WhatsApp and
 * Telegram do: consecutive bubbles from one author form a group with shared
 * corners, a day pill separates days, a message that is only emoji is drawn
 * big without a bubble. No React imports so every rule is unit tested.
 */

export interface ThreadItem {
  id: string;
  senderId: string;
  /** Epoch milliseconds. */
  createdAt: number;
  text: string;
  deleted?: boolean;
}

/** Bubbles closer than this from the same author share a group. */
// Telegram merges consecutive messages of one author within five minutes.
export const GROUP_GAP_MS = 5 * 60_000;
/** Corner radius of a bubble edge that faces the outside of its group. */
export const RADIUS_OUTER = 18;
/** Corner radius of an edge that touches a neighbour in the group. */
export const RADIUS_INNER = 5;
/** A solo emoji message shows this many characters at most, drawn large. */
export const EMOJI_ONLY_MAX = 3;

export interface GroupPosition {
  /** First bubble of a run (the one furthest from the composer, above). */
  first: boolean;
  /** Last bubble of a run (nearest the composer, below). */
  last: boolean;
}

/**
 * Group position of each item. `items` are newest first, like the inverted
 * list that draws them: index 0 sits at the bottom of the screen.
 */
export function groupPositions(items: ThreadItem[]): GroupPosition[] {
  return items.map((item, i) => {
    const below = items[i - 1]; // newer, drawn under this one
    const above = items[i + 1]; // older, drawn over this one
    return {
      first: !above || !sameGroup(above, item),
      last: !below || !sameGroup(item, below),
    };
  });
}

function sameGroup(older: ThreadItem, newer: ThreadItem): boolean {
  if (older.senderId !== newer.senderId) return false;
  if (older.deleted || newer.deleted) return false;
  if (newer.createdAt - older.createdAt > GROUP_GAP_MS) return false;
  return sameDay(older.createdAt, newer.createdAt);
}

export function sameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Whether a day pill goes ABOVE this item: true when the older neighbour
 * (index + 1) is on another day, or when this is the oldest item loaded.
 */
export function needsDayPill(items: ThreadItem[], index: number): boolean {
  const item = items[index];
  const older = items[index + 1];
  if (!item) return false;
  if (!older) return true;
  return !sameDay(item.createdAt, older.createdAt);
}

export interface BubbleCorners {
  topLeft: number;
  topRight: number;
  bottomLeft: number;
  bottomRight: number;
}

/**
 * Corner radii for a bubble given its side and place in the group: the side
 * that faces the author's edge flattens between neighbours, the far side
 * stays round, exactly as iMessage draws its runs.
 */
export function bubbleCorners(own: boolean, pos: GroupPosition): BubbleCorners {
  const near = {
    top: pos.first ? RADIUS_OUTER : RADIUS_INNER,
    bottom: pos.last ? RADIUS_OUTER : RADIUS_INNER,
  };
  return own
    ? {
        topLeft: RADIUS_OUTER,
        bottomLeft: RADIUS_OUTER,
        topRight: near.top,
        bottomRight: near.bottom,
      }
    : {
        topRight: RADIUS_OUTER,
        bottomRight: RADIUS_OUTER,
        topLeft: near.top,
        bottomLeft: near.bottom,
      };
}

const EMOJI_RE =
  /^(?:\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2})+$/u;

/** Number of emoji when the text is nothing but 1 to EMOJI_ONLY_MAX emoji, else 0. */
export function emojiOnlyCount(text: string): number {
  const t = text.trim();
  if (!t || !EMOJI_RE.test(t)) return 0;
  const count = Array.from(
    t.matchAll(/\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu)
  ).length;
  // Joined sequences (family, flags) count as one glyph each; the regex above
  // counts their parts, so cap by the visible clusters instead.
  const clusters = segmentGraphemes(t);
  const n = Math.min(count, clusters);
  return n >= 1 && n <= EMOJI_ONLY_MAX ? n : 0;
}

function segmentGraphemes(text: string): number {
  const Seg = (
    Intl as unknown as {
      Segmenter?: new (
        l?: string,
        o?: { granularity: string }
      ) => { segment: (s: string) => Iterable<unknown> };
    }
  ).Segmenter;
  if (Seg)
    return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text))
      .length;
  return Array.from(text).length;
}

/** Size of the emoji glyph for a solo emoji message: fewer emoji, bigger. */
export function emojiOnlySize(count: number): number {
  if (count <= 1) return 56;
  if (count === 2) return 44;
  return 36;
}

/** Label for a day pill, relative to `now`. */
export function dayLabel(
  at: number,
  now: number,
  words: { today: string; yesterday: string },
  locale?: string
): string {
  if (sameDay(at, now)) return words.today;
  if (sameDay(at, now - 86_400_000)) return words.yesterday;
  const d = new Date(at);
  const withinWeek = now - at < 6 * 86_400_000;
  return new Intl.DateTimeFormat(
    locale,
    withinWeek ? { weekday: 'long' } : { day: 'numeric', month: 'long' }
  ).format(d);
}

/** Past this many screens from the bottom the "jump to latest" pill shows. */
export const JUMP_PILL_THRESHOLD_PX = 600;

export function shouldShowJumpPill(offsetFromBottomPx: number): boolean {
  return offsetFromBottomPx > JUMP_PILL_THRESHOLD_PX;
}

/** Swipe distance that commits a reply, and how far the bubble may travel. */
/**
 * Swipe to reply, with Telegram's constants (ChatSwipeToReplyRecognizer and
 * swipeToReplyGesture in Telegram iOS): the threshold is 45 pt for the other
 * side's bubbles and 60 pt for our own (ours already sit against the edge we
 * drag towards), the bubble follows the finger one to one up to the threshold
 * and then rubber bands to at most threshold + 100 pt.
 */
export const REPLY_SWIPE_TRIGGER_OTHER_PX = 45;
export const REPLY_SWIPE_TRIGGER_OWN_PX = 60;
export const REPLY_SWIPE_BAND_PX = 100;

export function replySwipeTrigger(isOwn: boolean): number {
  'worklet';
  return isOwn ? REPLY_SWIPE_TRIGGER_OWN_PX : REPLY_SWIPE_TRIGGER_OTHER_PX;
}

/** Rubber banded translation of a bubble while swiping to reply. */
export function replySwipeTranslation(dragPx: number, trigger: number): number {
  'worklet';
  if (dragPx <= 0) return 0;
  if (dragPx <= trigger) return dragPx;
  const excess = dragPx - trigger;
  return (
    trigger + (1 - 1 / ((excess * 0.4) / REPLY_SWIPE_BAND_PX + 1)) * REPLY_SWIPE_BAND_PX
  );
}

/**
 * Where the "new messages" divider goes: above the oldest of the `unread`
 * most recent messages from the other side. Items are newest first, so this
 * is the index of the unread th received message counting from 0. Returns
 * null when there is nothing unread or the list is shorter than that.
 */
export function unreadDividerIndex(
  items: readonly Pick<ThreadItem, 'senderId'>[],
  currentUserId: string,
  unread: number
): number | null {
  if (unread <= 0) return null;
  let seen = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].senderId === currentUserId) continue;
    seen += 1;
    if (seen === unread) return i;
  }
  return null;
}

/**
 * The size of the cover of a post shared into the chat, from the post's own
 * proportions: a 9:16 reel is a tall card, a square cover a square one, a
 * landscape photo a wide one.
 *
 * Every cover used to be cut to one 248 by 150 strip, so a vertical post
 * showed only a band across its middle (David, Oct 7 2026). Same rule as the
 * photos and videos of the thread (mediaBox), with the card's own limits.
 */
import { mediaBox, type Box } from './mediaBox';

/** The widest a card gets, and the width of every card that carries a player. */
export const POST_CARD_WIDTH = 248;
/** A tall cover stops here and the card narrows instead. */
export const POST_COVER_MAX_HEIGHT = 340;
/** Below this the title and the author no longer read. */
export const POST_CARD_MIN_WIDTH = 190;

/**
 * What a post of this kind usually looks like. Used until its cover has been
 * measured, so the card is already the right shape in the usual case and
 * does not jump when the picture arrives.
 */
export function expectedAspect(type: string): number {
  if (type === 'reel') return 9 / 16;
  if (type === 'audio') return 1;
  if (type === 'video') return 16 / 9;
  return 4 / 5;
}

/**
 * @param aspect width / height of the cover when it is known, else null.
 * @param type   the kind of post (`reel`, `video`, `audio`, `image`, ...).
 */
export function postCoverBox(aspect: number | null, type: string): Box {
  const box = mediaBox(
    aspect ?? expectedAspect(type),
    POST_CARD_WIDTH,
    POST_COVER_MAX_HEIGHT
  );
  // An audio post carries its player under the cover, and the player needs
  // the whole width whatever the shape of the cover.
  const minWidth = type === 'audio' ? POST_CARD_WIDTH : POST_CARD_MIN_WIDTH;
  return { width: Math.max(box.width, minWidth), height: box.height };
}

// The measured shape of each cover seen in this session, so a card that
// scrolls back into view, or the same post shared twice, is right at once.
const LIMIT = 300;
const measured = new Map<string, number>();

export function rememberCoverAspect(uri: string, aspect: number): void {
  if (!uri || !Number.isFinite(aspect) || aspect <= 0) return;
  measured.delete(uri);
  measured.set(uri, aspect);
  if (measured.size > LIMIT) {
    const oldest = measured.keys().next().value;
    if (oldest !== undefined) measured.delete(oldest);
  }
}

export function knownCoverAspect(uri: string | null | undefined): number | null {
  return uri ? (measured.get(uri) ?? null) : null;
}

/** Only for tests. */
export function resetCoverAspects(): void {
  measured.clear();
}

/**
 * One geometry for everything under the text in the composer.
 *
 * The text starts after the avatar: 16 (screen margin) + 32 (avatar) + 12
 * (gap) = 60. Attachments start there too and end where the Post button
 * ends, 16 from the edge. Before, the audio card used 56 on both sides, the
 * image row 56, the video 56, and the cover art none at all, so every block
 * had its own edges (David, Oct 1 2026: "nada cumple con márgenes").
 * The audio card and the cover art also share one card style, so they read
 * as one group.
 */
export const COMPOSE_INSET_LEFT = 16 + 32 + 12;
export const COMPOSE_INSET_RIGHT = 16;

export const composeCard = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  minHeight: 76,
  paddingVertical: 10,
  paddingHorizontal: 10,
  borderRadius: 14,
  backgroundColor: '#141414',
  marginLeft: COMPOSE_INSET_LEFT,
  marginRight: COMPOSE_INSET_RIGHT,
};

/** The 56 point square on the left of a card (icon or cover image). */
export const composeCardTile = {
  width: 56,
  height: 56,
  borderRadius: 10,
  overflow: 'hidden' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: '#1F1F1F',
};

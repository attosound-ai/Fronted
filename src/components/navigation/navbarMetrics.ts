/**
 * Shared geometry for the floating Liquid Glass bottom navbar.
 *
 * The navbar is an absolutely-positioned floating pill (see BottomTabBar), so it
 * no longer reserves layout height. Every scrollable tab screen must pad its
 * content by `FLOATING_NAVBAR_CLEARANCE` (+ the bottom safe-area inset) so the
 * last items aren't hidden behind the pill.
 */

/** Height of the pill itself (icon row + vertical padding). */
export const FLOATING_PILL_HEIGHT = 56;

/** Gap between the pill and the bottom safe-area edge. */
export const FLOATING_PILL_BOTTOM_GAP = 8;

/**
 * Bottom content padding a list/scroller should add (on top of
 * `insets.bottom`) so its last row clears the floating pill.
 */
export const FLOATING_NAVBAR_CLEARANCE =
  FLOATING_PILL_HEIGHT + FLOATING_PILL_BOTTOM_GAP + 12;

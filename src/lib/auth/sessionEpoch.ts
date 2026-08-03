/**
 * Session epoch — monotonic counter identifying "who owns the active session".
 *
 * Bumped by every mutation that changes the authenticated identity: login,
 * register, 2FA login, signup adoption, account switch (and its rollback),
 * identity self-heal, logout, and session expiry.
 *
 * Long-running async flows (session restore, token refresh, account list
 * hydration) capture the epoch when they start and re-check it before
 * applying results. If it moved, another flow took ownership of the session
 * and the stale result must be DISCARDED, never applied.
 *
 * Why this exists (Aug 1 2026 incident): a delayed getMe() from
 * authStore.initialize() resolved ~16s late during a backend outage and
 * overwrote a just-switched session's user WITHOUT touching its tokens.
 * The app was left with UI identity = account A while every request
 * authenticated as account B, which then caused loadAccounts() to purge a
 * real account from the switcher and switch-account to 403.
 *
 * Standalone module on purpose: it is imported by the stores AND the axios
 * client, so it must not import either (would recreate the
 * client → authStore → client cycle).
 */

let epoch = 0;

/** Current epoch. Capture at the start of any async flow that will later write session state. */
export function getSessionEpoch(): number {
  return epoch;
}

/** Declare a change of session ownership. Returns the new epoch. */
export function bumpSessionEpoch(): number {
  epoch += 1;
  return epoch;
}

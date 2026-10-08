/**
 * How this phone gets into another of its accounts.
 *
 * Every account signed in on the phone keeps its own session in the keychain,
 * and the server issues sessions that stand on their own: a refresh token is
 * good for seven days whatever happens to the others. So a switch does not
 * need the server at all while that stored session is alive ('stored'). Only
 * when it is not (never issued, older than a week, or it belongs to someone
 * else) the server is asked for a new one through the account in use
 * ('link'), which is the one case that waits for the network.
 *
 * Until Oct 7 2026 every switch took the 'link' road and then waited for the
 * subscription too, behind a black screen: 2 seconds on a good day, 9 on the
 * client's connection (his video: "it got stuck").
 *
 * An access token that has already expired does not matter here: the request
 * client renews it with the account's own refresh token before the first
 * request goes out, the same way it does on a cold launch.
 */
import { decodeJwtPayload, getTokenUserId } from './jwt';

export type SwitchRoute = 'stored' | 'link';

export interface SessionTokens {
  accessToken?: string | null;
  refreshToken?: string | null;
}

/** A refresh token this close to its end is not trusted to still be alive when it is used. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

function expiryMs(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}

/**
 * True when the stored session can be used as it is: both tokens are this
 * account's, and the refresh token has life left. A stored entry holding
 * another account's tokens (seen on Aug 1 2026) is never usable.
 */
export function sessionIsUsable(
  userId: number,
  tokens: SessionTokens | null | undefined,
  nowMs: number
): boolean {
  if (!tokens?.accessToken || !tokens.refreshToken) return false;
  const id = Number(userId);
  if (getTokenUserId(tokens.accessToken) !== id) return false;
  if (getTokenUserId(tokens.refreshToken) !== id) return false;
  const end = expiryMs(tokens.refreshToken);
  return end !== null && end - nowMs > REFRESH_MARGIN_MS;
}

export function switchRoute(
  userId: number,
  tokens: SessionTokens | null | undefined,
  nowMs: number
): SwitchRoute {
  return sessionIsUsable(userId, tokens, nowMs) ? 'stored' : 'link';
}

/**
 * The account to fall back on when the session in use is dead for good: one
 * of the others on this phone whose stored session is alive, the one the
 * user was on before if possible. Null when there is none, and then the only
 * way left is the sign in screen.
 */
export function pickFallbackAccount<
  T extends { user: { id: number }; tokens: SessionTokens },
>(
  accounts: readonly T[],
  deadId: number | null,
  preferredId: number | null,
  nowMs: number
): T | null {
  const alive = accounts.filter(
    (a) =>
      (deadId === null || Number(a.user.id) !== Number(deadId)) &&
      sessionIsUsable(Number(a.user.id), a.tokens, nowMs)
  );
  if (alive.length === 0) return null;
  return (
    alive.find(
      (a) => preferredId !== null && Number(a.user.id) === Number(preferredId)
    ) ?? alive[0]
  );
}

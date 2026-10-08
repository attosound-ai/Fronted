/**
 * Which requests belong to "the account in use" and are dropped when the
 * phone switches to another account.
 *
 * A switch reloads every screen for the new account, some 35 reads. The reads
 * of the account being left kept running to the end, for nothing: their
 * answers are thrown away. On a weak connection they took the line from the
 * new account's requests, and each switch was slower than the one before
 * (client, Oct 7 2026: six switches in thirty seconds, the last one 9 s).
 *
 * Only reads. A like, a comment or a message already on its way is finished
 * as the account that sent it. And never what belongs to no account (public
 * settings, sign in) or to the call machinery, which has its own rules.
 */
const KEPT = [
  '/telephony/',
  '/auth/',
  '/otp/',
  '/signup/',
  '/content/',
  '/payments/subscriptions/plans',
  '/payments/subscriptions/paywall',
];

export function isSessionRead(
  method: string | null | undefined,
  url: string | null | undefined
): boolean {
  if ((method ?? 'get').toLowerCase() !== 'get') return false;
  if (!url) return false;
  return !KEPT.some((prefix) => url.startsWith(prefix));
}

/**
 * Centralized rule: user-visible labels use the bare `username` (no `@`).
 * The `@` prefix is reserved for the profile page itself (PublicProfileScreen,
 * ProfileHero). Real names (`displayName`) are never surfaced outside the
 * user's own edit form.
 */

interface WithUsername {
  username?: string | null;
}

/** Bare username, safe against missing values. */
export function formatUsername(user: WithUsername | null | undefined): string {
  return user?.username?.trim() || 'user';
}

/** Explicit @-prefixed form, only for the profile page itself. */
export function formatProfileHandle(
  user: WithUsername | null | undefined
): string {
  const u = user?.username?.trim();
  return u ? `@${u}` : '@user';
}

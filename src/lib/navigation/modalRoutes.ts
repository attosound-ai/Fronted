/**
 * Root stack routes that iOS presents modally (presentation modal,
 * fullScreenModal or transparentModal in src/app/_layout.tsx). A test parses the
 * layout and fails when this list drifts from it.
 *
 * Why it matters: the deep resume remount tears the whole navigator down. With
 * one of these presented at that moment, every modal after it stayed invisible
 * until the app was killed (client, Oct 9 2026, New Post; same account Sep 10,
 * Publish from a project). The remount is held while any of them is open.
 *
 * Pure (no React Native imports) so it runs under `node --test`.
 */
export const MODAL_ROUTES: ReadonlySet<string> = new Set([
  'edit-creator-contact',
  'edit-profile',
  'call',
  'call-keypad',
  'new-message',
  'chat-camera',
  'composer-expanded',
  'subscription',
  'edit-post',
  'create-post',
]);

/** The first modal route in a root stack, or null when none is presented. */
export function presentedModal(routeNames: readonly string[]): string | null {
  return routeNames.find((name) => MODAL_ROUTES.has(name)) ?? null;
}

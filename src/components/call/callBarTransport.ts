/**
 * Whether the call bar shows its own play / pause.
 *
 * It exists for one case: a track keeps playing in the call after the
 * person walks out of the editor, and the bar is then the only place left
 * to stop it. On the editor itself it is a second button for the same thing.
 *
 * The editor lives at TWO routes: /project/<id> when opened from Projects,
 * and /recording during a call (the in-call recorder hosts the same
 * TimelineEditor). The first version only knew /project/, so in every call
 * the duplicate showed up (David, Oct 1 2026: "es redundante").
 */
export function isEditorRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/project/') ||
    pathname === '/recording' ||
    pathname.endsWith('/recording')
  );
}

export function showCallBarTransport(input: {
  engineMode: boolean;
  surface: string | null | undefined;
  status: string;
  pathname: string;
}): boolean {
  const ownerScreenIsUp = input.surface === 'timeline' && isEditorRoute(input.pathname);
  return (
    input.engineMode &&
    !ownerScreenIsUp &&
    (input.status === 'playing' || input.status === 'paused')
  );
}

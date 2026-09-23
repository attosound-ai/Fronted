/**
 * Pure helpers for the launch splash logo: parsing what the cache holds and
 * sizing the box the image is drawn in. Kept free of React Native imports so
 * the rules can be unit tested.
 */

export interface SplashLogo {
  /** What the splash draws: a file on the phone when downloaded, else https. */
  uri: string;
  /** The admin URL this entry came from, to notice when it changes. */
  remote?: string;
  /** Width divided by height. */
  aspect: number;
}

/** At or above this ratio an image is laid out as a wide wordmark. */
export const WIDE_ASPECT = 1.6;

/** Parse the cached entry. Anything malformed reads as nothing. */
export function parseSplashCache(raw: string | null | undefined): SplashLogo | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SplashLogo> | null;
    if (!v || typeof v.uri !== 'string') return null;
    // A local copy (instant to paint) or the https original. Nothing else.
    if (!v.uri.startsWith('https://') && !v.uri.startsWith('file://')) return null;
    const aspect = Number(v.aspect);
    if (!Number.isFinite(aspect) || aspect < 0.2 || aspect > 10) return null;
    const remote =
      typeof v.remote === 'string' && v.remote.startsWith('https://')
        ? v.remote
        : undefined;
    return remote ? { uri: v.uri, remote, aspect } : { uri: v.uri, aspect };
  } catch {
    return null;
  }
}

/**
 * The box the logo is drawn in. A wide wordmark spans most of the window, a
 * round or square mark gets a compact box, so neither ends up tiny or huge.
 * The mark's size follows Spotify's launch screen (the client, Sep 23 2026:
 * "can we get our logo this size"): about three tenths of the width, not half.
 */
export function splashBox(
  aspect: number,
  windowWidth: number
): { width: number; height: number } {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const wide = safe >= WIDE_ASPECT;
  const width = Math.round(
    wide ? Math.min(windowWidth * 0.78, 520) : Math.min(windowWidth * 0.3, 180)
  );
  return { width, height: Math.round(width / safe) };
}

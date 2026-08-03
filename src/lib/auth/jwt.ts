/**
 * Client-side JWT payload introspection — WITHOUT signature verification.
 *
 * Only safe for deciding "which of MY locally-stored accounts does this
 * token belong to" (the token came from our own SecureStore, not from an
 * untrusted party). Never use this for authorization decisions; the backend
 * validates signatures on every request.
 *
 * The backend (user-service, HS256) serialises the user id into the `sub`
 * claim as a decimal string (see middleware/auth.go JWTClaims — the UserID
 * field's json:"sub" tag shadows RegisteredClaims.Subject). Signup-scoped
 * tokens use "signup:<uuid>" and intentionally resolve to null here.
 */

// Minimal base64 decoder — avoids depending on global atob availability
// across Hermes versions. Only needs to handle the base64url alphabet.
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Decode(input: string): string | null {
  const clean = input.replace(/=+$/, '');
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const value = B64_ALPHABET.indexOf(char);
    if (value === -1) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  try {
    // JWT payloads are UTF-8 JSON; decode via percent-encoding round-trip.
    return decodeURIComponent(
      bytes.map((b) => '%' + b.toString(16).padStart(2, '0')).join('')
    );
  } catch {
    return null;
  }
}

/** Decode a JWT's payload segment. Returns null on any malformed input. */
export function decodeJwtPayload(
  token: string | null | undefined
): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = base64Decode(base64);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as unknown;
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * The numeric user id a token authenticates as, or null when it cannot be
 * determined (malformed token, signup-scoped token, unexpected claim shape).
 * Callers MUST treat null as "unknown" and skip identity checks, never as
 * a mismatch.
 */
export function getTokenUserId(token: string | null | undefined): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const sub = payload.sub ?? payload.user_id;
  if (typeof sub !== 'string' && typeof sub !== 'number') return null;
  const id = Number(sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}

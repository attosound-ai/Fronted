/**
 * What the media host answered to an upload, read the same way whichever
 * transport carried it. Pure, so every answer we have seen has a test.
 */
export type UploadOutcome =
  | { kind: 'ok'; result: Record<string, unknown> }
  /** `bytes` is -1 when the host did not say how big the file was. */
  | { kind: 'too_large'; bytes: number; maxBytes?: number }
  | { kind: 'error'; message: string; httpStatus: number; body: string };

export function interpretUploadResponse(
  status: number,
  rawBody: string | null | undefined
): UploadOutcome {
  const text = rawBody ?? '';
  if (status >= 200 && status < 300) {
    try {
      const result = JSON.parse(text);
      if (result && typeof result === 'object' && typeof result.secure_url === 'string') {
        return { kind: 'ok', result };
      }
    } catch {
      // falls through to the error below
    }
    return {
      kind: 'error',
      message: 'Invalid response from Cloudinary',
      httpStatus: status,
      body: text.slice(0, 600),
    };
  }
  const body = text.slice(0, 600);
  // Payload Too Large: the file exceeds the request limit.
  if (status === 413) return { kind: 'too_large', bytes: -1 };
  // The host answers 400, not 413, when a file exceeds the limit of its
  // resource type, with "Got X. Maximum is Y" in the text.
  if (status === 400 && /too large|maximum is|file size/i.test(body)) {
    const got = body.match(/got\s+(\d+)/i);
    const max = body.match(/maximum(?:\s+is)?\s+(\d+)/i);
    return {
      kind: 'too_large',
      bytes: got ? Number(got[1]) : -1,
      maxBytes: max ? Number(max[1]) : undefined,
    };
  }
  // No status at all is the connection, not the host.
  if (!status)
    return {
      kind: 'error',
      message: 'Network error during upload (0)',
      httpStatus: 0,
      body,
    };
  return {
    kind: 'error',
    message: `Cloudinary upload failed (${status})`,
    httpStatus: status,
    body,
  };
}

/**
 * Whether an upload with no bytes moving has to be given up. Time spent with
 * the app in the background does not count: the system keeps a background
 * upload going while our own clock is frozen, and on return it would look
 * like a long silence (a false "stalled" exactly when the upload survived).
 */
export function isStalled(input: {
  nowMs: number;
  lastMoveMs: number;
  /** When the app last came to the foreground; 0 if it never left. */
  lastActiveMs: number;
  limitMs: number;
}): boolean {
  const since = Math.max(input.lastMoveMs, input.lastActiveMs);
  return input.nowMs - since > input.limitMs;
}

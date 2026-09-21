/**
 * Cover art on an audio post.
 *
 * A cover is optional: an audio post without one keeps the waveform row it
 * always had, and one with a cover is presented like a record, artwork first.
 * The image is a normal Cloudinary upload; the post only carries its public
 * id in `metadata.coverPublicId`, so nothing about the post schema changes.
 *
 * Everything here is pure so it can be tested without a device.
 */

/** The metadata key the post carries. Keep this the single definition. */
export const COVER_METADATA_KEY = 'coverPublicId';

export interface PostMetadataInput {
  /** Media length in seconds, as the composer measured it. */
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  /** Cloudinary public id of the cover, when the person attached one. */
  coverPublicId?: string | null;
}

/** True for a value that can be stored: a non empty string once trimmed. */
function usable(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Builds the metadata map a new post carries. Absent, zero and malformed
 * values are left out entirely rather than stored as "undefined" or "0",
 * because the feed treats any present key as meaningful.
 */
export function buildPostMetadata(input: PostMetadataInput): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (positive(input.durationSec)) metadata.duration = String(input.durationSec);
  if (positive(input.width) && positive(input.height)) {
    metadata.width = String(input.width);
    metadata.height = String(input.height);
  }
  if (usable(input.coverPublicId)) {
    metadata[COVER_METADATA_KEY] = input.coverPublicId.trim();
  }
  return metadata;
}

/**
 * The cover's public id for a post, or undefined when it has none. Only audio
 * posts carry one: an image post's own file is already its picture, and
 * showing a second one would be a bug the feed cannot recover from.
 */
export function coverPublicIdOf(
  contentType: string | null | undefined,
  metadata: Record<string, string> | null | undefined
): string | undefined {
  if (contentType !== 'audio') return undefined;
  const raw = metadata?.[COVER_METADATA_KEY];
  return usable(raw) ? raw.trim() : undefined;
}

/**
 * Resolves the cover's image URL through the caller's Cloudinary resolver.
 * A resolver that cannot build a URL (an id that is already a full URL, an
 * unknown cloud) falls back to the raw id, which the image component can
 * still load when it is a URL.
 */
export function resolveCoverUrl(
  contentType: string | null | undefined,
  metadata: Record<string, string> | null | undefined,
  toUrl: (publicId: string) => string | null | undefined
): string | undefined {
  const publicId = coverPublicIdOf(contentType, metadata);
  if (!publicId) return undefined;
  const url = toUrl(publicId);
  return usable(url) ? url : publicId;
}

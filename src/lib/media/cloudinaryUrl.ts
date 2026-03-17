/**
 * Cloudinary URL builder — constructs optimized delivery URLs from public_id + preset.
 *
 * Single Responsibility: Only builds URLs, no fetching or uploading.
 * Open/Closed: Add new presets without modifying existing code.
 */

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'atto-sound';

const BASE = `https://res.cloudinary.com/${CLOUD_NAME}`;

/** Named transformation presets (must match backend eager transforms). */
const PRESETS: Record<string, string> = {
  // Avatars — face-detection crop
  avatar_sm: 'c_thumb,g_face,w_40,h_40,f_auto,q_auto',
  avatar_md: 'c_thumb,g_face,w_80,h_80,f_auto,q_auto',
  avatar_lg: 'c_thumb,g_face,w_200,h_200,f_auto,q_auto',

  // Content images — responsive widths
  thumb: 'c_limit,w_300,f_auto,q_auto',
  feed: 'c_limit,w_1500,f_auto,q_auto',
  full: 'c_limit,w_2000,f_auto,q_auto',

  // Chat images
  chat_sm: 'c_limit,w_400,f_auto,q_auto',
  chat_lg: 'c_limit,w_800,f_auto,q_auto',

  // Video thumbnails (so_0 = first frame)
  video_thumb: 'c_limit,w_750,h_750,f_jpg,q_auto,so_0',
  reel_thumb: 'c_limit,w_480,h_854,f_jpg,q_auto,so_0',

  // Original (no transforms, only format + quality)
  original: 'f_auto,q_auto',
};

type Preset = keyof typeof PRESETS;

/**
 * Build a Cloudinary delivery URL.
 *
 * @param publicId - The Cloudinary public_id (e.g. "atto/avatars/avatar_abc123")
 * @param preset   - A named preset key (e.g. "avatar_md", "feed")
 * @param resourceType - "image" | "video" | "raw" (default: "image")
 * @returns Full CDN URL, or null if publicId is falsy.
 *
 * If publicId is already a full URL (starts with http), returns it unchanged.
 */
export function cloudinaryUrl(
  publicId: string | null | undefined,
  preset: Preset = 'original',
  resourceType: 'image' | 'video' | 'raw' = 'image'
): string | null {
  if (!publicId) return null;

  // Passthrough for full URLs (e.g. legacy local uploads or external URLs)
  if (publicId.startsWith('http')) return publicId;

  const transform = PRESETS[preset] ?? PRESETS.original;
  return `${BASE}/${resourceType}/upload/${transform}/${publicId}`;
}

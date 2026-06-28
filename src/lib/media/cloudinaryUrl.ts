/**
 * Cloudinary URL builder — constructs optimized delivery URLs from public_id + preset.
 *
 * Single Responsibility: Only builds URLs, no fetching or uploading.
 * Open/Closed: Add new presets without modifying existing code.
 */

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dxzcutnlp';

const BASE = `https://res.cloudinary.com/${CLOUD_NAME}`;

/** Named transformation presets (must match backend eager transforms). */
const PRESETS: Record<string, string> = {
  // Avatars — face-detection crop
  avatar_sm: 'c_thumb,g_face,w_40,h_40,f_auto,q_auto',
  avatar_md: 'c_thumb,g_face,w_80,h_80,f_auto,q_auto',
  avatar_lg: 'c_thumb,g_face,w_200,h_200,f_auto,q_auto',

  // Brand logos — fit inside square, no crop, black background
  brand_avatar: 'c_pad,w_100,h_100,b_rgb:000000,f_png',
  // Ad avatar in the feed: larger pad + 30px black border to read as a
  // tile against the dark video background. Mirrors the transform that
  // useAds.ts used inline before being centralised here.
  brand_ad_avatar: 'c_lpad,w_200,h_200,b_rgb:000000,bo_30px_solid_rgb:000000,f_png',

  // Content images — responsive widths
  thumb: 'c_limit,w_300,f_auto,q_auto',
  feed: 'c_limit,w_1500,f_auto,q_auto',
  full: 'c_limit,w_2000,f_auto,q_auto',

  // Chat images
  chat_sm: 'c_limit,w_400,f_auto,q_auto',
  chat_lg: 'c_limit,w_800,f_auto,q_auto',

  // Video thumbnails (so_0 = first frame). Reels render full-screen with
  // contentFit:cover, so the poster must be full-res (1080w) or it looks blurry
  // while the stream's first frame loads. Feed video is contained in a card, so
  // a smaller poster is fine there.
  video_thumb: 'c_limit,w_1080,h_1080,f_jpg,q_auto,so_0',
  reel_thumb: 'c_limit,w_1080,h_1920,f_jpg,q_auto,so_0',

  // Video delivery is handled by `cloudinaryHlsUrl` (adaptive HLS streaming) —
  // do not deliver the un-optimized original file. See helpers below.

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
  if (!transform) {
    return `${BASE}/${resourceType}/upload/${publicId}`;
  }
  return `${BASE}/${resourceType}/upload/${transform}/${publicId}`;
}

// ── Adaptive video streaming (HLS) ───────────────────────────────────────────

const HLS_TRANSFORM = 'sp_auto';
const HLS_PATH = `/video/upload/${HLS_TRANSFORM}/`;
// Strip any container extension before appending `.m3u8`.
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv|hevc|3gp|ogv|m3u8)$/i;
// MP4 fallback transform used if HLS can't be delivered (e.g. adaptive
// streaming not yet generated). Caps to 1080p (high quality on phones) with
// auto quality/format. HLS is still preferred and adapts up to the source.
const MP4_FALLBACK_TRANSFORM = 'f_auto:video,q_auto,w_1080,c_limit';

/**
 * Build an adaptive-bitrate HLS streaming URL (Cloudinary `sp_auto`).
 *
 * Instead of downloading the full original file before playback, the player
 * (AVPlayer on iOS / ExoPlayer on Android) fetches a small manifest + low-res
 * first segment, so video starts almost instantly and quality adapts to
 * bandwidth.
 *
 * NOTE: For instant first-play the backend should generate the `sp_auto` eager
 * transformation on upload. Otherwise Cloudinary derives it on the first
 * request (one-time delay, then CDN-cached). Use `hlsToMp4Fallback` to recover
 * if a given account/asset can't deliver HLS.
 *
 * @param publicId Cloudinary public_id, or a full URL (returned unchanged).
 */
export function cloudinaryHlsUrl(publicId: string | null | undefined): string | null {
  if (!publicId) return null;
  // Full URLs (legacy local uploads, external ad creatives) can't be transformed.
  if (publicId.startsWith('http')) return publicId;
  const cleanId = publicId.replace(VIDEO_EXT, '');
  return `${BASE}${HLS_PATH}${cleanId}.m3u8`;
}

/**
 * Poster (first-frame JPG) for a video, shown while the stream buffers so the
 * user never stares at a black rectangle.
 *
 * Returns null for full URLs (a frame can't be derived) and falsy ids.
 */
export function cloudinaryPoster(
  publicId: string | null | undefined,
  variant: 'reel' | 'video' = 'video'
): string | null {
  if (!publicId || publicId.startsWith('http')) return null;
  return cloudinaryUrl(
    publicId,
    variant === 'reel' ? 'reel_thumb' : 'video_thumb',
    'video'
  );
}

/**
 * Convert an HLS URL produced by `cloudinaryHlsUrl` into an optimized MP4
 * delivery URL, used as a runtime fallback when the player errors on the
 * `.m3u8` source. Returns null for any URL we didn't build (so we never
 * mangle external/legacy URLs).
 */
export function hlsToMp4Fallback(url: string | null | undefined): string | null {
  if (!url || !url.includes(HLS_PATH) || !url.endsWith('.m3u8')) return null;
  return url
    .replace(HLS_PATH, `/video/upload/${MP4_FALLBACK_TRANSFORM}/`)
    .replace(/\.m3u8$/, '');
}

/**
 * Fixed full-resolution MP4 (up to 1080p, never upscaled) for FULL-SCREEN reels.
 *
 * Why not HLS here: adaptive HLS ramps up from a low rung and, on short reels
 * the user swipes through quickly, frequently never reaches the top rung — so at
 * full-screen (`contentFit: cover`) the image stays visibly soft even on fast
 * wifi. The feed shows video small/contained, so the same ramp looks sharp there
 * and HLS stays the right choice. Delivering reels as a fixed high-res MP4
 * guarantees max quality up front; the only trade-off is no adaptive downgrade
 * on very slow networks (acceptable for short, quality-critical reels).
 *
 * Accepts a public_id OR an HLS url we already built (rewrites it to MP4).
 */
export function cloudinaryVideoMp4(publicId: string | null | undefined): string | null {
  if (!publicId) return null;
  // Already-built Cloudinary HLS url → rewrite to the MP4 transform.
  if (publicId.startsWith('http')) return hlsToMp4Fallback(publicId) ?? publicId;
  const cleanId = publicId.replace(VIDEO_EXT, '');
  return `${BASE}/video/upload/${MP4_FALLBACK_TRANSFORM}/${cleanId}.mp4`;
}

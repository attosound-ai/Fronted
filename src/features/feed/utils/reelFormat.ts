import type { FeedPost } from '@/types/post';

/**
 * Height / width threshold for a video to count as a "vertical" reel-format clip.
 * 9:16 ≈ 1.78; we accept anything that tall or taller so near-vertical uploads
 * still get the immersive treatment. Landscape/square videos stay below it.
 */
export const REEL_MIN_ASPECT = 1.6;

/** True when the given pixel dimensions describe a ~9:16-or-taller portrait frame. */
export function isReelAspect(width?: number, height?: number): boolean {
  if (!width || width <= 0 || !height || height <= 0) return false;
  return height / width >= REEL_MIN_ASPECT;
}

/**
 * A plain `video` post shot vertically (~9:16+). These render with the author
 * header overlaid inside the video (reel-style) in the home feed, while
 * landscape/square videos keep the normal header-above-media layout.
 */
export function isVerticalVideo(post: FeedPost): boolean {
  return post.type === 'video' && isReelAspect(post.mediaWidth, post.mediaHeight);
}

/**
 * True only when the frame is genuinely wider than tall (landscape). Used by the
 * full-screen reel viewer to letterbox (contain) such clips so they aren't
 * cropped — every portrait/square/unknown clip fills the screen (cover) instead,
 * matching the reels section. Requires both dimensions; unknown → not landscape.
 */
export function isLandscapeVideo(width?: number, height?: number): boolean {
  if (!width || width <= 0 || !height || height <= 0) return false;
  return width > height;
}

/**
 * Reel-eligible = an actual reel, OR a video shot vertically (~9:16+) so it
 * fills the full-screen player cleanly. Landscape/square videos stay in the
 * regular feed only.
 */
export function isReelEligible(post: FeedPost): boolean {
  if (post.type === 'reel') return true;
  return isVerticalVideo(post);
}

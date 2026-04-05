import type { FeedPost } from '@/types/post';

/**
 * Distribute ads evenly throughout a list of posts.
 *
 * @param posts  Real feed posts.
 * @param ads    Ad posts to inject.
 * @param every  Insert an ad every N real posts (default 2).
 * @param slotOffset  Skip the first N ad slots (avoids duplicate ads across segments).
 */
export function injectAds(posts: FeedPost[], ads: FeedPost[], every = 2, slotOffset = 0): FeedPost[] {
  if (ads.length === 0) return posts;

  const result: FeedPost[] = [];
  let adIndex = slotOffset % ads.length;
  let realCount = 0;

  for (const post of posts) {
    result.push(post);
    realCount++;
    if (realCount % every === 0) {
      const ad = ads[adIndex % ads.length];
      result.push({ ...ad, id: `${ad.id}-${slotOffset + adIndex}` });
      adIndex++;
    }
  }

  return result;
}

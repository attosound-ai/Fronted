import type { FeedPost } from '@/types/post';

/**
 * Inserts ad items into a post array at a regular interval.
 *
 * Pattern: [post, post, AD, post, post, AD, ...]
 *
 * @param posts   Real posts from the feed/reels API
 * @param ads     Ad pool (cycles through if exhausted)
 * @param every   Insert one ad after every N real posts (default: 2)
 */
export function injectAds(posts: FeedPost[], ads: FeedPost[], every = 2, slotOffset = 0): FeedPost[] {
  if (ads.length === 0 || posts.length === 0) return posts;

  const result: FeedPost[] = [];
  let adSlot = slotOffset;

  for (let i = 0; i < posts.length; i++) {
    result.push(posts[i]);
    if ((i + 1) % every === 0) {
      const ad = ads[adSlot % ads.length];
      // Unique key per position to avoid FlatList key collisions
      result.push({ ...ad, id: `${ad.id}-slot${adSlot}` });
      adSlot++;
    }
  }

  return result;
}

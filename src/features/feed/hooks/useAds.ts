import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import {
  cloudinaryUrl,
  cloudinaryHlsUrl,
  cloudinaryPoster,
} from '@/lib/media/cloudinaryUrl';
import type { FeedPost } from '@/types/post';

interface AdData {
  id: string;
  videoUrl: string;
  brandName: string;
  brandAvatar: string | null;
  caption: string;
  linkUrl: string | null;
  sortOrder: number;
}

function adToFeedPost(ad: AdData): FeedPost {
  return {
    id: `ad-${ad.id}`,
    type: 'reel',
    author: {
      id: 0,
      username: ad.brandName.toLowerCase().replace(/\s+/g, ''),
      displayName: ad.brandName,
      // brandAvatar is a Cloudinary public_id (the admin at atto-web posts
      // it that way to keep the transform applicable). Routing through
      // cloudinaryUrl keeps the cloud name in EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME
      // so web + mobile always agree on which Cloudinary account to hit.
      avatar: cloudinaryUrl(ad.brandAvatar, 'brand_ad_avatar'),
      isFollowing: false,
    },
    // Ad creatives are Cloudinary public_ids — stream them adaptively (HLS)
    // with a poster, same as user posts.
    videoUrl: cloudinaryHlsUrl(ad.videoUrl) ?? ad.videoUrl,
    thumbnailUrl: cloudinaryPoster(ad.videoUrl, 'reel') ?? undefined,
    description: ad.caption,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    repostsCount: 0,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date().toISOString(),
    isAd: true,
  };
}

export function useAds() {
  const { data } = useQuery({
    queryKey: ['feed-ads'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.POSTS.ADS);
      return (res.data.data || []) as AdData[];
    },
    staleTime: 10 * 60 * 1000, // 10 min
  });

  return (data || []).map(adToFeedPost);
}

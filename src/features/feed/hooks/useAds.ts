import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
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
      avatar: ad.brandAvatar
        ? `https://res.cloudinary.com/dxzcutnlp/image/upload/c_lpad,w_200,h_200,b_rgb:000000,bo_30px_solid_rgb:000000,f_png/${ad.brandAvatar}`
        : null,
      isFollowing: false,
    },
    videoUrl: ad.videoUrl,
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

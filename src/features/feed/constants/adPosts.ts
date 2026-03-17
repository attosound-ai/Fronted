import type { FeedPost } from '@/types/post';

export const DEMO_ADS: FeedPost[] = [
  {
    id: 'ad-demo-1',
    type: 'ad',
    isAd: true,
    videoUrl:
      'https://res.cloudinary.com/dxzcutnlp/video/upload/v1773252179/ssstik.io_1773249823368_qquvgl.mov',
    author: {
      id: 0,
      username: 'nike',
      displayName: 'Nike',
      avatar: 'https://img.icons8.com/ios-filled/200/ffffff/nike.png',
      isFollowing: false,
    },
    description: 'JustDoit',
    likesCount: 2841,
    commentsCount: 134,
    sharesCount: 89,
    repostsCount: 47,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'ad-demo-2',
    type: 'ad',
    isAd: true,
    videoUrl:
      'https://res.cloudinary.com/dxzcutnlp/video/upload/v1773252797/ssstik.io_1773252767701_za6rjf.mov',
    author: {
      id: 0,
      username: 'mcdonalds',
      displayName: "McDonald's",
      avatar: 'https://img.icons8.com/color/200/mcdonalds.png',
      isFollowing: false,
    },
    description: "I'm lovin' it",
    likesCount: 5203,
    commentsCount: 312,
    sharesCount: 201,
    repostsCount: 98,
    isLiked: false,
    isBookmarked: false,
    isReposted: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

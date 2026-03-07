/**
 * Placeholder posts shown to all users in the feed.
 * These are static, local content — not fetched from the API.
 */

import type { FeedPost } from '@/types/post';

const ATTO_AUTHOR = {
  id: 0,
  username: 'ATTO',
  displayName: 'ATTO Sound',
  avatar: null,
  isFollowing: false,
  isVerified: true,
} as const;

export const PLACEHOLDER_POSTS: FeedPost[] = [
  {
    id: 'placeholder-hoodie',
    type: 'image',
    author: ATTO_AUTHOR,
    images: [
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1772736166/Disen%CC%83o_sin_ti%CC%81tulo_jdqksz.png',
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1772729705/5fffc21e-4ec4-4007-9281-c9c6f82ced75_tjwurs.jpg',
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1772729705/b0c7cf25-29b0-423a-b1a7-d6d099bf84be_pmlubv.jpg',
      'https://res.cloudinary.com/dxzcutnlp/image/upload/v1772729705/fefe133f-4302-4e21-9f3a-8535ba5c5597_ukl1vd.jpg',
    ],
    description: 'New merch dropping soon 🔥🔥🔥',
    likesCount: 1240,
    commentsCount: 38,
    sharesCount: 156,
    repostsCount: 89,
    isLiked: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'placeholder-song',
    type: 'audio',
    author: {
      id: 1,
      username: 'Suicide King',
      displayName: 'Suicide King',
      avatar:
        'https://res.cloudinary.com/da9vymoah/image/upload/v1772838792/WhatsApp_Image_2026-03-06_at_11.26.53_e2plfm.jpg',
      isFollowing: false,
      isVerified: true,
    },
    audioUrl:
      'https://res.cloudinary.com/da9vymoah/video/upload/v1772839154/AUDIO-2026-03-06-11-30-06_vekhdt.mp3',
    title: 'Unreleased Track',
    description: 'Preview of something special coming your way',
    likesCount: 120_000,
    commentsCount: 842,
    sharesCount: 5_300,
    repostsCount: 2_100,
    isLiked: false,
    createdAt: new Date().toISOString(),
  },
];

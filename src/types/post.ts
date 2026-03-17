/**
 * Post Type System
 *
 * Modular post types following SOLID principles:
 * - Open/Closed: New types added by extending PostType union
 * - Interface Segregation: Components consume only what they need
 */

export type PostType = 'audio' | 'video' | 'image' | 'text' | 'reel' | 'ad';

export interface PostAuthor {
  id: number;
  username: string;
  displayName: string;
  avatar: string | null;
  isFollowing: boolean;
  isVerified?: boolean;
}

export type OnProfilePress = (author: PostAuthor) => void;

export interface FeedPost {
  id: string;
  type: PostType;
  author: PostAuthor;
  // Media (depends on type)
  audioUrl?: string;
  videoUrl?: string;
  images?: string[];
  thumbnailUrl?: string;
  duration?: number;
  // Content
  title?: string;
  description?: string;
  // Engagement
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  repostsCount: number;
  isLiked: boolean;
  isBookmarked?: boolean;
  isReposted?: boolean;
  // Meta
  createdAt: string;
  // Ads
  isAd?: boolean;
}

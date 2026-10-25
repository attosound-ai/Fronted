import { cloudinaryUrl } from '../../../lib/media/cloudinaryUrl';
import type { Post } from '../../../types';
import type { FeedApiPost } from '../types';

/** Map a backend FeedApiPost into the frontend Post shape. */
export function mapApiPost(raw: FeedApiPost): Post {
  return {
    id: raw.id,
    content: raw.textContent || '',
    images:
      raw.contentType === 'image'
        ? raw.filePaths.map((fp) => cloudinaryUrl(fp, 'feed') ?? fp)
        : [],
    author: {
      id: Number(raw.author?.id) || 0,
      username: raw.author?.username || 'unknown',
      displayName: raw.author?.displayName || raw.author?.username || 'Unknown',
      avatar: raw.author?.avatar || null,
      role: raw.author?.role ?? 'listener',
    } as Post['author'],
    likesCount: raw.interactions?.likesCount ?? 0,
    commentsCount: raw.interactions?.commentsCount ?? 0,
    isLiked: raw.interactions?.isLiked ?? false,
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || raw.createdAt || '',
    contentType: raw.contentType,
    textContent: raw.textContent,
    filePaths: raw.filePaths,
    metadata: raw.metadata,
    tags: raw.tags,
    sharesCount: raw.interactions?.sharesCount ?? 0,
    repostsCount: raw.interactions?.repostsCount ?? 0,
    isBookmarked: raw.interactions?.isBookmarked ?? false,
    isReposted: raw.interactions?.isReposted ?? false,
    isFollowingAuthor: raw.isFollowingAuthor,
  };
}

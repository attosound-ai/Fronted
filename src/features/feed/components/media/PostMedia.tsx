import type { FeedPost, PostAuthor } from '@/types/post';
import { AudioMedia } from './AudioMedia';
import { ImageMedia } from './ImageMedia';
import { VideoMedia } from './VideoMedia';
import { ReelMedia } from './ReelMedia';
import { PoemMedia } from './PoemMedia';

interface PostMediaProps {
  post: FeedPost;
  onDoubleTap?: () => void;
  isVisible?: boolean;
  onLike?: (postId: string) => void;
  onComment?: () => void;
  onShare?: () => void;
  onProfilePress?: (author: PostAuthor) => void;
  onFollow?: (userId: number) => void;
  onBookmark?: () => void;
  onReport?: () => void;
}

/**
 * PostMedia — Renders the correct media component based on post type.
 *
 * Open/Closed: Add new post types by importing a new component
 * and adding a case to the switch.
 */
export function PostMedia({
  post,
  onDoubleTap,
  isVisible,
  onLike,
  onComment,
  onShare,
  onProfilePress,
  onFollow,
  onBookmark,
  onReport,
}: PostMediaProps) {
  switch (post.type) {
    case 'audio':
      return <AudioMedia post={post} />;
    case 'image':
      return <ImageMedia post={post} onDoubleTap={onDoubleTap} />;
    case 'video':
      return <VideoMedia post={post} isVisible={isVisible} />;
    case 'reel':
      return (
        <ReelMedia
          post={post}
          isVisible={isVisible}
          onProfilePress={onProfilePress}
          onFollow={onFollow}
          onBookmark={onBookmark}
          onReport={onReport}
        />
      );
    case 'text':
      return <PoemMedia post={post} />;
    default:
      return null;
  }
}

import type { FeedPost, PostAuthor } from '@/types/post';
import { AudioMedia } from './AudioMedia';
import { ImageMedia } from './ImageMedia';
import { VideoMedia } from './VideoMedia';
import { ReelMedia } from './ReelMedia';
import { PoemMedia } from './PoemMedia';
import { isVerticalVideo } from '../../utils/reelFormat';

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
  onDelete?: () => void;
  /** Tap a video to expand it full-screen (reel viewer). Home feed only. */
  onOpenReel?: () => void;
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
  onDelete,
  onOpenReel,
}: PostMediaProps) {
  switch (post.type) {
    case 'audio':
      return <AudioMedia post={post} />;
    case 'image':
      return <ImageMedia post={post} onDoubleTap={onDoubleTap} />;
    case 'video':
      // Vertical (~9:16) clips read like reels: the author row (avatar · name ·
      // follow · ⋯) is drawn INSIDE the video at the top edge. Landscape/square
      // videos keep the normal header above the media.
      return (
        <VideoMedia
          post={post}
          isVisible={isVisible}
          onPress={onOpenReel}
          onDoubleTap={onDoubleTap}
          overlayHeader={isVerticalVideo(post)}
          onProfilePress={onProfilePress}
          onFollow={onFollow}
          onBookmark={onBookmark}
          onReport={onReport}
          onDelete={onDelete}
        />
      );
    case 'reel':
      return (
        <ReelMedia
          post={post}
          isVisible={isVisible}
          onProfilePress={onProfilePress}
          onFollow={onFollow}
          onBookmark={onBookmark}
          onReport={onReport}
          onDelete={onDelete}
          onDoubleTap={onDoubleTap}
        />
      );
    case 'text':
      return <PoemMedia post={post} />;
    default:
      return null;
  }
}

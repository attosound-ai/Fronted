import type { FeedPost } from '@/types/post';
import { AudioMedia } from './AudioMedia';
import { ImageMedia } from './ImageMedia';
import { VideoMedia } from './VideoMedia';

interface PostMediaProps {
  post: FeedPost;
  onDoubleTap?: () => void;
}

/**
 * PostMedia — Renders the correct media component based on post type.
 *
 * Open/Closed: Add new post types by importing a new component
 * and adding a case to the switch.
 */
export function PostMedia({ post, onDoubleTap }: PostMediaProps) {
  switch (post.type) {
    case 'audio':
      return <AudioMedia post={post} />;
    case 'image':
      return <ImageMedia post={post} onDoubleTap={onDoubleTap} />;
    case 'video':
      return <VideoMedia post={post} />;
    case 'text':
      return null;
    default:
      return null;
  }
}

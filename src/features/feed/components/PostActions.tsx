import { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { MessageCircle, Repeat, Send, Heart } from 'lucide-react-native';
import { ThumbsUpIcon } from '@/components/ui/ThumbsUpIcon';
import { formatCount } from '@/utils/formatters';
import type { FeedPost } from '@/types/post';

interface PostActionsProps {
  post: FeedPost;
  onLike?: (postId: string) => void;
  onComment?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
  onShowSupport?: () => void;
  onShowInteractors?: (type: 'likes' | 'reposts' | 'shares') => void;
}

export function PostActions({
  post,
  onLike,
  onComment,
  onRepost,
  onShare,
  onShowSupport,
  onShowInteractors,
}: PostActionsProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleLike = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 50,
        bounciness: 12,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
      }),
    ]).start();
    onLike?.(post.id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftActions}>
        <TouchableOpacity
          onPress={handleLike}
          onLongPress={() => onShowInteractors?.('likes')}
          delayLongPress={400}
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <ThumbsUpIcon size={26} color="#FFFFFF" filled={post.isLiked} />
          </Animated.View>
          {post.likesCount > 0 && (
            <Text style={styles.metricText}>{formatCount(post.likesCount)}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onComment}
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <MessageCircle size={26} color="#FFF" strokeWidth={2.25} />
          {post.commentsCount > 0 && (
            <Text style={styles.metricText}>{formatCount(post.commentsCount)}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onRepost}
          onLongPress={() => onShowInteractors?.('reposts')}
          delayLongPress={400}
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <Repeat size={26} color="#FFF" strokeWidth={2.25} />
          {post.repostsCount > 0 && (
            <Text style={[styles.metricText, post.isReposted && styles.repostedText]}>
              {formatCount(post.repostsCount)}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onShare} onLongPress={() => onShowInteractors?.('shares')} delayLongPress={400} activeOpacity={0.7} style={styles.actionItem}>
          <Send size={26} color="#FFF" strokeWidth={2.25} />
          {post.sharesCount > 0 && (
            <Text style={styles.metricText}>{formatCount(post.sharesCount)}</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onShowSupport} activeOpacity={0.7}>
        <View style={styles.heartContainer}>
          <Heart size={34} color="#FFF" strokeWidth={2.25} />
          <View style={styles.dollarStroke} />
          <Text style={styles.heartS}>S</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'Archivo_500Medium',
  },
  repostedText: {
    color: '#FFF',
  },
  heartContainer: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dollarStroke: {
    position: 'absolute',
    width: 1.5,
    height: 20,
    top: 8,
    backgroundColor: '#FFF',
  },
  heartS: {
    position: 'absolute',
    top: 10.5,
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_700Bold',
  },
});

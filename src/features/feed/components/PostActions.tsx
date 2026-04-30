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
            <ThumbsUpIcon size={28} color="#FFFFFF" filled={post.isLiked} />
          </Animated.View>
          {post.likesCount > 0 && (
            <Text style={styles.metricText} maxFontSizeMultiplier={1.0}>
              {formatCount(post.likesCount)}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onComment}
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <MessageCircle size={28} color="#FFF" strokeWidth={2.25} />
          {post.commentsCount > 0 && (
            <Text style={styles.metricText} maxFontSizeMultiplier={1.0}>
              {formatCount(post.commentsCount)}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onRepost}
          onLongPress={() => onShowInteractors?.('reposts')}
          delayLongPress={400}
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <Repeat size={28} color="#FFF" strokeWidth={2.25} />
          {post.repostsCount > 0 && (
            <Text
              style={[styles.metricText, post.isReposted && styles.repostedText]}
              maxFontSizeMultiplier={1.0}
            >
              {formatCount(post.repostsCount)}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onShare}
          onLongPress={() => onShowInteractors?.('shares')}
          delayLongPress={400}
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <Send size={28} color="#FFF" strokeWidth={2.25} />
          {post.sharesCount > 0 && (
            <Text style={styles.metricText} maxFontSizeMultiplier={1.0}>
              {formatCount(post.sharesCount)}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Donate button is only meaningful on creator posts — listeners
          and representatives don't accept tips, so the button is hidden
          for them. */}
      {post.author.role === 'creator' && (
        <TouchableOpacity onPress={onShowSupport} activeOpacity={0.7}>
          <View style={styles.heartContainer}>
            <Heart size={36} color="#FFF" strokeWidth={2.25} />
            <View style={styles.dollarStroke} />
            <Text
              style={styles.heartS}
              maxFontSizeMultiplier={1.0}
              allowFontScaling={false}
            >
              S
            </Text>
          </View>
        </TouchableOpacity>
      )}
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dollarStroke: {
    position: 'absolute',
    width: 1.5,
    height: 21,
    top: 8.5,
    backgroundColor: '#FFF',
  },
  heartS: {
    position: 'absolute',
    top: 11,
    color: '#FFF',
    fontSize: 13,
    fontFamily: 'Archivo_700Bold',
  },
});

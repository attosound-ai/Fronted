import { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatCount } from '@/utils/formatters';
import type { FeedPost } from '@/types/post';

interface PostActionsProps {
  post: FeedPost;
  onLike?: (postId: string) => void;
  onComment?: () => void;
  onRepost?: () => void;
  onShare?: () => void;
  onShowSupport?: () => void;
}

export function PostActions({
  post,
  onLike,
  onComment,
  onRepost,
  onShare,
  onShowSupport,
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
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <MaterialCommunityIcons
              name={post.isLiked ? 'thumb-up' : 'thumb-up-outline'}
              size={26}
              color="#FFFFFF"
            />
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
          <Ionicons
            name="chatbubble-outline"
            size={26}
            color="#FFF"
            style={styles.flippedIcon}
          />
          {post.commentsCount > 0 && (
            <Text style={styles.metricText}>{formatCount(post.commentsCount)}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onRepost}
          activeOpacity={0.7}
          style={styles.actionItem}
        >
          <Feather name="repeat" size={24} color="#FFF" />
          {post.repostsCount > 0 && (
            <Text style={[styles.metricText, post.isReposted && styles.repostedText]}>
              {formatCount(post.repostsCount)}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onShare} activeOpacity={0.7} style={styles.actionItem}>
          <Ionicons name="paper-plane-outline" size={26} color="#FFF" />
          {post.sharesCount > 0 && (
            <Text style={styles.metricText}>{formatCount(post.sharesCount)}</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onShowSupport} activeOpacity={0.7}>
        <View style={styles.heartContainer}>
          <Ionicons name="heart-outline" size={34} color="#FFF" />
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
  flippedIcon: {
    transform: [{ scaleX: -1 }],
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
    top: 7,
    backgroundColor: '#FFF',
  },
  heartS: {
    position: 'absolute',
    top: 8.5,
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_700Bold',
  },
});

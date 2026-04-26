import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Text as RNText,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { formatCount } from '@/utils/formatters';
import type { FeedPost } from '@/types/post';

interface AdCardProps {
  post: FeedPost;
  isVisible?: boolean;
  onComment?: () => void;
  onShare?: () => void;
}

export function AdCard({ post, isVisible = false, onComment, onShare }: AdCardProps) {
  const { contentWidth } = useDeviceLayout();
  const VIDEO_HEIGHT = contentWidth * 1.6;
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [isReposted, setIsReposted] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [repostsCount, setRepostsCount] = useState(post.repostsCount);
  const [descExpanded, setDescExpanded] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const player = useVideoPlayer(post.videoUrl ?? null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (!player) return;
    if (isVisible) {
      player.play();
    } else {
      player.pause();
    }
  }, [isVisible, player]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      player.muted = !prev;
      return !prev;
    });
  }, [player]);

  const handleLike = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 50,
        bounciness: 12,
      }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }),
    ]).start();
    setIsLiked((prev) => {
      setLikesCount((c) => (prev ? c - 1 : c + 1));
      return !prev;
    });
  };

  const handleRepost = () => {
    setIsReposted((prev) => {
      setRepostsCount((c) => (prev ? c - 1 : c + 1));
      return !prev;
    });
  };

  return (
    <View style={styles.container}>
      {/* Video */}
      <View
        style={[styles.videoContainer, { width: contentWidth, height: VIDEO_HEIGHT }]}
      >
        {post.videoUrl ? (
          <VideoView
            player={player}
            style={styles.video}
            contentFit="cover"
            nativeControls={false}
          />
        ) : (
          <View
            style={[styles.placeholder, { width: contentWidth, height: VIDEO_HEIGHT }]}
          >
            <Ionicons name="videocam-off-outline" size={48} color="#666" />
          </View>
        )}

        {/* Top gradient + header overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          style={styles.topGradient}
          pointerEvents="box-none"
        >
          <View style={styles.header}>
            <Avatar uri={post.author.avatar} size="md" />
            <Text style={styles.authorName}>{post.author.displayName}</Text>
            <View style={styles.sponsoredBadge}>
              <Ionicons name="megaphone-outline" size={11} color="#CCC" />
              <Text style={styles.sponsoredText} allowFontScaling={false}>
                Sponsored
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Bottom gradient (visual only) */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {/* Mute toggle */}
        <TouchableOpacity style={styles.muteButton} onPress={toggleMute} hitSlop={8}>
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={18}
            color="#FFF"
          />
        </TouchableOpacity>
      </View>

      {/* Actions (outside video) */}
      <View style={styles.actions}>
        <View style={styles.leftActions}>
          <TouchableOpacity
            onPress={handleLike}
            activeOpacity={0.7}
            style={styles.actionItem}
          >
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <MaterialCommunityIcons
                name={isLiked ? 'thumb-up' : 'thumb-up-outline'}
                size={26}
                color="#FFF"
              />
            </Animated.View>
            {likesCount > 0 && (
              <RNText style={styles.metricText}>{formatCount(likesCount)}</RNText>
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
              <RNText style={styles.metricText}>{formatCount(post.commentsCount)}</RNText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRepost}
            activeOpacity={0.7}
            style={styles.actionItem}
          >
            <Feather name="repeat" size={24} color="#FFF" />
            {repostsCount > 0 && (
              <RNText style={[styles.metricText, isReposted && styles.repostedText]}>
                {formatCount(repostsCount)}
              </RNText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onShare}
            activeOpacity={0.7}
            style={styles.actionItem}
          >
            <Ionicons name="paper-plane-outline" size={26} color="#FFF" />
            {post.sharesCount > 0 && (
              <RNText style={styles.metricText}>{formatCount(post.sharesCount)}</RNText>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Description (outside video) */}
      <View style={styles.engagement}>
        {post.description && (
          <Text
            style={styles.description}
            numberOfLines={descExpanded ? undefined : 2}
            onPress={() => setDescExpanded((v) => !v)}
          >
            <Text style={styles.descriptionUsername}>{post.author.displayName}</Text>
            {'  '}
            {post.description}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    marginBottom: 16,
  },

  // Video
  videoContainer: {
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Top gradient overlay
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  authorName: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sponsoredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 2,
  },
  sponsoredText: {
    color: '#CCC',
    fontSize: 11,
    fontFamily: 'Archivo_500Medium',
    letterSpacing: 0.3,
  },

  // Bottom gradient (visual fade on video)
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '25%',
  },

  // Actions (outside video)
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
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

  // Engagement (outside video)
  engagement: {
    paddingHorizontal: 12,
    gap: 4,
    paddingBottom: 12,
  },
  description: {
    color: '#FFF',
    fontSize: 14,
    lineHeight: 20,
  },
  descriptionUsername: {
    fontFamily: 'Archivo_600SemiBold',
  },

  // Mute button
  muteButton: {
    position: 'absolute',
    bottom: 56,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

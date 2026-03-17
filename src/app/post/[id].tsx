import { useState, useCallback } from 'react';
import { View, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { FeedPostCard } from '@/features/feed/components/FeedPostCard';
import { CommentsSheet } from '@/features/feed/components/comments/CommentsSheet';
import { ShareSheet } from '@/features/feed/components/share/ShareSheet';
import { useEngagement } from '@/features/feed/hooks/useEngagement';
import { useFollowFeed } from '@/features/feed/hooks/useFollowFeed';
import { feedService } from '@/features/feed/services/feedService';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Post } from '@/types';
import type { FeedPost, PostAuthor, PostType } from '@/types/post';

// ── Post → FeedPost conversion (same as bookmarks.tsx) ──────────────────────

function resolvePostType(post: Post): PostType {
  if (post.contentType) return post.contentType as PostType;
  if (post.images && post.images.length > 0) return 'image';
  return 'text';
}

function toFeedPost(post: Post): FeedPost {
  const type = resolvePostType(post);
  const files = post.filePaths ?? post.images ?? [];
  return {
    id: post.id,
    type,
    author: {
      id: post.author.id,
      username: post.author.username,
      displayName: post.author.displayName,
      avatar: post.author.avatar,
      isFollowing: false,
    },
    images: type === 'image' ? files : undefined,
    audioUrl: type === 'audio' ? files[0] : undefined,
    videoUrl: type === 'video' || type === 'reel' ? files[0] : undefined,
    thumbnailUrl: post.metadata?.thumbnailUrl,
    duration: post.metadata?.duration ? Number(post.metadata.duration) : undefined,
    description: post.textContent ?? post.content,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    sharesCount: post.sharesCount ?? 0,
    repostsCount: post.repostsCount ?? 0,
    isLiked: post.isLiked,
    isBookmarked: post.isBookmarked,
    isReposted: post.isReposted,
    createdAt: post.createdAt,
  };
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [sharePost, setSharePost] = useState<FeedPost | null>(null);
  const { toggleBookmark, toggleRepost } = useEngagement();
  const { toggleFollow, getIsFollowing } = useFollowFeed();
  const queryClient = useQueryClient();

  const {
    data: post,
    isLoading,
    isError,
  } = useQuery({
    queryKey: QUERY_KEYS.FEED.POST(id),
    queryFn: () => feedService.getPost(id),
    enabled: !!id,
  });

  const likeMutation = useMutation({
    mutationFn: async (isLiked: boolean) => {
      if (isLiked) {
        await feedService.unlikePost(id);
      } else {
        await feedService.likePost(id);
      }
    },
    onMutate: async (isLiked) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.FEED.POST(id) });
      const prev = queryClient.getQueryData<Post>(QUERY_KEYS.FEED.POST(id));
      queryClient.setQueryData<Post>(QUERY_KEYS.FEED.POST(id), (old) =>
        old
          ? {
              ...old,
              isLiked: !isLiked,
              likesCount: isLiked ? old.likesCount - 1 : old.likesCount + 1,
            }
          : old
      );
      return { prev };
    },
    onError: (_, __, context) => {
      if (context?.prev) queryClient.setQueryData(QUERY_KEYS.FEED.POST(id), context.prev);
    },
  });

  const baseFeedPost = post ? toFeedPost(post) : null;
  const feedPost = baseFeedPost
    ? {
        ...baseFeedPost,
        author: {
          ...baseFeedPost.author,
          isFollowing: getIsFollowing(baseFeedPost.author.id, false),
        },
      }
    : null;

  const handleFollow = useCallback(
    (userId: number) => {
      toggleFollow(userId, getIsFollowing(userId, false));
    },
    [toggleFollow, getIsFollowing]
  );

  const handleProfilePress = useCallback((author: PostAuthor) => {
    router.push({
      pathname: '/user/[id]',
      params: {
        id: String(author.id),
        displayName: author.displayName,
        username: author.username,
        avatar: author.avatar ?? '',
        verified: author.isVerified ? '1' : '0',
      },
    });
  }, []);

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.centered}>
          <ActivityIndicator color="#FFF" />
        </View>
      )}

      {isError && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Couldn't load this post.</Text>
        </View>
      )}

      {feedPost && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <FeedPostCard
            post={feedPost}
            isVisible
            onLike={() => likeMutation.mutate(feedPost.isLiked ?? false)}
            onComment={() => setCommentsOpen(true)}
            onRepost={() => toggleRepost(feedPost.id)}
            onShare={() => setSharePost(feedPost)}
            onFollow={handleFollow}
            onBookmark={() => toggleBookmark(feedPost.id)}
            onProfilePress={handleProfilePress}
          />
        </ScrollView>
      )}

      {/* Comments sheet */}
      {commentsOpen && feedPost && (
        <CommentsSheet
          postId={feedPost.id}
          visible={commentsOpen}
          onClose={() => setCommentsOpen(false)}
        />
      )}

      {/* Share sheet */}
      {sharePost && (
        <ShareSheet visible onClose={() => setSharePost(null)} post={sharePost} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#666',
  },
});

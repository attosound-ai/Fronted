/**
 * Full-screen reel viewer — opened by tapping a video in the home feed
 * (Instagram-style "expand into the reel feed").
 *
 * Reuses the exact reels pager (ReelsFeed) by SEEDING it with the source feed's
 * posts via usePostFeed — which reorders the list so the tapped video is first
 * and paginates the rest — so the user can keep swiping vertically through the
 * feed's videos with all the normal reel controls (like / comment / share /
 * bookmark / mute / tap-to-pause), plus a back button to collapse.
 */
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { ReelsFeed } from '@/features/feed/components/ReelsFeed';
import {
  ReelViewerTabBar,
  type ReelViewerTab,
} from '@/components/navigation/ReelViewerTabBar';
import { usePostFeed, type PostFeedSource } from '@/features/feed/hooks/usePostFeed';
import { COLORS } from '@/constants/theme';

// Map the source the viewer was opened from to the tab it should highlight /
// return to, so the floating navbar behaves like the one on that tab.
function sourceToTab(source: PostFeedSource): ReelViewerTab {
  if (source === 'search') return 'search';
  if (source === 'profile') return 'profile';
  return 'index';
}

const VALID_SOURCES: readonly PostFeedSource[] = [
  'profile',
  'search',
  'bookmarks',
  'feed',
  'single',
];

function parseSource(raw?: string): PostFeedSource {
  if (raw && (VALID_SOURCES as readonly string[]).includes(raw)) {
    return raw as PostFeedSource;
  }
  // Tapping from the home feed is the primary entry point.
  return 'feed';
}

export default function ReelViewerScreen() {
  const params = useLocalSearchParams<{
    id: string;
    source?: string;
    sourceUserId?: string;
    sourceQuery?: string;
    sourceContentType?: string;
  }>();
  const { id, sourceQuery, sourceContentType } = params;
  const source = parseSource(params.source);
  const sourceUserId = params.sourceUserId ? Number(params.sourceUserId) : undefined;

  const { posts, isFetchingMore, loadMore } = usePostFeed({
    initialPostId: id,
    source,
    sourceUserId,
    sourceQuery,
    sourceContentType,
  });

  // Wait for the source list (incl. the tapped video) before mounting the pager,
  // so it opens directly on the right video without a flash.
  if (posts.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#FFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ReelsFeed
        seedPosts={posts}
        initialPostId={id}
        onClose={() => router.back()}
        onEndReached={loadMore}
        isFetchingMore={isFetchingMore}
      />
      {/* Floating navbar — the tabs navigator's bar can't reach this pushed
          route, so mirror it here (keeps the bar visible on the full-screen
          viewer, like Instagram). */}
      <ReelViewerTabBar activeTab={sourceToTab(source)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  loading: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

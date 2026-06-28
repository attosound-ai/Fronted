import { View, StyleSheet } from 'react-native';

import { Toast } from '@/components/ui/Toast';
import { FeedHeader, FEED_HEADER_BAR_HEIGHT } from '@/components/feed/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { VerificationBanner } from '@/features/verification';
import { SuggestedAccountsCarousel } from '@/features/feed/components/SuggestedAccountsCarousel';
import { ResponsiveContentWrapper } from '@/components/layout/ResponsiveContentWrapper';
import { useScreenTopInset } from '@/hooks/useInCallChrome';
import { COLORS } from '@/constants/theme';

export default function HomeScreen() {
  // The header is an absolute blur overlay, so the feed fills the screen and
  // offsets its own content by the header's full height via a spacer. The top
  // inset matches FeedHeader's: 0 when the green call bar already owns the
  // status-bar area (no doubled gap), else the real safe-area inset.
  const topInset = useScreenTopInset();
  const headerOffset = topInset + FEED_HEADER_BAR_HEIGHT;

  return (
    <View style={styles.container}>
      <FeedHeader />

      <ResponsiveContentWrapper>
        <FeedList
          ListHeaderComponent={
            <>
              <View style={{ height: headerOffset }} />
              <SuggestedAccountsCarousel />
              <VerificationBanner />
            </>
          }
        />
      </ResponsiveContentWrapper>

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
});

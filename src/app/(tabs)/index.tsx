import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast } from '@/components/ui/Toast';
import { FeedHeader, FEED_HEADER_BAR_HEIGHT } from '@/components/feed/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { VerificationBanner } from '@/features/verification';
import { SuggestedAccountsCarousel } from '@/features/feed/components/SuggestedAccountsCarousel';
import { ResponsiveContentWrapper } from '@/components/layout/ResponsiveContentWrapper';
import { useCallStore } from '@/stores/callStore';
import { COLORS } from '@/constants/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isInCall = useCallStore(
    (s) => s.activeCall?.state === 'connected' || s.activeCall?.state === 'reconnecting'
  );

  // The header is now an absolute blur overlay, so the feed fills the screen and
  // offsets its own content by the header's full height (safe-area inset + bar)
  // via a spacer — content then scrolls *under* the translucent header.
  const headerOffset = insets.top + FEED_HEADER_BAR_HEIGHT;

  return (
    <View style={[styles.container, { paddingTop: isInCall ? 8 : 0 }]}>
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

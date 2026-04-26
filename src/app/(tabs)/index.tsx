import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast } from '@/components/ui/Toast';
import { FeedHeader } from '@/components/feed/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { VerificationBanner } from '@/features/verification';
import { SuggestedAccountsCarousel } from '@/features/feed/components/SuggestedAccountsCarousel';
import { ResponsiveContentWrapper } from '@/components/layout/ResponsiveContentWrapper';
import { useCallStore } from '@/stores/callStore';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isInCall = useCallStore((s) =>
    s.activeCall?.state === 'connected' || s.activeCall?.state === 'reconnecting',
  );

  return (
    <View style={[styles.container, { paddingTop: isInCall ? 8 : insets.top }]}>
      <FeedHeader />

      <ResponsiveContentWrapper>
        <FeedList
          ListHeaderComponent={
            <>
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
    backgroundColor: '#000000',
  },
});

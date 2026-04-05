import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast } from '@/components/ui/Toast';
import { FeedHeader } from '@/components/feed/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { VerificationBanner } from '@/features/verification';
import { SuggestedAccountsCarousel } from '@/features/feed/components/SuggestedAccountsCarousel';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FeedHeader />
      <VerificationBanner />
      <FeedList ListHeaderComponent={<SuggestedAccountsCarousel />} />
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

import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Toast } from '@/components/ui/Toast';
import { FeedHeader } from '@/components/feed/FeedHeader';
import { FeedList } from '@/features/feed/components/FeedList';
import { VerificationBanner } from '@/features/verification';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FeedHeader />
      <VerificationBanner />
      <FeedList />
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});

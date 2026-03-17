import { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { Toast } from '@/components/ui/Toast';
import { AccountSwitcherBottomSheet } from '@/components/ui/AccountSwitcherBottomSheet';
import { useAuthStore } from '@/stores/authStore';
import {
  ProfileHero,
  ProfileContentTabs,
  ProfileAccountSection,
  ProfileSecuritySection,
  ProfileArtistSection,
  ProfileRepresentativeSection,
  ProfileBridgeNumberSection,
  ProfileActionsSection,
  LogoutBottomSheet,
} from '@/features/profile';
import { ProfileSubscriptionSection } from '@/features/profile/components/ProfileSubscriptionSection';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hasEntitlement = useSubscriptionStore((s) => s.hasEntitlement);

  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);

  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchSubscription();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchSubscription]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/(auth)/login');
    } finally {
      setIsLoggingOut(false);
      setLogoutVisible(false);
    }
  };

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setSwitcherVisible(true)}
          activeOpacity={0.7}
          style={styles.headerButton}
        >
          <Text variant="h2">@{user.username}</Text>
          <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FFF"
          />
        }
      >
        {/* Hero — padded section */}
        <View style={styles.heroSection}>
          <ProfileHero user={user} onEditProfile={() => router.push('/edit-profile')} />
        </View>

        {/* Content tabs — posts / saved / settings */}
        <ProfileContentTabs
          userId={user.id}
          settingsContent={
            <>
              <ProfileAccountSection user={user} />
              <ProfileSecuritySection user={user} />
              {user.role === 'artist' && <ProfileArtistSection user={user} />}
              {user.role === 'representative' && (
                <ProfileRepresentativeSection user={user} />
              )}
              {hasEntitlement('bridge_number') && <ProfileBridgeNumberSection />}
              <ProfileSubscriptionSection />
              <ProfileActionsSection onLogout={() => setLogoutVisible(true)} />
            </>
          }
        />
      </ScrollView>

      <AccountSwitcherBottomSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
      />

      <LogoutBottomSheet
        visible={logoutVisible}
        onClose={() => setLogoutVisible(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
      />

      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#222222',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
});

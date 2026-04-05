import { useState, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Toast } from '@/components/ui/Toast';
import { AccountSwitcherBottomSheet } from '@/components/ui/AccountSwitcherBottomSheet';
import { useAuthStore } from '@/stores/authStore';
import { useUserProfile } from '@/features/profile/hooks/useUserProfile';
import { QUERY_KEYS } from '@/constants/queryKeys';
import {
  ProfileHero,
  ProfileAccountSection,
  ProfileSecuritySection,
  ProfileCreatorSection,
  ProfileRepresentativeSection,
  ProfileBridgeNumberSection,
  ProfileActionsSection,
  LogoutBottomSheet,
} from '@/features/profile';
import {
  ProfileContentTabs,
  type ProfileContentTabsHandle,
} from '@/features/profile/components/ProfileContentTabs';
import { ProfileSubscriptionSection } from '@/features/profile/components/ProfileSubscriptionSection';
import { ProfileSettingsSection } from '@/features/profile/components/ProfileSettingsSection';
import { DeleteAccountBottomSheet } from '@/features/profile/components/DeleteAccountBottomSheet';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

export default function ProfileScreen() {
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  // Fetch real counts from social-service
  const { user: enrichedUser, refetch: refetchProfile } = useUserProfile(String(authUser?.id ?? 0));
  const user = enrichedUser ?? authUser;
  const hasEntitlement = useSubscriptionStore((s) => s.hasEntitlement);

  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  const queryClient = useQueryClient();
  const contentTabsRef = useRef<ProfileContentTabsHandle>(null);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
        contentTabsRef.current?.handleScrollNearEnd();
      }
    },
    [],
  );

  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    console.log('[Profile] handleRefresh triggered');
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchSubscription(),
        refetchProfile(),
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.FEED.USER_POSTS(Number(authUser?.id ?? 0)),
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchSubscription, refetchProfile, queryClient, authUser?.id]);

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
          <ChevronDown size={18} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={400}
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
          ref={contentTabsRef}
          userId={user.id}
          settingsContent={
            <>
              <ProfileAccountSection user={user} />
              <ProfileSecuritySection user={user} />
              {user.role === 'creator' && <ProfileCreatorSection user={user} />}
              {user.role === 'representative' && (
                <ProfileRepresentativeSection user={user} />
              )}
              {hasEntitlement('bridge_number') && <ProfileBridgeNumberSection />}
              <ProfileSubscriptionSection />
              <ProfileSettingsSection />
              <ProfileActionsSection
                onLogout={() => setLogoutVisible(true)}
                onDeleteAccount={() => setDeleteAccountVisible(true)}
              />
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

      <DeleteAccountBottomSheet
        visible={deleteAccountVisible}
        onClose={() => setDeleteAccountVisible(false)}
        user={user}
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

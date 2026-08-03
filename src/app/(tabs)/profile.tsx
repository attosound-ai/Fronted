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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';
import { CollapsibleHeader } from '@/components/ui/CollapsibleHeader';
import { useCollapsibleHeader } from '@/hooks/useCollapsibleHeader';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { ProfileSupportSection } from '@/features/profile/components/ProfileSupportSection';
import { DeleteAccountBottomSheet } from '@/features/profile/components/DeleteAccountBottomSheet';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { ResponsiveContentWrapper } from '@/components/layout/ResponsiveContentWrapper';
import { FLOATING_NAVBAR_CLEARANCE } from '@/components/navigation/navbarMetrics';
import { COLORS } from '@/constants/theme';

export default function ProfileScreen() {
  const { t } = useTranslation('profile');
  const insets = useSafeAreaInsets();
  const header = useCollapsibleHeader();
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  // Fetch real counts from social-service
  const { user: enrichedUser, refetch: refetchProfile } = useUserProfile(
    String(authUser?.id ?? 0)
  );
  const user = enrichedUser ?? authUser;
  const hasEntitlement = useSubscriptionStore((s) => s.hasEntitlement);

  const fetchSubscription = useSubscriptionStore((s) => s.fetchSubscription);
  const queryClient = useQueryClient();

  // Self-heal a stuck subscription: if the plan is unresolved ("—") or the last
  // fetch failed (transient network/5xx), refetch whenever Profile gains focus so
  // merely opening this tab recovers it — no manual pull-to-refresh or cold restart
  // needed. fetchSubscription dedups + self-retries, so this never spams the API.
  useFocusEffect(
    useCallback(() => {
      const s = useSubscriptionStore.getState();
      if (s.getResolvedPlan() === null || s.lastFetchFailed) {
        void s.fetchSubscription();
      }
    }, [])
  );
  const contentTabsRef = useRef<ProfileContentTabsHandle>(null);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
      contentTabsRef.current?.handleScrollNearEnd();
    }
  }, []);

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
    <View style={styles.container}>
      <ResponsiveContentWrapper>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            { paddingTop: header.height },
            { paddingBottom: insets.bottom + FLOATING_NAVBAR_CLEARANCE },
          ]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            handleScroll(e);
            header.onScroll(e);
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#FFF"
              progressViewOffset={header.height}
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
                <ProfileSupportSection />
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
      </ResponsiveContentWrapper>

      <CollapsibleHeader animatedStyle={header.animatedStyle}>
        <TouchableOpacity
          onPress={() => setSwitcherVisible(true)}
          activeOpacity={0.7}
          style={styles.switcherPill}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={styles.headerUsername}
          >
            @{user.username}
          </Text>
          <ChevronDown size={16} color="#FFFFFF" strokeWidth={2.25} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.7}
          style={styles.editPill}
        >
          <Text style={styles.editPillText}>{t('hero.editProfile')}</Text>
        </TouchableOpacity>
      </CollapsibleHeader>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  switcherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    flexShrink: 1,
  },
  headerUsername: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 16,
    flexShrink: 1,
  },
  editPill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  editPillText: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
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

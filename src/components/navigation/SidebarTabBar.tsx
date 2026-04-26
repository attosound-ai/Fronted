import { useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, DeviceEventEmitter } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Ellipsis } from 'lucide-react-native';
import { router } from 'expo-router';
import { SidebarTabItem } from './SidebarTabItem';
import { AccountSwitcherBottomSheet } from '@/components/ui/AccountSwitcherBottomSheet';
import { useProfileTabGestures } from '@/hooks/useProfileTabGestures';
import { useNotificationStore } from '@/stores/notificationStore';

const SIDEBAR_WIDTH = 72;

export function SidebarTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const notifUnread = useNotificationStore((s) => s.unreadCount);

  const profileRouteIndex = state.routes.findIndex((r) => r.name === 'profile');
  const profileRoute = profileRouteIndex >= 0 ? state.routes[profileRouteIndex] : null;
  const profileFocused = profileRouteIndex >= 0 && state.index === profileRouteIndex;

  const navigateToProfile = useCallback(() => {
    if (!profileRoute) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: profileRoute.key,
      canPreventDefault: true,
    });
    if (!profileFocused && !event.defaultPrevented) {
      navigation.navigate(profileRoute.name, profileRoute.params);
    }
  }, [navigation, profileRoute, profileFocused]);

  const {
    handlePress: handleProfilePress,
    handleLongPress: handleProfileLongPress,
    switcherVisible,
    closeSwitcher,
  } = useProfileTabGestures(navigateToProfile);

  const renderItem = (routeIndex: number) => {
    const route = state.routes[routeIndex];
    const { options } = descriptors[route.key];
    const focused = state.index === routeIndex;
    const color = focused ? '#FFFFFF' : '#888888';

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    const icon = options.tabBarIcon?.({ color, focused, size: 26 });
    const badge = options.tabBarBadge;

    if (route.name === 'profile') {
      const profileIcon = options.tabBarIcon?.({ color, focused, size: 32 });
      return (
        <SidebarTabItem
          key={route.key}
          icon={profileIcon}
          focused={focused}
          onPress={handleProfilePress}
          onLongPress={handleProfileLongPress}
          large
        />
      );
    }

    return (
      <SidebarTabItem
        key={route.key}
        icon={icon}
        focused={focused}
        badge={badge}
        onPress={onPress}
      />
    );
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
      {/* Top: create post */}
      <TouchableOpacity
        style={styles.actionButtonLg}
        onPress={() => router.push('/create-post')}
      >
        <Plus size={32} color="#FFF" strokeWidth={2.75} />
      </TouchableOpacity>

      {/* Center: 4 tabs + menu centered */}
      <View style={styles.centerItems}>
        {state.routes.map((route, idx) => {
          if (route.name === 'profile') return null;
          return renderItem(idx);
        })}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            const homeRoute = state.routes.find((r) => r.name === 'index');
            if (homeRoute && state.index !== state.routes.indexOf(homeRoute)) {
              navigation.navigate('index');
            }
            DeviceEventEmitter.emit('sidebarMenuPress');
          }}
        >
          <Ellipsis size={24} color="#888" strokeWidth={2.25} />
          {notifUnread > 0 && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </View>

      {/* Bottom: profile */}
      {renderItem(state.routes.findIndex((r) => r.name === 'profile'))}

      <AccountSwitcherBottomSheet visible={switcherVisible} onClose={closeSwitcher} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#000000',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#222222',
    zIndex: 10,
    alignItems: 'center',
  },
  centerItems: {
    flex: 1,
    justifyContent: 'center',
    gap: 28,
    alignItems: 'center',
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  actionButtonLg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

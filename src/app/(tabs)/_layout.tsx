import { useEffect, useState } from 'react';
import { DeviceEventEmitter, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { House, CirclePlay, MessageCircle, Search } from 'lucide-react-native';
import { haptic } from '@/lib/haptics/hapticService';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { MessageNotificationBanner } from '@/components/ui/MessageNotificationBanner';
import { PostPublishedBanner } from '@/components/ui/PostPublishedBanner';
import { ProfileTabIcon } from '@/components/ui/ProfileTabIcon';
import { ProfileTabButton } from '@/components/ui/ProfileTabButton';
import { TabBarRouter } from '@/components/navigation/TabBarRouter';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/features/messages/stores/chatStore';
import { useUserChannel } from '@/features/messages/hooks/useUserChannel';
import { useUnreadCount } from '@/features/notifications/hooks/useUnreadCount';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { messageService } from '@/features/messages/services/messageService';

export default function TabsLayout() {
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const totalUnread = useChatStore((s) => s.totalUnread);

  const connectSocket = useChatStore((s) => s.connectSocket);
  const disconnectSocket = useChatStore((s) => s.disconnectSocket);

  // Sync notification badge + register push token
  useUnreadCount();
  usePushNotifications();

  // Fetch unread message count on app start (before user opens messages tab)
  useEffect(() => {
    if (!isAuthenticated) return;
    messageService
      .getConversations()
      .then((conversations) => {
        const unread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
        useChatStore.getState().setTotalUnread(unread);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/welcome');
    }
  }, [isLoading, isAuthenticated]);

  // Connect WebSocket when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    }
    return () => disconnectSocket();
  }, [isAuthenticated, connectSocket, disconnectSocket]);

  // Join user-level channel for real-time conversation list updates
  useUserChannel();

  // NOTE: every hook must be called before any early return — React
  // enforces a stable hook order across renders. `useDeviceLayout` used
  // to live below the logout short-circuit, which caused a "Rendered
  // fewer hooks than expected" crash on sign-out.
  const { isTablet, sidebarWidth } = useDeviceLayout();

  // Don't render tabs (which trigger feed/Twilio requests) until auth is confirmed
  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <>
      <Tabs
        tabBar={(props) => <TabBarRouter {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          sceneStyle: isTablet ? { paddingLeft: sidebarWidth } : undefined,
        }}
      >
        <Tabs.Screen
          name="index"
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              if (navigation.isFocused()) {
                e.preventDefault();
                haptic('light');
                DeviceEventEmitter.emit('feedScrollToTop');
              }
            },
          })}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <House size={26} color={color} strokeWidth={focused ? 2.75 : 1.75} />
            ),
          }}
        />
        <Tabs.Screen
          name="listen"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <CirclePlay size={26} color={color} strokeWidth={focused ? 2.75 : 1.75} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <MessageCircle size={26} color={color} strokeWidth={focused ? 2.75 : 1.75} />
            ),
            tabBarBadge:
              totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
            tabBarBadgeStyle: styles.badge,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Search size={26} color={color} strokeWidth={focused ? 2.75 : 1.75} />
            ),
          }}
        />
        <Tabs.Screen
          name="recording"
          options={{
            href: null, // hidden from tab bar
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <ProfileTabIcon color={color} focused={focused} />
            ),
            tabBarButton: (props) => <ProfileTabButton {...props} />,
          }}
        />
      </Tabs>

      <ComingSoonModal
        visible={comingSoonVisible}
        onClose={() => setComingSoonVisible(false)}
      />

      <MessageNotificationBanner />
      <PostPublishedBanner />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#000000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#222222',
  },
  badge: {
    backgroundColor: '#EF4444',
    fontSize: 10,
  },
});

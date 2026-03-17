import { useEffect, useState } from 'react';
import { DeviceEventEmitter, StyleSheet } from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '@/lib/haptics/hapticService';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { MessageNotificationBanner } from '@/components/ui/MessageNotificationBanner';
import { ProfileTabIcon } from '@/components/ui/ProfileTabIcon';
import { ProfileTabButton } from '@/components/ui/ProfileTabButton';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/features/messages/stores/chatStore';
import { useUserChannel } from '@/features/messages/hooks/useUserChannel';

export default function TabsLayout() {
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const totalUnread = useChatStore((s) => s.totalUnread);

  const connectSocket = useChatStore((s) => s.connectSocket);
  const disconnectSocket = useChatStore((s) => s.disconnectSocket);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/login');
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

  // Don't render tabs (which trigger feed/Twilio requests) until auth is confirmed
  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          lazy: true,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#888888',
          tabBarShowLabel: false,
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
              <Ionicons
                name={focused ? 'home' : 'home-outline'}
                color={color}
                size={24}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="listen"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'play-circle' : 'play-circle-outline'}
                color={color}
                size={24}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'chatbubble' : 'chatbubble-outline'}
                color={color}
                size={24}
              />
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
              <Ionicons
                name={focused ? 'search' : 'search-outline'}
                color={color}
                size={24}
              />
            ),
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

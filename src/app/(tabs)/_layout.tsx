import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { MessageNotificationBanner } from '@/components/ui/MessageNotificationBanner';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/features/messages/stores/chatStore';
import { useUserChannel } from '@/features/messages/hooks/useUserChannel';

/**
 * TabsLayout — Bottom navigation matching Figma design.
 * Order: Home, Listen, Messages, Search, Profile — no labels.
 * Redirects to login when not authenticated.
 */
export default function TabsLayout() {
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const totalUnread = useChatStore((s) => s.totalUnread);

  const connectSocket = useChatStore((s) => s.connectSocket);
  const disconnectSocket = useChatStore((s) => s.disconnectSocket);

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

  // Don't render tabs (which trigger feed/Twilio requests) until auth is confirmed
  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#888888',
          tabBarStyle: {
            backgroundColor: '#000000',
            borderTopColor: '#222222',
          },
        }}
      >
        <Tabs.Screen
          name="index"
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
            tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 10 },
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            tabBarIcon: ({ color }) => (
              <Ionicons name="search-outline" color={color} size={24} />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setComingSoonVisible(true);
            },
          }}
        />
        <Tabs.Screen name="projects" options={{ href: null }} />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'person' : 'person-outline'}
                color={color}
                size={24}
              />
            ),
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

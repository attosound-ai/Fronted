import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ComingSoonModal } from '@/components/ui/ComingSoonModal';
import { useAuthStore } from '@/stores/authStore';

/**
 * TabsLayout — Bottom navigation matching Figma design.
 * Order: Home, Listen, Messages, Search, Profile — no labels.
 * Redirects to login when not authenticated.
 */
export default function TabsLayout() {
  const [comingSoonVisible, setComingSoonVisible] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isLoading, isAuthenticated]);

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
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setComingSoonVisible(true);
            },
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
        <Tabs.Screen
          name="projects"
          options={{ href: null }}
        />
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
    </>
  );
}

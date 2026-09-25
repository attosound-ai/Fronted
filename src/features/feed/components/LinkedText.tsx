import { useCallback } from 'react';
import { Linking, StyleSheet, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;
/** Split on the whole mention so the "@" stays with the name. */
const MENTION_SPLIT = /(@[A-Za-z0-9._]{1,30})/g;

interface LinkedTextProps {
  children: string;
  style?: TextStyle;
  numberOfLines?: number;
  onPress?: () => void;
  maxFontSizeMultiplier?: number;
  /**
   * username (lowercased) to user id, from the post's own metadata. A name
   * picked from the composer's list resolves with no request; one typed by
   * hand is looked up when tapped.
   */
  mentions?: Record<string, string>;
}

/**
 * LinkedText renders a caption with its links and the people it tags.
 *
 * URLs open the browser. A tagged name opens that profile, the way Instagram
 * does it, which is what makes tagging worth anything to the person tagged.
 */
export function LinkedText({
  children,
  style,
  numberOfLines,
  onPress,
  maxFontSizeMultiplier,
  mentions,
}: LinkedTextProps) {
  const handleLinkPress = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  const openMention = useCallback(
    async (handle: string) => {
      const username = handle.slice(1);
      void haptic('selection');
      let id = mentions?.[username.toLowerCase()];
      if (!id) {
        // Typed by hand rather than picked: find them by name, once, on tap.
        try {
          const res = await apiClient.get(API_ENDPOINTS.USERS.SEARCH, {
            params: { q: username },
          });
          const list = (res.data?.data ?? []) as {
            id: string | number;
            username: string;
          }[];
          const exact = list.find(
            (u) => u.username?.toLowerCase() === username.toLowerCase()
          );
          if (exact) id = String(exact.id);
        } catch {
          // No profile to open; the name simply stays text.
        }
      }
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_MENTION_OPENED, {
        username,
        resolved: !!id,
        from_metadata: !!mentions?.[username.toLowerCase()],
      });
      if (id) router.push({ pathname: '/user/[id]', params: { id, username } });
    },
    [mentions]
  );

  // Links first, then the people named inside each plain run.
  URL_REGEX.lastIndex = 0;
  const parts = children.split(URL_REGEX);

  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      onPress={onPress}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
    >
      {parts.map((part, i) => {
        URL_REGEX.lastIndex = 0;
        if (URL_REGEX.test(part)) {
          return (
            <Text
              key={i}
              style={[style, styles.link]}
              onPress={() => handleLinkPress(part)}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {part}
            </Text>
          );
        }
        return part.split(MENTION_SPLIT).map((run, j) =>
          run.startsWith('@') && run.length > 1 ? (
            <Text
              key={`${i}-${j}`}
              style={[style, styles.mention]}
              onPress={() => void openMention(run)}
              maxFontSizeMultiplier={maxFontSizeMultiplier}
            >
              {run}
            </Text>
          ) : (
            run
          )
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: '#3B82F6',
  },
  // A tagged name reads as one of ours, not as a web link.
  mention: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
});

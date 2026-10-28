import { useCallback, useMemo } from 'react';
import { Alert, Linking, StyleSheet, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { showToast } from '@/components/ui/Toast';
import { GOLD } from '@/constants/gold';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';
import { fetchMentionPerson, useMentionPeople } from '../hooks/useMentionPeople';
import { mentionedUsernames } from '../utils/mentions';

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
   * picked from the composer's list opens with no wait; every name is also
   * looked up once (useMentionPeople) for its colour and to know it exists.
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
  const { t } = useTranslation('feed');
  const queryClient = useQueryClient();
  const names = useMemo(() => mentionedUsernames(children), [children]);
  const people = useMentionPeople(names);

  const handleLinkPress = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  const openMention = useCallback(
    async (handle: string) => {
      const username = handle.slice(1);
      const key = username.toLowerCase();
      void haptic('selection');
      let id = mentions?.[key] ?? people[key]?.id;
      let missing = people[key] === null;
      if (!id && !missing) {
        // The caption's own lookup has not answered yet: ask the same cache.
        try {
          const person = await fetchMentionPerson(queryClient, username);
          id = person?.id;
          missing = person === null;
        } catch {
          // Offline: say nothing rather than claim the account does not exist.
        }
      }
      analytics.capture(ANALYTICS_EVENTS.FEED.POST_MENTION_OPENED, {
        username,
        resolved: !!id,
        missing,
        from_metadata: !!mentions?.[key],
      });
      if (id) {
        router.push({ pathname: '/user/[id]', params: { id, username } });
      } else if (missing) {
        // A typo must say so, not look like a broken link (Oct 27 2026).
        const message = t('mention.notFound', { username });
        if (!showToast(message, 'warning')) Alert.alert(message);
      }
    },
    [mentions, people, queryClient, t]
  );

  const mentionStyle = (run: string) => {
    const person = people[run.slice(1).toLowerCase()];
    if (person === null) return null;
    return person?.role === 'creator' ? styles.mentionCreator : styles.mention;
  };

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
              style={[style, mentionStyle(run)]}
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
  // A tagged name reads as one of ours, not as a web link: bold and cream, and
  // gold for a creator, like the rest of the app (David, Oct 27 2026). A name
  // that matches no account keeps the caption's own style.
  mention: {
    color: '#F2E6C9',
    fontFamily: 'Archivo_600SemiBold',
  },
  mentionCreator: {
    color: GOLD.bright,
    fontFamily: 'Archivo_600SemiBold',
  },
});

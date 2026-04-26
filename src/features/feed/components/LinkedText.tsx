import { useCallback } from 'react';
import { Linking, StyleSheet, type TextStyle } from 'react-native';
import { Text } from '@/components/ui/Text';

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

interface LinkedTextProps {
  children: string;
  style?: TextStyle;
  numberOfLines?: number;
  onPress?: () => void;
  maxFontSizeMultiplier?: number;
}

/**
 * LinkedText — renders text with clickable URLs.
 *
 * Detects http/https links and makes them tappable (opens browser).
 * Drop-in replacement for plain text strings inside <Text> components.
 */
export function LinkedText({
  children,
  style,
  numberOfLines,
  onPress,
  maxFontSizeMultiplier,
}: LinkedTextProps) {
  const handleLinkPress = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  // Reset lastIndex since regex is global
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
        return URL_REGEX.test(part) ? (
          <Text
            key={i}
            style={[style, styles.link]}
            onPress={() => handleLinkPress(part)}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            {part}
          </Text>
        ) : (
          part
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: {
    color: '#3B82F6',
  },
});

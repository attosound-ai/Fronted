import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

interface TypingIndicatorProps {
  name?: string;
}

const DOT_SIZE = 6;
const DOT_COUNT = 3;

export function TypingIndicator({ name }: TypingIndicatorProps) {
  const { t } = useTranslation('messages');
  const dots = useRef(
    Array.from({ length: DOT_COUNT }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      )
    );

    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: dot.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
                transform: [
                  {
                    translateY: dot.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -4],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
      {name && (
        <Text variant="small" style={styles.label}>
          {t('typing.full', { name })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.background.secondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: COLORS.gray[400],
  },
  label: {
    color: COLORS.gray[500],
  },
});

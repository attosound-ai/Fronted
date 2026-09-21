import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { STUDIO_COLORS } from './studioTheme';

interface Props {
  /** Linear level 0..1 for each channel, updated on the UI thread. */
  leftSv: SharedValue<number>;
  rightSv: SharedValue<number>;
  width?: number;
}

/**
 * The tiny L and R output meters beside Play, driven by shared values so
 * the bars move without a single JS render. White that turns red above
 * 0.9 like a clip indicator.
 */
export function LevelMeter({ leftSv, rightSv, width = 44 }: Props) {
  const left = useAnimatedStyle(() => ({
    width: Math.max(0, Math.min(1, leftSv.value)) * width,
    backgroundColor:
      leftSv.value > 0.9 ? STUDIO_COLORS.meterHigh : STUDIO_COLORS.meterLow,
  }));
  const right = useAnimatedStyle(() => ({
    width: Math.max(0, Math.min(1, rightSv.value)) * width,
    backgroundColor:
      rightSv.value > 0.9 ? STUDIO_COLORS.meterHigh : STUDIO_COLORS.meterLow,
  }));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text variant="small" style={styles.label} maxFontSizeMultiplier={1.0}>
          L
        </Text>
        <View style={[styles.track, { width }]}>
          <Animated.View style={[styles.fill, left]} />
        </View>
      </View>
      <View style={styles.row}>
        <Text variant="small" style={styles.label} maxFontSizeMultiplier={1.0}>
          R
        </Text>
        <View style={[styles.track, { width }]}>
          <Animated.View style={[styles.fill, right]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 12,
  },
  label: {
    color: STUDIO_COLORS.textMuted,
    fontSize: 9,
    width: 10,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: STUDIO_COLORS.borderStrong,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
});

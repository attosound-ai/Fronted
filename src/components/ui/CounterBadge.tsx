import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Text } from './Text';

interface CounterBadgeProps {
  count: number | string;
  max?: number;
  color?: string;
  textColor?: string;
  fontWeight?: 'semibold' | 'bold';
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const FONT_BY_WEIGHT = {
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
} as const;

export function CounterBadge({
  count,
  max = 99,
  color = '#EF4444',
  textColor = '#FFFFFF',
  fontWeight = 'bold',
  size = 20,
  style,
}: CounterBadgeProps) {
  const label =
    typeof count === 'number' && count > max ? `${max}+` : String(count);

  const fontSize = size <= 18 ? 10 : 11;
  const lineHeight = Math.round(fontSize * 1.4);

  return (
    <View
      style={[
        styles.container,
        {
          minWidth: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize, lineHeight, color: textColor, fontFamily: FONT_BY_WEIGHT[fontWeight] },
        ]}
        maxFontSizeMultiplier={1.0}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});

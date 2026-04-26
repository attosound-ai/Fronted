import { Text as RNText, StyleSheet, TextProps as RNTextProps } from 'react-native';
import { VARIANT_MAX_SCALE } from '@/lib/textScaling';

type TextVariant = 'logo' | 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'small';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  children: React.ReactNode;
}

const FONTS = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
} as const;

export function Text({
  variant = 'body',
  style,
  children,
  maxFontSizeMultiplier,
  ...props
}: TextProps) {
  return (
    <RNText
      style={[styles.base, styles[variant], style]}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? VARIANT_MAX_SCALE[variant]}
      {...props}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    color: '#FFFFFF',
    fontFamily: FONTS.regular,
  },
  logo: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    letterSpacing: -0.5,
  },
  h1: {
    fontSize: 24,
    fontFamily: FONTS.bold,
    lineHeight: 32,
  },
  h2: {
    fontSize: 18,
    fontFamily: FONTS.semibold,
    lineHeight: 24,
  },
  h3: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    lineHeight: 16,
    color: '#888888',
  },
  small: {
    fontSize: 11,
    fontFamily: FONTS.regular,
    lineHeight: 16,
    color: '#888888',
  },
});

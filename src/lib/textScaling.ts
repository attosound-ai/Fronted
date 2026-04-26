import { Text, TextInput } from 'react-native';

// Global cap for raw <Text> usage. Variant-aware caps live in components/ui/Text.
// Keep this conservative — layouts across the app assume text stays within one
// step of its designed size. Accessibility users still get a bump but tight
// chrome (tabs, pills, composer) does not overflow.
export const MAX_FONT_SCALE = 1.15;

// Per-variant caps used by the wrapped Text component. Titles are already
// large, so they scale less; body copy scales most (readability wins there).
export const VARIANT_MAX_SCALE = {
  logo: 1.0,
  h1: 1.08,
  h2: 1.1,
  h3: 1.12,
  body: 1.2,
  caption: 1.2,
  small: 1.2,
} as const;

type WithDefaults = { defaultProps?: { maxFontSizeMultiplier?: number } };

(Text as unknown as WithDefaults).defaultProps = {
  ...((Text as unknown as WithDefaults).defaultProps ?? {}),
  maxFontSizeMultiplier: MAX_FONT_SCALE,
};

(TextInput as unknown as WithDefaults).defaultProps = {
  ...((TextInput as unknown as WithDefaults).defaultProps ?? {}),
  maxFontSizeMultiplier: MAX_FONT_SCALE,
};

/**
 * Metallic gold palette for creator-tier visuals (badges, rings, borders).
 *
 * Real gold reads as a desaturated, olive-leaning warm — not bright yellow.
 * These stops simulate an anisotropic reflection (light → dark → light → dark),
 * which is what separates a metallic surface from a flat yellow fill.
 */

export const GOLD = {
  // Specular / polished highlight
  highlight: '#FCF6BA',
  highlightSoft: '#F7EF8A',

  // Core "true" gold body
  bright: '#E6C65A',
  base: '#D4AF37',
  rich: '#BF953F',
  deep: '#AA8A39',

  // Shadow / depth (olive-brown, not yellow)
  shadow: '#8B6914',
  shadowDeep: '#6B4E0A',
  void: '#3D2B0C',
} as const;

/**
 * 8-stop metallic gradient for fills (vertical by default).
 * Creates two reflection bands which is what sells the metal look.
 */
export const GOLD_FILL_STOPS: Array<{ offset: string; color: string; opacity?: number }> = [
  { offset: '0%', color: GOLD.highlight },
  { offset: '15%', color: GOLD.highlightSoft },
  { offset: '30%', color: GOLD.bright },
  { offset: '48%', color: GOLD.deep },
  { offset: '58%', color: GOLD.rich },
  { offset: '72%', color: GOLD.base },
  { offset: '88%', color: GOLD.shadow },
  { offset: '100%', color: GOLD.void },
];

/**
 * Gradient stops for a metallic bevel/border (chased-edge look).
 * Light → dark → light → dark at 45°.
 */
export const GOLD_BEVEL_STOPS: Array<{ offset: string; color: string }> = [
  { offset: '0%', color: GOLD.highlight },
  { offset: '28%', color: GOLD.base },
  { offset: '50%', color: GOLD.shadowDeep },
  { offset: '72%', color: GOLD.bright },
  { offset: '100%', color: GOLD.shadow },
];

/**
 * Single color fallback for places where only a flat color is possible
 * (React Native StyleSheet borderColor, etc). Use the core "true gold" tone.
 */
export const GOLD_FLAT = GOLD.base;

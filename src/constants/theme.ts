/**
 * Theme Configuration
 *
 * Sistema de diseño centralizado
 */

export const COLORS = {
  // Primarios
  primary: '#3B82F6',
  secondary: '#8B5CF6',

  // Neutrales
  white: '#FFFFFF',
  black: '#000000',

  // Grises
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Estados
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Backgrounds (dark mode)
  background: {
    primary: '#000000',
    secondary: '#111111',
    tertiary: '#1A1A1A',
  },

  // Borders
  border: {
    light: '#333333',
    dark: '#222222',
  },
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
} as const;

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

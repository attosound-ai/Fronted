/**
 * Theme Configuration
 *
 * Sistema de diseño centralizado
 */

/**
 * 🎨 FONDOS DE LA APP — ÚNICO LUGAR PARA CAMBIARLOS
 * ---------------------------------------------------------
 * `APP_BACKGROUND`: fondo de TODAS las pantallas (y del splash nativo, que lo
 * lee desde aquí en `app.config.js`). Negro puro.
 *
 * `WELCOME_BACKGROUND`: la ÚNICA excepción — solo la pantalla de Welcome lo
 * usa (negro mate con tinte magenta, idéntico al hero de la web). Cambia cada
 * fondo por separado editando su constante.
 *
 * Ejemplos: '#000000' (negro puro) · '#100e10' (negro mate con tinte magenta)
 * · '#0A0A0A' (negro carbón).
 */
export const APP_BACKGROUND = '#000000';
export const WELCOME_BACKGROUND = '#100e10';

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
    primary: APP_BACKGROUND, // fondo base de TODAS las pantallas (negro puro)
    welcome: WELCOME_BACKGROUND, // EXCEPCIÓN: solo la pantalla de Welcome (negro mate)
    secondary: '#111111', // superficies elevadas (inputs, cards)
    tertiary: '#1A1A1A', // superficies aún más elevadas
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

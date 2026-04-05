/**
 * App Configuration
 *
 * Configuración centralizada de la aplicación
 */

export const API_CONFIG = {
  BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  TIMEOUT: 15000, // 15 seconds (gateway adds latency)
} as const;

export const APP_CONFIG = {
  NAME: 'ATTO SOUND',
  VERSION: '1.0.0',

  // Paginación
  PAGE_SIZE: 20,

  // Cache
  CACHE_TIME: 1000 * 60 * 5, // 5 minutos
  STALE_TIME: 1000 * 60 * 1, // 1 minuto
} as const;

export const STORAGE_KEYS = {
  THEME: 'app_theme',
  LANGUAGE: 'app_language',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  LAST_SYNC: 'last_sync_timestamp',
} as const;

/**
 * App Configuration
 *
 * Configuración centralizada de la aplicación
 */

import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

const LOCAL_GATEWAY_PORT = '8080';

function resolveLanHost(): string | null {
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } })
    .SourceCode?.scriptURL;
  if (scriptURL) {
    const match = scriptURL.match(/^https?:\/\/([^/:]+)/i);
    if (match?.[1]) return match[1];
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as unknown as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } })
      .manifest2?.extra?.expoGo?.debuggerHost;

  if (!hostUri) return null;
  const host = hostUri.split(':')[0];
  return host || null;
}

function resolveBaseUrl(): string {
  const fallback = `http://localhost:${LOCAL_GATEWAY_PORT}/api/v1`;
  const raw = (process.env.EXPO_PUBLIC_API_URL || fallback).trim();

  try {
    const url = new URL(raw);
    const isLoopback =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '0.0.0.0';

    if (!isLoopback) return raw;

    const lanHost = resolveLanHost();
    const configuredHost = process.env.EXPO_PUBLIC_API_LAN_HOST?.trim();
    const host = lanHost || configuredHost;
    if (!host) return raw;

    const port = url.port === '8000' || url.port === '' ? LOCAL_GATEWAY_PORT : url.port;
    return `${url.protocol}//${host}:${port}${url.pathname}`;
  } catch {
    return raw;
  }
}

export const API_CONFIG = {
  BASE_URL: resolveBaseUrl(),
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

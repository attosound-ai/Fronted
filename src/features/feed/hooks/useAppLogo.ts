import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { mmkvStorage } from '@/lib/storage/mmkv';
import { parseSplashCache, type SplashLogo } from '../utils/splashLogo';
import {
  parseFeedMenu,
  parseSplashScale,
  readCachedAppSettings,
  writeCachedAppSettings,
  type AppSettings,
} from '../utils/appSettings';
import { create } from 'zustand';

/**
 * Live copy of the admin settings for screens (the feed header menu). Seeded
 * from the MMKV cache so the first frame already has the last known menu,
 * then replaced by every app-logo response.
 */
export const useAppSettingsStore = create<AppSettings>(() => readCachedAppSettings());

function keepAppSettings(payload: AppLogoPayload | null | undefined): void {
  const next: AppSettings = {
    feedMenu: parseFeedMenu(payload?.feedMenu),
    splashScale: parseSplashScale(payload?.splashScale),
  };
  writeCachedAppSettings(next);
  useAppSettingsStore.setState(next);
}

/**
 * This build's number. Sent to the backend so it can target logos by version.
 * Only builds that send it (i.e. this code, which ALSO hides the app-drawn
 * "sound" for a custom logo) ever receive a logo — older gate-less builds omit
 * it and get their bundled default, so they can never double-draw the wordmark.
 */
const APP_BUILD = Number(Application.nativeBuildVersion ?? '') || undefined;

/**
 * Last resolved logo URL, persisted so a cold start paints the DB logo on the
 * FIRST frame instead of flashing the bundled default and then swapping (which
 * looked like the header logo resizing a second after launch). Keyed by build
 * so a version-targeted URL is never reused by a different build.
 */
const LOGO_CACHE_KEY = `app_logo_url_v1_${APP_BUILD ?? 'na'}`;

function readCachedLogo(): string | undefined {
  try {
    return mmkvStorage.getString(LOGO_CACHE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Synchronous read of the last resolved logo, for surfaces that must paint
 * before React Query runs (the launch splash). Null when nothing is cached.
 */
export function getCachedAppLogoUri(): string | null {
  return readCachedLogo() ?? null;
}

function writeCachedLogo(url: string | null): void {
  try {
    if (url) mmkvStorage.setString(LOGO_CACHE_KEY, url);
    else mmkvStorage.delete(LOGO_CACHE_KEY);
  } catch {
    // best effort: a storage miss only costs us the first frame optimisation
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string | null;
}

interface AppLogoPayload {
  imageUrl: string;
  /** Launch splash image set in the admin; absent means follow `imageUrl`. */
  splashImageUrl?: string | null;
  /** Admin feed menu, order and names; absent means the app's default. */
  feedMenu?: unknown;
  /** Splash mark width as a fraction of the screen; absent means 0.3. */
  splashScale?: unknown;
  updatedAt: string;
}

// ── Launch splash logo ────────────────────────────────────────────────
// The admin can give the splash its own image (the round mark from the
// website) while the header keeps the wide wordmark. The splash paints before
// React Query runs, so the URL is cached together with the image's aspect
// ratio: the splash sizes its box from it and any shape lands correctly.

/** Canvas ratio of the main wordmark file, used when the splash follows it. */
const MAIN_LOGO_ASPECT = 1024 / 360;
const SPLASH_CACHE_KEY = `app_splash_logo_v1_${APP_BUILD ?? 'na'}`;

/**
 * What the launch splash should draw, read synchronously: the splash image
 * when the admin set one, else the main logo, else null (bundled fallback).
 */
export function getCachedSplashLogo(): SplashLogo | null {
  let own: SplashLogo | null = null;
  try {
    own = parseSplashCache(mmkvStorage.getString(SPLASH_CACHE_KEY));
  } catch {
    own = null;
  }
  if (own) return own;
  const main = readCachedLogo();
  return main ? { uri: main, aspect: MAIN_LOGO_ASPECT } : null;
}

function measure(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (w, h) => resolve(w > 0 && h > 0 ? w / h : null),
      () => resolve(null)
    );
  });
}

/**
 * Remember (or forget) the splash image for the next launch. The file is
 * DOWNLOADED to the phone: the splash lives about a second, and a remote image
 * that has to come over the network lands after it is already gone (the first
 * test showed a black splash). A local file paints at once.
 */
async function syncSplashLogo(url: string | null): Promise<void> {
  try {
    const cached = parseSplashCache(mmkvStorage.getString(SPLASH_CACHE_KEY));
    if (!url) {
      if (cached?.uri.startsWith('file://')) {
        await FileSystem.deleteAsync(cached.uri, { idempotent: true }).catch(() => {});
      }
      mmkvStorage.delete(SPLASH_CACHE_KEY);
      return;
    }
    if (
      cached &&
      (cached.remote ?? cached.uri) === url &&
      cached.uri.startsWith('file://')
    ) {
      const info = await FileSystem.getInfoAsync(cached.uri);
      if (info.exists) return; // already have exactly this image on disk
    }
    const aspect = await measure(url);
    if (aspect === null) return; // unreachable image: keep whatever worked before

    const dir = FileSystem.documentDirectory;
    let uri = url;
    if (dir) {
      const target = `${dir}splash-logo-${Date.now()}.png`;
      const dl = await FileSystem.downloadAsync(url, target);
      if (dl.status >= 200 && dl.status < 300) {
        uri = dl.uri;
        if (cached?.uri.startsWith('file://') && cached.uri !== uri) {
          await FileSystem.deleteAsync(cached.uri, { idempotent: true }).catch(() => {});
        }
      }
    }
    mmkvStorage.setString(SPLASH_CACHE_KEY, JSON.stringify({ uri, remote: url, aspect }));
  } catch {
    // best effort: the splash falls back to the main logo or the bundled mark
  }
}

/**
 * Refresh both logo caches straight from the backend, outside React Query.
 *
 * The header query is persisted and only refetches when it is an hour stale,
 * so a logo changed in the admin could take hours to reach the splash, which
 * reads the cache before React runs. The splash calls this on every cold
 * launch: one small request, and the change shows on the next launch. Never
 * throws; a failure leaves the caches as they were.
 */
export async function refreshAppLogoCaches(): Promise<'updated' | 'failed'> {
  try {
    const res = await apiClient.get<ApiEnvelope<AppLogoPayload | null>>(
      API_ENDPOINTS.APP_LOGO.CURRENT,
      { timeout: 8000, ...(APP_BUILD ? { params: { appBuild: APP_BUILD } } : {}) }
    );
    writeCachedLogo(res.data.data?.imageUrl ?? null);
    keepAppSettings(res.data.data);
    await syncSplashLogo(res.data.data?.splashImageUrl ?? null);
    return 'updated';
  } catch {
    return 'failed';
  }
}

/**
 * The main header logo (wordmark) is admin-settable from atto-web and served by
 * content-service at `/content/app-logo`. This hook returns the current URL, or
 * `null` when none is set — the header then falls back to its bundled default.
 *
 * Cached like the app-icon catalogue: 1h stale, refreshed on focus, so an admin
 * change lands within one refresh cycle with no rebuild. Failures resolve to
 * `null` (never throw) so a backend blip can never blank the header.
 */
export function useAppLogo(): string | null {
  const cached = readCachedLogo();
  const { data } = useQuery<string | null>({
    queryKey: QUERY_KEYS.APP_LOGO.CURRENT,
    queryFn: async () => {
      try {
        const res = await apiClient.get<ApiEnvelope<AppLogoPayload | null>>(
          API_ENDPOINTS.APP_LOGO.CURRENT,
          {
            timeout: 8000,
            ...(APP_BUILD ? { params: { appBuild: APP_BUILD } } : {}),
          }
        );
        const url = res.data.data?.imageUrl ?? null;
        writeCachedLogo(url);
        keepAppSettings(res.data.data);
        void syncSplashLogo(res.data.data?.splashImageUrl ?? null);
        return url;
      } catch {
        // Keep the last known logo on a network blip instead of dropping back
        // to the bundled default (which would shrink the header for a beat).
        return cached ?? null;
      }
    },
    // Paint the persisted logo immediately, but treat it as stale (updatedAt 0)
    // so a background refresh still runs and picks up any admin change.
    initialData: cached,
    initialDataUpdatedAt: 0,
    staleTime: 60 * 60 * 1000, // 1 hour — the logo changes rarely
    gcTime: 24 * 60 * 60 * 1000,
  });

  return data ?? null;
}

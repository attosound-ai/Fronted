/**
 * Admin editable app settings (content-service `app_settings`, served inside
 * the app-logo payload on every cold launch and refresh): the feed header
 * menu and the launch splash mark size. Pure helpers plus an MMKV cache so
 * the splash, which paints before React Query runs, reads the last value.
 */
import { mmkvStorage } from '@/lib/storage/mmkv';

export type FeedMenuKey = 'following' | 'notifications' | 'store' | 'about' | 'dating' | 'art';

export interface FeedMenuItem {
  key: FeedMenuKey;
  /** Admin label; empty means the app's translated name. */
  label?: string;
  /** lucide-react-native icon name; unknown names fall back to the default. */
  icon?: string;
  hidden?: boolean;
}

export interface AppSettings {
  feedMenu: FeedMenuItem[] | null;
  splashScale: number | null;
}

export const FEED_MENU_KEYS: FeedMenuKey[] = [
  'following',
  'notifications',
  'store',
  'about',
  'dating',
  'art',
];

/** Default icon per entry, the same the code always drew. */
export const DEFAULT_FEED_MENU_ICON: Record<FeedMenuKey, string> = {
  following: 'Users',
  notifications: 'Bell',
  store: 'ShoppingBag',
  about: 'Info',
  dating: 'Heart',
  art: 'Palette',
};

/** The splash mark's width as a fraction of the screen when nothing is set. */
export const DEFAULT_SPLASH_SCALE = 0.3;
const SPLASH_SCALE_MIN = 0.15;
const SPLASH_SCALE_MAX = 0.8;

const CACHE_KEY = 'app_settings_v1';

function isKey(v: unknown): v is FeedMenuKey {
  return typeof v === 'string' && (FEED_MENU_KEYS as string[]).includes(v);
}

/** Cleans a raw feed menu: known keys only, each once, in the given order. */
export function parseFeedMenu(raw: unknown): FeedMenuItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set<string>();
  const out: FeedMenuItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (!isKey(o.key) || seen.has(o.key)) continue;
    seen.add(o.key);
    const entry: FeedMenuItem = { key: o.key };
    if (typeof o.label === 'string' && o.label.trim()) entry.label = o.label.trim().slice(0, 40);
    if (typeof o.icon === 'string' && o.icon.trim()) entry.icon = o.icon.trim();
    if (o.hidden === true) entry.hidden = true;
    out.push(entry);
  }
  return out.length ? out : null;
}

export function parseSplashScale(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < SPLASH_SCALE_MIN || n > SPLASH_SCALE_MAX) return null;
  return n;
}

/**
 * The menu the header draws: the admin order first, then any known entry the
 * admin did not mention (so a new entry in the code is never lost), hidden
 * ones removed. With nothing set, the built in order.
 */
export function resolveFeedMenu(items: FeedMenuItem[] | null): FeedMenuItem[] {
  const base: FeedMenuItem[] = FEED_MENU_KEYS.map((key) => ({ key }));
  if (!items) return base;
  const seen = new Set<string>();
  const out: FeedMenuItem[] = [];
  for (const it of items) {
    seen.add(it.key);
    if (!it.hidden) out.push(it);
  }
  for (const b of base) if (!seen.has(b.key)) out.push(b);
  return out;
}

export function readCachedAppSettings(): AppSettings {
  try {
    const raw = mmkvStorage.getString(CACHE_KEY);
    if (!raw) return { feedMenu: null, splashScale: null };
    const v = JSON.parse(raw) as Partial<AppSettings>;
    return {
      feedMenu: parseFeedMenu(v.feedMenu),
      splashScale: parseSplashScale(v.splashScale),
    };
  } catch {
    return { feedMenu: null, splashScale: null };
  }
}

export function writeCachedAppSettings(settings: AppSettings): void {
  try {
    mmkvStorage.setString(CACHE_KEY, JSON.stringify(settings));
  } catch {
    // best effort: the next refresh writes it again
  }
}

/** The splash reads this synchronously before React Query exists. */
export function getCachedSplashScale(): number {
  return readCachedAppSettings().splashScale ?? DEFAULT_SPLASH_SCALE;
}

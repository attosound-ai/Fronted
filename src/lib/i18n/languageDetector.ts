import type { LanguageDetectorModule } from 'i18next';
import { getLocales } from 'expo-localization';
import { mmkvStorage } from '@/lib/storage/mmkv';

const STORAGE_KEY = 'atto:language';
const SUPPORTED = ['en', 'es', 'pt-BR'] as const;

function mapLocale(locale: string): string {
  if (locale.startsWith('pt')) return 'pt-BR';
  if (locale.startsWith('es')) return 'es';
  return 'en';
}

export const languageDetector: LanguageDetectorModule = {
  type: 'languageDetector',

  detect() {
    const stored = mmkvStorage.getString(STORAGE_KEY);
    if (stored && (SUPPORTED as readonly string[]).includes(stored)) return stored;

    const deviceLocale = getLocales()[0]?.languageTag ?? 'en';
    return mapLocale(deviceLocale);
  },

  cacheUserLanguage(lng: string) {
    mmkvStorage.setString(STORAGE_KEY, lng);
  },

  init() {},
};

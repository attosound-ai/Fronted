import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { languageDetector } from './languageDetector';
import { resources } from './resources';

export const supportedLanguages = ['en', 'es', 'pt-BR'] as const;

export const namespaces = [
  'common',
  'auth',
  'registration',
  'profile',
  'messages',
  'projects',
  'calls',
  'subscription',
  'feed',
  'validation',
] as const;

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [...namespaces],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18n;

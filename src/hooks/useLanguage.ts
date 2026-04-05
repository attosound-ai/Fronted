import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages } from '@/lib/i18n';

const languageNames: Record<string, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
};

export function useLanguage() {
  const { i18n } = useTranslation();

  const changeLanguage = useCallback(
    (lng: string) => {
      i18n.changeLanguage(lng);
    },
    [i18n]
  );

  const languages = supportedLanguages.map((code) => ({
    code,
    nativeName: languageNames[code] ?? code,
  }));

  return {
    currentLanguage: i18n.language,
    changeLanguage,
    languages,
  };
}

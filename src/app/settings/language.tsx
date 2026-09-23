import { useTranslation } from 'react-i18next';

import { useLanguage } from '@/hooks/useLanguage';
import { ChoiceList, Section, SettingsForm } from '@/features/settings/native';

export default function LanguageSettingsScreen() {
  const { t } = useTranslation('common');
  const { currentLanguage, changeLanguage, languages } = useLanguage();
  return (
    <SettingsForm>
      <Section title={t('language.title')}>
        <ChoiceList
          selection={currentLanguage}
          options={languages.map((l) => ({ value: l.code, label: l.nativeName }))}
          onChange={(code) => changeLanguage(code)}
        />
      </Section>
    </SettingsForm>
  );
}

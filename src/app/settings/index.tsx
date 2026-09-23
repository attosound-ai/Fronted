import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { AppIconPickerSheet, useAppIconStore } from '@/features/appIcon';
import { useLanguage } from '@/hooks/useLanguage';
import { useRecorderModeStore } from '@/stores/recorderModeStore';
import { useEffectiveRecorderMode } from '@/features/settings/useEffectiveRecorderMode';
import { NavRow, Section, SettingsForm, ToggleRow } from '@/features/settings/native';

const DISPLAY_CODE: Record<string, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português',
};

export default function SettingsScreen() {
  const { t } = useTranslation(['profile', 'common']);
  const { currentLanguage } = useLanguage();
  const selectedIconSlot = useAppIconStore((s) => s.selectedSlot);
  const [iconSheetVisible, setIconSheetVisible] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(!analytics.hasOptedOut());
  const storedMode = useRecorderModeStore((s) => s.mode);
  const effectiveMode = useEffectiveRecorderMode();

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.PROFILE.SETTINGS_SCREEN_OPENED, {
      screen: 'settings',
      recorder_mode: storedMode,
      recorder_effective: effectiveMode,
    });
  }, [storedMode, effectiveMode]);

  return (
    <>
      <SettingsForm>
        <Section title={t('settings.recorderSection')}>
          <NavRow
            title={t('settings.recorderLabel')}
            value={
              effectiveMode === 'pro'
                ? t('settings.recorderPro')
                : t('settings.recorderSimple')
            }
            onPress={() => router.push('/settings/recorder')}
          />
        </Section>
        <Section title={t('settings.generalSection')}>
          <NavRow
            title={t('settings.languageLabel')}
            value={DISPLAY_CODE[currentLanguage] ?? currentLanguage}
            onPress={() => router.push('/settings/language')}
          />
          <NavRow
            title={t('settings.appIconLabel', { defaultValue: 'App icon' })}
            value={
              selectedIconSlot ?? t('appIcon.defaultLabel', { defaultValue: 'Default' })
            }
            onPress={() => {
              analytics.capture(ANALYTICS_EVENTS.PROFILE.APP_ICON_PICKER_OPENED);
              setIconSheetVisible(true);
            }}
          />
          <ToggleRow
            title={t('settings.analyticsLabel', { defaultValue: 'Analytics' })}
            isOn={analyticsEnabled}
            onChange={(on) => {
              setAnalyticsEnabled(on);
              if (on) analytics.optIn();
              else analytics.optOut();
            }}
          />
        </Section>
      </SettingsForm>
      <AppIconPickerSheet
        visible={iconSheetVisible}
        onClose={() => setIconSheetVisible(false)}
      />
    </>
  );
}

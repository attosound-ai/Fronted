import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ProfileSection } from './ProfileSection';
import { useLanguage } from '@/hooks/useLanguage';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { AppIconPickerSheet, useAppIconStore } from '@/features/appIcon';
import { useEffectiveRecorderMode } from '@/features/settings/useEffectiveRecorderMode';
import {
  EmbeddedSettings,
  InsetGroup,
  NavRow,
  ToggleRow,
} from '@/features/settings/native';

const DISPLAY_CODE: Record<string, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português',
};

/**
 * The profile's settings: native inset grouped rows (SwiftUI) that navigate
 * like Apple's Settings app (David, Sep 23 2026). Recorder and language push
 * their own screens; the app icon keeps its sheet; analytics is a toggle.
 */
export function ProfileSettingsSection() {
  const { t } = useTranslation(['profile', 'common']);
  const { currentLanguage } = useLanguage();
  const [iconSheetVisible, setIconSheetVisible] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(!analytics.hasOptedOut());
  const selectedIconSlot = useAppIconStore((s) => s.selectedSlot);
  const recorderMode = useEffectiveRecorderMode();

  const handleAnalyticsToggle = (value: boolean) => {
    setAnalyticsEnabled(value);
    if (value) {
      analytics.optIn();
    } else {
      analytics.optOut();
    }
  };

  return (
    <ProfileSection title={t('settings.sectionTitle')}>
      <EmbeddedSettings>
        <InsetGroup>
          <NavRow
            title={t('settings.recorderLabel')}
            value={
              recorderMode === 'pro'
                ? t('settings.recorderPro')
                : t('settings.recorderSimple')
            }
            onPress={() => {
              analytics.capture(ANALYTICS_EVENTS.PROFILE.SETTINGS_SCREEN_OPENED, {
                screen: 'recorder',
                from: 'profile',
              });
              router.push('/settings/recorder');
            }}
          />
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
            onChange={handleAnalyticsToggle}
          />
        </InsetGroup>
      </EmbeddedSettings>

      <AppIconPickerSheet
        visible={iconSheetVisible}
        onClose={() => setIconSheetVisible(false)}
      />
    </ProfileSection>
  );
}

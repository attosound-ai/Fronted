import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useRecorderModeStore, type RecorderMode } from '@/stores/recorderModeStore';
import { useEffectiveRecorderMode } from '@/features/settings/useEffectiveRecorderMode';
import {
  ChoiceList,
  FooterText,
  Section,
  SettingsForm,
} from '@/features/settings/native';

export default function RecorderSettingsScreen() {
  const { t } = useTranslation('profile');
  const setMode = useRecorderModeStore((s) => s.setMode);
  const stored = useRecorderModeStore((s) => s.mode);
  const effective = useEffectiveRecorderMode();

  const choose = (mode: RecorderMode) => {
    if (mode === effective && mode === stored) return;
    analytics.capture(ANALYTICS_EVENTS.PROFILE.RECORDER_MODE_CHANGED, {
      from: effective,
      to: mode,
      was_explicit: stored !== null,
    });
    setMode(mode);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('settings.recorderLabel') }} />
      <SettingsForm>
        <Section
          title={t('settings.recorderLabel')}
          footer={<FooterText>{t('settings.recorderFooter')}</FooterText>}
        >
          <ChoiceList<RecorderMode>
            selection={effective}
            options={[
              { value: 'pro', label: t('settings.recorderPro') },
              { value: 'simple', label: t('settings.recorderSimple') },
            ]}
            onChange={choose}
          />
        </Section>
        <Section title={t('settings.recorderPro')}>
          <FooterText>{t('settings.recorderProDetail')}</FooterText>
        </Section>
        <Section title={t('settings.recorderSimple')}>
          <FooterText>{t('settings.recorderSimpleDetail')}</FooterText>
        </Section>
      </SettingsForm>
    </>
  );
}

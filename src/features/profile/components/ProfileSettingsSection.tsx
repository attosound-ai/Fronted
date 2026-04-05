import { useState } from 'react';
import { View, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Globe, Eye } from 'lucide-react-native';
import { ProfileSection } from './ProfileSection';
import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useLanguage } from '@/hooks/useLanguage';
import { analytics } from '@/lib/analytics';

const DISPLAY_CODE: Record<string, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português',
};

export function ProfileSettingsSection() {
  const { t } = useTranslation(['profile', 'common']);
  const { currentLanguage, changeLanguage, languages } = useLanguage();
  const [langSheetVisible, setLangSheetVisible] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(!analytics.hasOptedOut());

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
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => setLangSheetVisible(true)}
      >
        <View style={styles.left}>
          <Globe size={18} color="#888888" strokeWidth={2.25} />
          <Text variant="body" style={styles.label}>
            {t('settings.languageLabel')}
          </Text>
        </View>
        <Text variant="body" style={styles.value}>
          {DISPLAY_CODE[currentLanguage] ?? currentLanguage}
        </Text>
      </TouchableOpacity>

      <View style={styles.row}>
        <View style={styles.left}>
          <Eye size={18} color="#888888" strokeWidth={2.25} />
          <Text variant="body" style={styles.label}>
            {t('settings.analyticsLabel', { defaultValue: 'Analytics' })}
          </Text>
        </View>
        <Switch
          value={analyticsEnabled}
          onValueChange={handleAnalyticsToggle}
          trackColor={{ false: '#333333', true: '#3B82F6' }}
          thumbColor="#FFFFFF"
        />
      </View>

      <BottomSheet
        visible={langSheetVisible}
        onClose={() => setLangSheetVisible(false)}
        title={t('common:language.title')}
      >
        {languages.map((lang) => {
          const isActive = lang.code === currentLanguage;
          return (
            <TouchableOpacity
              key={lang.code}
              style={styles.langOption}
              onPress={() => {
                changeLanguage(lang.code);
                setLangSheetVisible(false);
              }}
            >
              <Text style={[styles.langText, isActive && styles.langTextActive]}>
                {lang.nativeName}
              </Text>
              {isActive && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </ProfileSection>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: '#888888',
  },
  value: {
    color: '#FFFFFF',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  langText: {
    color: '#AAAAAA',
    fontFamily: 'Archivo_400Regular',
    fontSize: 16,
  },
  langTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  check: {
    color: '#FFFFFF',
    fontSize: 18,
  },
});

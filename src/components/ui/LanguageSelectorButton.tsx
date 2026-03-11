import { useState } from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLanguage } from '@/hooks/useLanguage';
import { BottomSheet } from './BottomSheet';
import { Text } from './Text';

const displayCode: Record<string, string> = {
  en: 'EN',
  es: 'ES',
  'pt-BR': 'PT',
};

interface LanguageSelectorButtonProps {
  style?: StyleProp<ViewStyle>;
}

export function LanguageSelectorButton({ style }: LanguageSelectorButtonProps) {
  const { t } = useTranslation('common');
  const { currentLanguage, changeLanguage, languages } = useLanguage();
  const [visible, setVisible] = useState(false);

  const label = displayCode[currentLanguage] ?? currentLanguage.slice(0, 2).toUpperCase();

  return (
    <>
      <TouchableOpacity
        style={[styles.button, style]}
        onPress={() => setVisible(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.buttonText}>{label}</Text>
      </TouchableOpacity>

      <BottomSheet
        visible={visible}
        onClose={() => setVisible(false)}
        title={t('language.title')}
      >
        {languages.map((lang) => {
          const isActive = lang.code === currentLanguage;
          return (
            <TouchableOpacity
              key={lang.code}
              style={styles.option}
              onPress={() => {
                changeLanguage(lang.code);
                setVisible(false);
              }}
            >
              <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                {lang.nativeName}
              </Text>
              {isActive && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  optionText: {
    color: '#AAAAAA',
    fontFamily: 'Archivo_400Regular',
    fontSize: 16,
  },
  optionTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
  },
  check: {
    color: '#3B82F6',
    fontSize: 18,
  },
});

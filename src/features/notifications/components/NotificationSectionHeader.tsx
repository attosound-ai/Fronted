import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import type { TimeSection } from '../types';

interface Props {
  section: TimeSection;
}

export function NotificationSectionHeader({ section }: Props) {
  const { t } = useTranslation('notifications');

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{t(`sections.${section}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#000',
  },
  text: {
    color: '#888',
    fontSize: 13,
    fontFamily: 'Archivo_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

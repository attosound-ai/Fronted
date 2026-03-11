import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';

export function EmptyProjectsState() {
  const { t } = useTranslation('projects');
  return (
    <View style={styles.container}>
      <Ionicons name="folder-open-outline" size={64} color="#333" />
      <Text variant="h3" style={styles.title}>
        {t('empty.title')}
      </Text>
      <Text variant="body" style={styles.subtitle}>
        {t('empty.subtitle')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  title: {
    color: '#FFF',
    marginTop: 8,
  },
  subtitle: {
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});

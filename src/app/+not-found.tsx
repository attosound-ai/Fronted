import { View, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';

/**
 * NotFoundScreen - Pantalla 404
 */
export default function NotFoundScreen() {
  const { t } = useTranslation('common');
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <View style={styles.container}>
        <Text variant="h1">{t('notFound.code')}</Text>
        <Text variant="body" style={styles.message}>
          {t('notFound.message')}
        </Text>
        <Link href="/" style={styles.link}>
          <Text variant="body" style={styles.linkText}>
            {t('notFound.goHome')}
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    padding: 20,
  },
  message: {
    color: '#888888',
    marginTop: 8,
  },
  link: {
    marginTop: 24,
  },
  linkText: {
    color: '#3B82F6',
  },
});

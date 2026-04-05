import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

export function ConversationsHeader() {
  const { t } = useTranslation('messages');
  return (
    <View style={styles.container}>
      <Text variant="h1">{t('header.title')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  button: {
    padding: SPACING.xs,
  },
});

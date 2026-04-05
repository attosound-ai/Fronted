import { View, StyleSheet } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

export function EmptyConversations() {
  const { t } = useTranslation('messages');
  return (
    <View style={styles.container}>
      <MessageCircle size={48} color={COLORS.gray[500]} strokeWidth={2.25} />
      <Text variant="h2" style={styles.title}>
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
    paddingTop: 120,
    gap: SPACING.sm,
  },
  title: {
    color: COLORS.white,
    marginTop: SPACING.md,
  },
  subtitle: {
    color: COLORS.gray[500],
  },
});

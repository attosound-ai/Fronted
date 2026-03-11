import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

interface ConversationsHeaderProps {
  onNewMessage: () => void;
}

export function ConversationsHeader({ onNewMessage }: ConversationsHeaderProps) {
  const { t } = useTranslation('messages');
  return (
    <View style={styles.container}>
      <Text variant="h1">{t('header.title')}</Text>
      <TouchableOpacity
        onPress={onNewMessage}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={t('header.newMessageAccessibility')}
      >
        <Ionicons name="create-outline" size={24} color={COLORS.white} />
      </TouchableOpacity>
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

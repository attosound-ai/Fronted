import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

export function EmptyConversations() {
  return (
    <View style={styles.container}>
      <Ionicons name="chatbubbles-outline" size={48} color={COLORS.gray[500]} />
      <Text variant="h2" style={styles.title}>
        No messages yet
      </Text>
      <Text variant="body" style={styles.subtitle}>
        Start a conversation
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

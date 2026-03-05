import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

interface ConversationsHeaderProps {
  onNewMessage: () => void;
}

export function ConversationsHeader({ onNewMessage }: ConversationsHeaderProps) {
  return (
    <View style={styles.container}>
      <Text variant="h1">Messages</Text>
      <TouchableOpacity
        onPress={onNewMessage}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="New message"
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

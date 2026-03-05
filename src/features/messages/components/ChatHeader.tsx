import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING } from '@/constants/theme';
import { useParticipantAvatar } from '../hooks/useParticipantAvatar';

interface ChatHeaderProps {
  participantName: string;
  participantId: string;
  onBack: () => void;
}

export function ChatHeader({ participantName, participantId, onBack }: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const avatarUri = useParticipantAvatar(participantId);

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.sm }]}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={28} color={COLORS.white} />
      </TouchableOpacity>
      <Avatar uri={avatarUri} size="sm" />
      <Text variant="h3" numberOfLines={1} style={styles.name}>
        {participantName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.black,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border.dark,
    gap: SPACING.sm,
  },
  backButton: {
    padding: SPACING.xs,
  },
  name: {
    flex: 1,
    color: COLORS.white,
  },
});

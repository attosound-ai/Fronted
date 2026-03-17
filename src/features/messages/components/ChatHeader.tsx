import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { COLORS, SPACING } from '@/constants/theme';
import { useParticipantProfile } from '../hooks/useParticipantAvatar';

interface ChatHeaderProps {
  participantName: string;
  participantId: string;
  onBack: () => void;
}

export function ChatHeader({ participantName, participantId, onBack }: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const { avatarUri, displayName } = useParticipantProfile(participantId);
  const name = participantName || displayName || 'User';

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.xs }]}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={28} color={COLORS.white} />
      </TouchableOpacity>

      <Text variant="h3" numberOfLines={1} style={styles.name}>
        {name}
      </Text>

      <Avatar uri={avatarUri} size="sm" fallbackText={name} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  backButton: {
    padding: SPACING.xs,
    width: 44,
  },
  name: {
    flex: 1,
    color: COLORS.white,
    textAlign: 'center',
  },
});

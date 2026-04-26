import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, Phone } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { COLORS, SPACING } from '@/constants/theme';
import { useParticipantProfile } from '../hooks/useParticipantAvatar';
import { makeVoIPCall } from '@/hooks/useTwilioVoice';
import { useCallStore } from '@/stores/callStore';

interface ChatHeaderProps {
  participantName: string;
  participantId: string;
  onBack: () => void;
  hideBack?: boolean;
}

export function ChatHeader({
  participantName,
  participantId,
  onBack,
  hideBack,
}: ChatHeaderProps) {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const { avatarUri, username, role } = useParticipantProfile(participantId);
  const name = username || participantName || t('conversation.fallbackUserName');
  const isInCall = useCallStore((s) => s.activeCall !== null);

  return (
    <View style={[styles.container, { paddingTop: insets.top + SPACING.xs }]}>
      {!hideBack && (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('chatHeader.backAccessibilityLabel')}
        >
          <ChevronLeft size={28} color={COLORS.white} strokeWidth={2.25} />
        </TouchableOpacity>
      )}

      <View style={styles.nameRow}>
        <Text
          variant="h3"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1.15}
          style={styles.name}
        >
          {name}
        </Text>
        {role === 'creator' && <CreatorBadge size="sm" />}
      </View>

      <View style={styles.rightContainer}>
        <TouchableOpacity
          onPress={() => makeVoIPCall(participantId, name)}
          disabled={isInCall}
          style={[styles.callButton, isInCall && styles.callButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('chatHeader.voiceCallAccessibilityLabel')}
        >
          <Phone size={22} color={isInCall ? '#555' : COLORS.white} strokeWidth={2.25} />
        </TouchableOpacity>

        <Avatar
          uri={avatarUri}
          size="sm"
          fallbackText={name}
          creatorRing={role === 'creator'}
        />
      </View>
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
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  nameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  name: {
    color: COLORS.white,
    textAlign: 'center',
  },
  rightContainer: {
    width: 44,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.xs,
    flexShrink: 0,
  },
  callButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonDisabled: {
    opacity: 0.4,
  },
});

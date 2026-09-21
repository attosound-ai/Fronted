import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft, Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { CreatorBadge } from '@/components/ui/CreatorBadge';
import { COLORS, SPACING } from '@/constants/theme';
import { useParticipantProfile } from '../hooks/useParticipantAvatar';
import { makeVoIPCall } from '@/hooks/useTwilioVoice';
import { useCallStore } from '@/stores/callStore';
import { useScreenTopInset } from '@/hooks/useInCallChrome';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { router } from 'expo-router';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

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
  // Reserves room below the green call-bar overlay when a call is up. The header
  // never recolors green — green lives only on the InCallTopBar.
  const topInset = useScreenTopInset();
  const { avatarUri, username, role } = useParticipantProfile(participantId);
  const name = username || participantName || t('conversation.fallbackUserName');
  const isInCall = useCallStore((s) => s.activeCall !== null);

  return (
    <View style={[styles.container, { paddingTop: topInset + SPACING.xs }]}>
      {!hideBack && (
        <GlassSurface radius={22} style={styles.glassButton}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('chatHeader.backAccessibilityLabel')}
          >
            <ChevronLeft size={26} color={COLORS.white} strokeWidth={2.25} />
          </TouchableOpacity>
        </GlassSurface>
      )}

      <GlassSurface radius={20} style={styles.namePill}>
        <TouchableOpacity
          style={styles.nameRow}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('chatHeader.openProfileAccessibilityLabel', { name })}
          onPress={() => {
            analytics.capture(ANALYTICS_EVENTS.MESSAGES.HEADER_PROFILE_OPENED, {
              participant_id: participantId,
            });
            router.push({
              pathname: '/user/[id]',
              params: { id: participantId, username: name, avatar: avatarUri ?? '' },
            });
          }}
        >
          <Avatar
            uri={avatarUri}
            size="sm"
            fallbackText={name}
            creatorRing={role === 'creator'}
            style={styles.pillAvatar}
          />
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
        </TouchableOpacity>
      </GlassSurface>

      <View style={styles.rightContainer}>
        <GlassSurface radius={22} style={styles.glassButton}>
          <TouchableOpacity
            onPress={() => makeVoIPCall(participantId, name)}
            disabled={isInCall}
            style={[styles.callButton, isInCall && styles.callButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('chatHeader.voiceCallAccessibilityLabel')}
          >
            <Phone
              size={20}
              color={isInCall ? '#555' : COLORS.white}
              strokeWidth={2.25}
            />
          </TouchableOpacity>
        </GlassSurface>
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
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    // The wallpaper shows through; the glass buttons sit on it like the feed.
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  glassButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  // Flush under the green call bar → same green so the top chrome reads as one.
  containerInCall: {
    backgroundColor: '#22C55E',
  },
  backButton: {
    padding: SPACING.xs,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  // Telegram puts the title in a glass pill so it reads over any wallpaper.
  // Telegram puts the title in a glass pill so it reads over any wallpaper;
  // the avatar lives inside it (one component, no duplicate on the right)
  // and the whole pill opens the profile.
  namePill: {
    flexShrink: 1,
    maxWidth: '66%',
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    marginHorizontal: SPACING.sm,
  },
  nameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingLeft: 6,
    paddingRight: 14,
  },
  pillAvatar: { flexShrink: 0 },
  name: {
    color: COLORS.white,
    textAlign: 'center',
  },
  // Same width as the back button so the pill sits centred between them.
  rightContainer: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
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

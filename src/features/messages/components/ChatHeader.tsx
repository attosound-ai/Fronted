import type React from 'react';
import { Platform, View, TouchableOpacity, StyleSheet } from 'react-native';
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

// Native iOS context menu, loaded the same guarded way as the thread rows so
// the header still renders when the module is absent (tests, other platforms).
const ContextMenuView =
  Platform.OS === 'ios'
    ? (require('react-native-ios-context-menu').ContextMenuView as React.ComponentType<
        Record<string, unknown>
      >)
    : null;
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MenuHost: React.ComponentType<any> = ContextMenuView ?? View;

interface ChatHeaderProps {
  participantName: string;
  participantId: string;
  onBack: () => void;
  hideBack?: boolean;
  /** Opens the wallpaper picker for this chat (long press menu on the name). */
  onOpenWallpaper?: () => void;
}

export function ChatHeader({
  participantName,
  participantId,
  onBack,
  hideBack,
  onOpenWallpaper,
}: ChatHeaderProps) {
  const { t } = useTranslation('messages');
  // Reserves room below the green call-bar overlay when a call is up. The header
  // never recolors green — green lives only on the InCallTopBar.
  const topInset = useScreenTopInset();
  const { avatarUri, username, role } = useParticipantProfile(participantId);
  const name = username || participantName || t('conversation.fallbackUserName');
  const isInCall = useCallStore((s) => s.activeCall !== null);
  const openProfile = () => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.HEADER_PROFILE_OPENED, {
      participant_id: participantId,
    });
    router.push({
      pathname: '/user/[id]',
      params: { id: participantId, username: name, avatar: avatarUri ?? '' },
    });
  };

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
        <MenuHost
          style={styles.nameRow}
          menuConfig={{
            menuTitle: '',
            menuItems: [
              {
                actionKey: 'profile',
                actionTitle: t('chatHeader.menuViewProfile'),
                icon: {
                  type: 'IMAGE_SYSTEM',
                  imageValue: { systemName: 'person.crop.circle' },
                },
              },
              {
                actionKey: 'wallpaper',
                actionTitle: t('chatHeader.menuWallpaper'),
                icon: {
                  type: 'IMAGE_SYSTEM',
                  imageValue: { systemName: 'photo.on.rectangle' },
                },
              },
            ],
          }}
          onPressMenuItem={({ nativeEvent }: { nativeEvent: { actionKey: string } }) => {
            analytics.capture(ANALYTICS_EVENTS.MESSAGES.HEADER_MENU_ACTION, {
              action: nativeEvent.actionKey,
              participant_id: participantId,
            });
            if (nativeEvent.actionKey === 'wallpaper') onOpenWallpaper?.();
            if (nativeEvent.actionKey === 'profile') openProfile();
          }}
        >
          <TouchableOpacity
            style={styles.nameRow}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('chatHeader.openProfileAccessibilityLabel', { name })}
            onPress={openProfile}
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
        </MenuHost>
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
    // No band of its own: the wallpaper runs under the header and only the
    // glass buttons sit on it (Telegram on iOS 26).
    backgroundColor: 'transparent',
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

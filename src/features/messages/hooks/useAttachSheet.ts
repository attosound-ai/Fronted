import { useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

export const ATTACH_OPTIONS = [
  'photo',
  'camera',
  'file',
  'location',
  'contact',
  'audio',
] as const;
export type AttachOption =
  | (typeof ATTACH_OPTIONS)[number]
  | 'voice_note'
  | 'android_sheet';

/**
 * The "+" sheet shared by the composer and the expanded editor: every
 * attachment kind WhatsApp, Telegram, iMessage and Slack offer. Sending
 * media is not in the backend yet, so each option says so; the choice is
 * still recorded to learn what people reach for first.
 */
export function useAttachSheet(conversationId: string) {
  const { t } = useTranslation('messages');

  const notYet = useCallback(
    (option: AttachOption) => {
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.ATTACH_OPTION_PICKED, {
        conversation_id: conversationId,
        option,
      });
      Alert.alert(t('composer.comingSoonTitle'), t('composer.comingSoonBody'));
    },
    [conversationId, t]
  );

  const openAttach = useCallback(() => {
    haptic('light');
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.ATTACH_OPENED, {
      conversation_id: conversationId,
    });
    const labels = [
      t('composer.attachPhoto'),
      t('composer.attachCamera'),
      t('composer.attachFile'),
      t('composer.attachLocation'),
      t('composer.attachContact'),
      t('composer.attachAudio'),
      t('composer.cancel'),
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          cancelButtonIndex: labels.length - 1,
          userInterfaceStyle: 'dark',
        },
        (index) => {
          if (index < ATTACH_OPTIONS.length) notYet(ATTACH_OPTIONS[index]);
        }
      );
    } else {
      notYet('android_sheet');
    }
  }, [conversationId, notYet, t]);

  return { openAttach, notYet };
}

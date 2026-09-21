import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/constants/theme';
import { GOLD } from '@/constants/gold';
import { mediaPreviewLabel } from '../media/chatMedia';
import type { AttoMessage } from '../utils/messageAdapter';

interface ReplyFocusProps {
  message: AttoMessage | null;
  isOwn: boolean;
  senderIsCreator: boolean;
  onCancel: () => void;
}

/**
 * iMessage's reply: everything behind goes out of focus and the message you
 * are answering floats over the composer, so the reply is written against
 * that one bubble and nothing else. Tapping the blur or the cross leaves.
 */
function ReplyFocusInner({ message, isOwn, senderIsCreator, onCancel }: ReplyFocusProps) {
  const { t } = useTranslation('messages');
  if (!message) return null;
  const preview =
    mediaPreviewLabel(message.contentType, t as unknown as (key: string) => string) ??
    message.text;
  const name = isOwn ? t('chat.you') : message.user.name || '';
  const light = isOwn || senderIsCreator;

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(140)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityLabel={t('actions.cancel')}
        >
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(140)}
        style={styles.card}
      >
        <Text style={styles.label} numberOfLines={1}>
          {t('actions.replyingTo', { name })}
        </Text>
        <View style={[styles.bubbleRow, isOwn ? styles.rowOwn : styles.rowOther]}>
          <View style={styles.bubbleWrap}>
            {light ? (
              <LinearGradient
                colors={
                  senderIsCreator
                    ? [GOLD.highlightSoft, GOLD.base]
                    : [COLORS.white, COLORS.white]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <Text
              style={[styles.text, light ? styles.textDark : styles.textLight]}
              numberOfLines={4}
            >
              {preview}
            </Text>
          </View>
          <Pressable
            onPress={onCancel}
            hitSlop={10}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('actions.cancel')}
          >
            <X size={16} color={COLORS.white} strokeWidth={2.5} />
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}

export const ReplyFocus = memo(ReplyFocusInner);

const styles = StyleSheet.create({
  card: { paddingHorizontal: 14, paddingBottom: 6, gap: 6 },
  label: {
    color: '#C9C9CE',
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
    marginLeft: 4,
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubbleWrap: {
    maxWidth: '78%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#262626',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: { fontSize: 15, fontFamily: 'Archivo_400Regular' },
  textDark: { color: COLORS.black },
  textLight: { color: COLORS.white },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});

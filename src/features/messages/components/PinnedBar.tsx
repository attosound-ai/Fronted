import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Pin, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { COLORS } from '@/constants/theme';
import { mediaPreviewLabel } from '../media/chatMedia';
import type { ChatMessage } from '../types';

interface PinnedBarProps {
  /** Newest first; the bar shows the newest and counts the rest. */
  pinned: ChatMessage[];
  top: number;
  onOpen: (message: ChatMessage) => void;
  onUnpin: (message: ChatMessage) => void;
}

/**
 * Telegram's pinned bar: a glass strip under the header with an accent rule,
 * the label and a one line preview. Tapping it jumps to the message; the
 * cross unpins it. With several pinned, it shows the newest and how many
 * more there are.
 */
function PinnedBarInner({ pinned, top, onOpen, onUnpin }: PinnedBarProps) {
  const { t } = useTranslation('messages');
  if (!pinned.length) return null;
  const message = pinned[0];
  const preview =
    mediaPreviewLabel(message.contentType, t as unknown as (key: string) => string) ??
    message.content;

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(160)}
      style={[styles.wrap, { top }]}
    >
      <GlassSurface radius={16} style={styles.glass}>
        <Pressable
          style={styles.row}
          onPress={() => onOpen(message)}
          accessibilityRole="button"
          accessibilityLabel={t('pinned.open')}
        >
          <View style={styles.rule} />
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Pin size={12} color={COLORS.white} strokeWidth={2.5} />
              <Text style={styles.title} numberOfLines={1}>
                {pinned.length > 1
                  ? t('pinned.titleCount', { count: pinned.length })
                  : t('pinned.title')}
              </Text>
            </View>
            <Text style={styles.preview} numberOfLines={1}>
              {preview}
            </Text>
          </View>
          <Pressable
            onPress={() => onUnpin(message)}
            hitSlop={10}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('pinned.unpin')}
          >
            <X size={16} color={COLORS.gray[300]} strokeWidth={2.5} />
          </Pressable>
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

export const PinnedBar = memo(PinnedBarInner);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, zIndex: 8 },
  glass: { borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, height: 48 },
  rule: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: COLORS.white,
    marginHorizontal: 10,
  },
  body: { flex: 1, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: COLORS.white, fontSize: 12, fontFamily: 'Archivo_600SemiBold' },
  preview: { color: '#B9B9BE', fontSize: 13, fontFamily: 'Archivo_400Regular' },
  close: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});

import { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { BlurView } from 'expo-blur';
import { Plus } from 'lucide-react-native';

import { haptic } from '@/lib/haptics/hapticService';
import { COLORS } from '@/constants/theme';

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  anchor: Anchor | null;
  /** Emoji already put on this message by the current user, to show them selected. */
  mine: ReadonlySet<string>;
  onPick: (emoji: string) => void;
  onMore: () => void;
  onClose: () => void;
}

/** iMessage's six, in its order, then the free emoji picker. */
export const TAPBACK_EMOJI = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const PILL_HEIGHT = 52;
const GAP = 10;

/**
 * Tapback the iMessage way: the screen behind blurs, a pill of quick reactions
 * pops in just above the bubble (below it when the bubble is near the top),
 * each emoji a beat after the previous one, and a tap outside closes it.
 */
export function TapbackOverlay({ anchor, mine, onPick, onMore, onClose }: Props) {
  const { t } = useTranslation('messages');
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (anchor) void haptic('medium');
  }, [anchor]);
  if (!anchor) return null;

  const above = anchor.y - PILL_HEIGHT - GAP;
  const top = above > 90 ? above : anchor.y + anchor.height + GAP;
  const pillWidth = TAPBACK_EMOJI.length * 44 + 44 + 16;
  const centre = anchor.x + anchor.width / 2;
  const left = Math.max(12, Math.min(width - pillWidth - 12, centre - pillWidth / 2));

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(140)}
        style={StyleSheet.absoluteFill}
      >
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t('actions.close')}
        />
        <Animated.View
          entering={ZoomIn.duration(200).easing(Easing.out(Easing.back(1.4)))}
          exiting={ZoomOut.duration(120)}
          style={[
            styles.pill,
            {
              top,
              left,
              width: pillWidth,
              transformOrigin: above > 90 ? 'bottom' : 'top',
            },
          ]}
        >
          {TAPBACK_EMOJI.map((emoji, i) => {
            const selected = mine.has(emoji);
            return (
              <Animated.View
                key={emoji}
                entering={ZoomIn.delay(40 + i * 28).duration(180)}
              >
                <Pressable
                  onPress={() => {
                    void haptic('light');
                    onPick(emoji);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={emoji}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.emojiButton,
                    selected && styles.emojiSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <RNText style={styles.emoji} maxFontSizeMultiplier={1.0}>
                    {emoji}
                  </RNText>
                </Pressable>
              </Animated.View>
            );
          })}
          <Animated.View
            entering={ZoomIn.delay(40 + TAPBACK_EMOJI.length * 28).duration(180)}
          >
            <Pressable
              onPress={onMore}
              accessibilityRole="button"
              accessibilityLabel={t('actions.more')}
              style={({ pressed }) => [
                styles.emojiButton,
                styles.more,
                pressed && styles.pressed,
              ]}
            >
              <Plus size={18} color={COLORS.white} strokeWidth={2.5} />
            </Pressable>
          </Animated.View>
        </Animated.View>
        <View style={{ height }} pointerEvents="none" />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: '#2A2A2A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelected: { backgroundColor: 'rgba(255,255,255,0.22)' },
  more: { backgroundColor: 'rgba(255,255,255,0.12)' },
  pressed: { opacity: 0.6 },
  emoji: { fontSize: 26 },
});

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { STUDIO_TIPS, TIP_VIDEOS, type TipTarget } from './tipsCatalog';
import { studioPrefs } from './studioPrefs';
import { STUDIO_COLORS } from './studioTheme';

export interface TipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  /** Screen rects of the highlightable areas, measured by the editor. */
  targets: Partial<Record<TipTarget, TipRect>>;
  onDone: () => void;
}

const FRAME_PAD = 6;

function TipVideo({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}

/**
 * SoundLab's tutorial overlay: an orange frame around the area the tip is
 * about, a grey speech card with the text, the clip that demonstrates it,
 * and a close button. A tap anywhere else advances to the next tip; the
 * last one closes and marks the tips as seen.
 */
export function StudioTips({ visible, targets, onDone }: Props) {
  const { t } = useTranslation('projects');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  if (!visible) return null;
  // "Reduce UI Animation": the overlay appears and leaves without a fade.
  const reduceAnimation = studioPrefs.reduceAnimation();
  const tip = STUDIO_TIPS[index];
  const rect = targets[tip.target];
  const isLast = index === STUDIO_TIPS.length - 1;
  const advance = () => {
    void haptic('light');
    if (isLast) onDone();
    else setIndex((i) => i + 1);
  };
  const video = TIP_VIDEOS[tip.id];

  // The card sits under the frame when there is room, above it otherwise.
  const frame = rect
    ? {
        left: Math.max(0, rect.x - FRAME_PAD),
        top: Math.max(0, rect.y - FRAME_PAD),
        width: Math.min(screenWidth, rect.width + FRAME_PAD * 2),
        height: rect.height + FRAME_PAD * 2,
      }
    : null;
  const below = frame ? frame.top + frame.height + 12 : screenHeight * 0.3;
  const cardTop =
    below + 330 < screenHeight ? below : Math.max(24, (frame?.top ?? 200) - 340);

  return (
    <Animated.View
      entering={reduceAnimation ? undefined : FadeIn.duration(180)}
      exiting={reduceAnimation ? undefined : FadeOut.duration(150)}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <Pressable style={styles.backdrop} onPress={advance} accessibilityRole="button" />
      {frame && <View pointerEvents="none" style={[styles.frame, frame]} />}
      <View style={[styles.card, { top: cardTop }]} pointerEvents="box-none">
        <View style={styles.bubble}>
          <Text variant="small" style={styles.text}>
            {t(tip.textKey as 'studio.tips.select')}
          </Text>
          <Text variant="caption" style={styles.counter}>
            {index + 1} / {STUDIO_TIPS.length}
          </Text>
        </View>
        {video !== undefined && (
          <View style={styles.videoWrap}>
            <TipVideo source={video} />
          </View>
        )}
        <Pressable
          onPress={() => {
            void haptic('light');
            onDone();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('studio.tips.close')}
          hitSlop={10}
          style={styles.close}
        >
          <X size={18} color={STUDIO_COLORS.onPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  frame: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: STUDIO_COLORS.selectionLine,
    borderRadius: 6,
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  bubble: {
    backgroundColor: '#D9D9D9',
    borderRadius: 10,
    padding: 14,
  },
  text: {
    color: '#111111',
    fontFamily: 'Archivo_600SemiBold',
    lineHeight: 19,
  },
  counter: {
    color: '#555555',
    marginTop: 8,
    textAlign: 'right',
  },
  videoWrap: {
    marginTop: 10,
    alignSelf: 'center',
    width: 300,
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  close: {
    position: 'absolute',
    top: -22,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: STUDIO_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

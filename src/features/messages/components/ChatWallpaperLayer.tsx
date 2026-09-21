import { memo, useEffect, useRef } from 'react';
import { ImageBackground, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { ChatWallpaper } from '../types';

/** Ceiling for the dark veil: at 0.7 the pattern was barely there. */
const MAX_VEIL = 0.45;
const DEFAULT_VEIL = 0.35;
const DEFAULT_PATTERN_OPACITY = 0.18;
/** Telegram turns its gradient a quarter turn on every sent message. */
const SEND_TURN_DEG = 90;
const SEND_TURN_MS = 700;

interface ChatWallpaperLayerProps {
  wallpaper: ChatWallpaper | null;
  /**
   * Changes whenever the user sends a message (the id of the sent message).
   * Gradient wallpapers rotate a quarter turn on each change, like Telegram.
   */
  sendPulse: string | null;
}

/**
 * The layer behind the thread. Three kinds:
 *  - `image`: the tileable texture the catalogue always had, under a veil.
 *  - `gradient`: four colours drawn on the client, oversized and rotated
 *    from the centre so the corners never show, turning on each send.
 *  - `pattern`: the gradient plus a tileable white line art doodle at low
 *    opacity (Telegram's look).
 */
function ChatWallpaperLayerInner({ wallpaper, sendPulse }: ChatWallpaperLayerProps) {
  const { width, height } = useWindowDimensions();
  const turns = useSharedValue(0);
  const lastPulse = useRef<string | null>(sendPulse);

  useEffect(() => {
    if (sendPulse === lastPulse.current) return;
    lastPulse.current = sendPulse;
    if (!sendPulse || !wallpaper || wallpaper.kind === 'image') return;
    turns.value = withTiming(turns.value + 1, {
      duration: SEND_TURN_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [sendPulse, wallpaper, turns]);

  useEffect(() => {
    if (!wallpaper) return;
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.WALLPAPER_RENDERED, {
      wallpaper_id: wallpaper.id,
      kind: wallpaper.kind,
      has_pattern: !!wallpaper.patternUrl,
    });
  }, [wallpaper]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turns.value * SEND_TURN_DEG}deg` }],
  }));

  if (!wallpaper) return null;

  const veil = Math.min(wallpaper.overlayOpacity ?? DEFAULT_VEIL, MAX_VEIL);
  const veilLayer = (
    <View
      style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(0,0,0,${veil})` }]}
    />
  );

  if (wallpaper.kind === 'image') {
    return (
      <View style={styles.layer} pointerEvents="none">
        <ImageBackground
          source={{ uri: wallpaper.imageUrl }}
          style={StyleSheet.absoluteFillObject}
          imageStyle={{ backgroundColor: wallpaper.tintColor ?? '#000' }}
          resizeMode="repeat"
        >
          {veilLayer}
        </ImageBackground>
      </View>
    );
  }

  // The gradient square is as wide as the screen diagonal so a rotation never
  // uncovers a corner.
  const diagonal = Math.ceil(Math.sqrt(width * width + height * height));
  const colors = gradientStops(wallpaper.gradientColors, wallpaper.tintColor);
  const patternOpacity = wallpaper.patternOpacity ?? DEFAULT_PATTERN_OPACITY;

  return (
    <View style={[styles.layer, { backgroundColor: colors[0] }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.gradientBox,
          {
            width: diagonal,
            height: diagonal,
            left: (width - diagonal) / 2,
            top: (height - diagonal) / 2,
          },
          spin,
        ]}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      {wallpaper.kind === 'pattern' && wallpaper.patternUrl ? (
        <ImageBackground
          source={{ uri: wallpaper.patternUrl }}
          style={[StyleSheet.absoluteFillObject, { opacity: patternOpacity }]}
          resizeMode="repeat"
        />
      ) : null}
      {veilLayer}
    </View>
  );
}

/**
 * expo-linear-gradient needs at least two stops. A single colour repeats
 * and an empty list falls back to the tint (or near black).
 */
export function gradientStops(
  colors: string[],
  tint: string | null
): readonly [string, string, ...string[]] {
  const clean = colors.filter((c) => /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c.trim()));
  if (clean.length >= 2)
    return clean as unknown as readonly [string, string, ...string[]];
  const base = clean[0] ?? tint ?? '#0B0B0F';
  return [base, base];
}

export const ChatWallpaperLayer = memo(ChatWallpaperLayerInner);

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  gradientBox: { position: 'absolute' },
});

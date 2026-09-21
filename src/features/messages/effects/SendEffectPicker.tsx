import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { ArrowUp, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { BubbleEffect } from './BubbleEffect';
import { ScreenEffectOverlay } from './ScreenEffects';
import {
  BUBBLE_EFFECTS,
  SCREEN_EFFECTS,
  type BubbleEffectName,
  type MessageEffect,
  type ScreenEffectName,
} from './effectCatalog';

interface SendEffectPickerProps {
  /** The text about to be sent; null closes the picker. */
  text: string | null;
  onCancel: () => void;
  onSend: (text: string, effect: MessageEffect) => void;
}

type Tab = 'bubble' | 'screen';

/**
 * "Send with effect", laid out the way iMessage lays it out (measured on
 * iOS 26 at 430 by 932 points): the title on top, a segmented control under
 * it, and on the right a column of effect names beside a dark capsule of
 * dots. Picking one docks the message bubble into that row, turns its dot
 * into the send button and plays the effect for real. The Screen tab is a
 * full screen pager, one effect per page, with page dots at the bottom.
 *
 * Apple paints all of it blue; ours is white and gold, nothing else changes.
 */
export function SendEffectPicker({ text, onCancel, onSend }: SendEffectPickerProps) {
  const { t } = useTranslation('messages');
  const { width } = useWindowDimensions();
  const effectLabel = (name: string) =>
    (t as (key: string) => string)(`effects.names.${name}`);
  const [tab, setTab] = useState<Tab>('bubble');
  const [bubblePick, setBubblePick] = useState<BubbleEffectName | null>(null);
  const [screenIndex, setScreenIndex] = useState(0);
  // A new key restarts the animation every time the choice changes.
  const [playKey, setPlayKey] = useState(0);
  // The picker opens on a long press, so the finger that opened it is still
  // down. Only a touch that BEGINS on the backdrop dismisses it.
  const backdropTouchStarted = useRef(false);

  useEffect(() => {
    if (text === null) return;
    backdropTouchStarted.current = false;
    setTab('bubble');
    setBubblePick(null);
    setScreenIndex(0);
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_PICKER_OPENED, {
      length: text.length,
    });
  }, [text]);

  const pickBubble = useCallback((name: BubbleEffectName) => {
    void haptic('selection');
    setBubblePick(name);
    setPlayKey((k) => k + 1);
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_PREVIEWED, {
      kind: 'bubble',
      name,
    });
  }, []);

  const onScreenPage = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      if (index === screenIndex) return;
      void haptic('selection');
      setScreenIndex(index);
      setPlayKey((k) => k + 1);
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_PREVIEWED, {
        kind: 'screen',
        name: SCREEN_EFFECTS[index],
      });
    },
    [screenIndex, width]
  );

  const send = useCallback(
    (effect: MessageEffect) => {
      if (text === null) return;
      void haptic('light');
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_SENT, {
        kind: effect.kind,
        name: effect.name,
        length: text.length,
      });
      onSend(text, effect);
    },
    [onSend, text]
  );

  if (text === null) return null;
  const screenName = SCREEN_EFFECTS[screenIndex] as ScreenEffectName;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.scrim]} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={() => {
            backdropTouchStarted.current = true;
          }}
          onPress={() => {
            if (!backdropTouchStarted.current) return;
            backdropTouchStarted.current = false;
            onCancel();
          }}
          accessibilityLabel={t('effects.close')}
        />

        {/* Screen tab: one page per effect, the current one playing live. */}
        {tab === 'screen' ? (
          <>
            <ScreenEffectOverlay
              key={playKey}
              effect={{ name: screenName, messageId: `preview-${playKey}`, text }}
              onDone={() => {}}
            />
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={StyleSheet.absoluteFill}
              onMomentumScrollEnd={onScreenPage}
            >
              {SCREEN_EFFECTS.map((name) => (
                <View key={name} style={{ width }} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.header}
          pointerEvents="box-none"
        >
          <Text style={styles.title}>{t('effects.title')}</Text>
          <View style={styles.segmented}>
            <Segment
              label={t('effects.bubbleTab')}
              active={tab === 'bubble'}
              onPress={() => {
                void haptic('selection');
                setTab('bubble');
                setPlayKey((k) => k + 1);
              }}
            />
            <Segment
              label={t('effects.screenTab')}
              active={tab === 'screen'}
              onPress={() => {
                void haptic('selection');
                setTab('screen');
                setScreenIndex(0);
                setPlayKey((k) => k + 1);
              }}
            />
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.duration(220)}
          style={styles.bottom}
          pointerEvents="box-none"
        >
          {tab === 'bubble' ? (
            <View style={styles.rows} pointerEvents="box-none">
              {/* The dark capsule the dots live in, behind the column. */}
              <View style={styles.capsule} pointerEvents="none" />
              {BUBBLE_EFFECTS.map((name) => {
                const selected = bubblePick === name;
                return (
                  <View key={name} style={styles.row} pointerEvents="box-none">
                    {selected ? (
                      <BubbleEffect
                        key={playKey}
                        name={name}
                        messageId={`preview-${playKey}`}
                        play
                      >
                        <PreviewBubble text={text} />
                      </BubbleEffect>
                    ) : null}
                    <Pressable
                      onPress={() => pickBubble(name)}
                      style={styles.rowLabelArea}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={effectLabel(name)}
                    >
                      <Text
                        style={[styles.rowLabel, selected && styles.rowLabelActive]}
                        numberOfLines={1}
                      >
                        {selected
                          ? t('effects.sendWith', { name: effectLabel(name) })
                          : effectLabel(name)}
                      </Text>
                    </Pressable>
                    {selected ? (
                      <Pressable
                        onPress={() => send({ kind: 'bubble', name })}
                        style={({ pressed }) => [
                          styles.sendDot,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={t('effects.sendWith', {
                          name: effectLabel(name),
                        })}
                      >
                        <ArrowUp size={20} color={COLORS.black} strokeWidth={2.75} />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => pickBubble(name)}
                        style={styles.dotSlot}
                        accessibilityRole="button"
                        accessibilityLabel={effectLabel(name)}
                      >
                        <View style={styles.dot} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {/* Nothing picked yet: the bubble waits where it will land. */}
              {bubblePick === null ? (
                <View style={styles.row} pointerEvents="none">
                  <PreviewBubble text={text} />
                  <View style={styles.dotSlot} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.screenControls} pointerEvents="box-none">
              <View style={styles.screenLabelRow} pointerEvents="box-none">
                <Text style={[styles.rowLabel, styles.rowLabelActive]} numberOfLines={1}>
                  {t('effects.sendWith', { name: effectLabel(screenName) })}
                </Text>
                <Pressable
                  onPress={() => send({ kind: 'screen', name: screenName })}
                  style={({ pressed }) => [styles.sendDot, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t('effects.sendWith', {
                    name: effectLabel(screenName),
                  })}
                >
                  <ArrowUp size={20} color={COLORS.black} strokeWidth={2.75} />
                </Pressable>
              </View>
              <View style={styles.pageDots} pointerEvents="none">
                {SCREEN_EFFECTS.map((name, i) => (
                  <View
                    key={name}
                    style={[styles.pageDot, i === screenIndex && styles.pageDotActive]}
                  />
                ))}
              </View>
            </View>
          )}

          <Pressable
            onPress={onCancel}
            style={styles.cancel}
            accessibilityRole="button"
            accessibilityLabel={t('effects.close')}
          >
            <X size={18} color={COLORS.white} strokeWidth={3} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The message exactly as it will land: our own bubble, white. */
function PreviewBubble({ text }: { text: string }) {
  return (
    <View style={styles.bubble}>
      <Text style={styles.bubbleText} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
}

const ROW_HEIGHT = 57;
const DOT_SLOT = 44;

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Apple dims the chat almost to black behind the picker.
  scrim: { backgroundColor: 'rgba(0,0,0,0.88)' },
  header: { position: 'absolute', top: 76, left: 0, right: 0, alignItems: 'center' },
  title: {
    color: COLORS.white,
    fontSize: 22,
    fontFamily: 'Archivo_500Medium',
    marginBottom: 14,
  },
  // Apple's segmented control: one dark capsule, the active half lighter.
  segmented: {
    flexDirection: 'row',
    width: 240,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(58,58,60,0.9)',
    overflow: 'hidden',
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: 'rgba(120,120,128,0.55)', borderRadius: 16 },
  segmentText: { color: '#D8D8DC', fontSize: 13, fontFamily: 'Archivo_600SemiBold' },
  segmentTextActive: { color: COLORS.white },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 34 },
  rows: { alignItems: 'flex-end', paddingRight: 14 },
  capsule: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    width: DOT_SLOT,
    borderRadius: DOT_SLOT / 2,
    backgroundColor: 'rgba(58,58,60,0.85)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: ROW_HEIGHT,
  },
  rowLabelArea: { justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 8 },
  rowLabel: {
    color: '#8E8E93',
    fontSize: 13,
    letterSpacing: 0.6,
    fontFamily: 'Archivo_700Bold',
    textAlign: 'right',
  },
  rowLabelActive: { color: COLORS.white },
  dotSlot: { width: DOT_SLOT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8E8E93' },
  sendDot: {
    width: 39,
    height: 39,
    borderRadius: 20,
    marginHorizontal: (DOT_SLOT - 39) / 2,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  bubble: {
    maxWidth: 240,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginRight: 6,
  },
  bubbleText: { color: COLORS.black, fontSize: 16, fontFamily: 'Archivo_400Regular' },
  screenControls: { alignItems: 'flex-end', paddingRight: 14 },
  screenLabelRow: { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT },
  pageDots: { flexDirection: 'row', gap: 7, alignSelf: 'center', paddingVertical: 10 },
  pageDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#5A5A5E' },
  pageDotActive: { backgroundColor: COLORS.white },
  cancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(118,118,128,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginRight: 18,
    marginTop: 10,
  },
});

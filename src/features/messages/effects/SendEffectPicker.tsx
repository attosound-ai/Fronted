import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { SendHorizontal, X } from 'lucide-react-native';
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
 * iMessage's "send with effect" screen: hold the send button, pick Bubble or
 * Screen, tap a name to preview it on your own message, tap the arrow to
 * send it. The preview is the real animation, not a picture of it.
 */
export function SendEffectPicker({ text, onCancel, onSend }: SendEffectPickerProps) {
  const { t } = useTranslation('messages');
  // The effect names are built from the catalog, so the key is dynamic.
  const effectLabel = (name: string) =>
    (t as (key: string) => string)(`effects.names.${name}`);
  const [tab, setTab] = useState<Tab>('bubble');
  const [preview, setPreview] = useState<MessageEffect | null>(null);
  // A new key restarts the preview animation on every tap.
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (text === null) return;
    setTab('bubble');
    setPreview(null);
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_PICKER_OPENED, {
      length: text.length,
    });
  }, [text]);

  const previewEffect = useCallback((effect: MessageEffect) => {
    void haptic('selection');
    setPreview(effect);
    setPreviewKey((k) => k + 1);
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_PREVIEWED, {
      kind: effect.kind,
      name: effect.name,
    });
  }, []);

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
  const names: readonly string[] = tab === 'bubble' ? BUBBLE_EFFECTS : SCREEN_EFFECTS;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityLabel={t('effects.close')}
        />

        {preview?.kind === 'screen' ? (
          <ScreenEffectOverlay
            key={previewKey}
            effect={{
              name: preview.name as ScreenEffectName,
              messageId: `preview-${previewKey}`,
              text,
            }}
            onDone={() => {}}
          />
        ) : null}

        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.header}
        >
          <Pressable
            onPress={onCancel}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel={t('effects.close')}
          >
            <X size={20} color={COLORS.white} strokeWidth={2.25} />
          </Pressable>
          <Text style={styles.title}>{t('effects.title')}</Text>
          <View style={styles.close} />
        </Animated.View>

        {/* The message as it will land, playing whichever bubble effect is picked. */}
        <View style={styles.previewArea} pointerEvents="none">
          {preview?.kind === 'bubble' ? (
            <BubbleEffect
              key={previewKey}
              name={preview.name as BubbleEffectName}
              messageId={`preview-${previewKey}`}
              play
            >
              <PreviewBubble text={text} />
            </BubbleEffect>
          ) : (
            <PreviewBubble text={text} />
          )}
        </View>

        <Animated.View entering={FadeInDown.duration(220)} style={styles.sheet}>
          <View style={styles.tabs}>
            <TabButton
              label={t('effects.bubbleTab')}
              active={tab === 'bubble'}
              onPress={() => setTab('bubble')}
            />
            <TabButton
              label={t('effects.screenTab')}
              active={tab === 'screen'}
              onPress={() => setTab('screen')}
            />
          </View>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {names.map((name) => {
              const effect = { kind: tab, name } as MessageEffect;
              const selected = preview?.kind === tab && preview.name === name;
              return (
                <Pressable
                  key={name}
                  onPress={() => previewEffect(effect)}
                  style={({ pressed }) => [
                    styles.row,
                    (pressed || selected) && styles.rowActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={effectLabel(name)}
                >
                  <Text style={[styles.rowLabel, selected && styles.rowLabelActive]}>
                    {effectLabel(name)}
                  </Text>
                  <Pressable
                    onPress={() => send(effect)}
                    hitSlop={10}
                    style={styles.sendButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.sendAccessibilityLabel')}
                  >
                    <SendHorizontal size={16} color={COLORS.black} strokeWidth={2.5} />
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function TabButton({
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
      style={[styles.tab, active && styles.tabActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PreviewBubble({ text }: { text: string }) {
  return (
    <View style={styles.bubble}>
      <Text style={styles.bubbleText} numberOfLines={4}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  header: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { color: COLORS.white, fontSize: 16, fontFamily: 'Archivo_600SemiBold' },
  previewArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  bubble: {
    maxWidth: '80%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: { color: COLORS.black, fontSize: 16, fontFamily: 'Archivo_400Regular' },
  sheet: {
    maxHeight: '52%',
    backgroundColor: 'rgba(22,22,24,0.94)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 26,
  },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#333',
  },
  tabActive: { backgroundColor: COLORS.white, borderColor: COLORS.white },
  tabText: { color: '#BBB', fontSize: 13, fontFamily: 'Archivo_600SemiBold' },
  tabTextActive: { color: COLORS.black },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 12, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
  },
  rowActive: { backgroundColor: 'rgba(255,255,255,0.10)' },
  rowLabel: { color: COLORS.white, fontSize: 17, fontFamily: 'Archivo_500Medium' },
  rowLabelActive: { fontFamily: 'Archivo_600SemiBold' },
  sendButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

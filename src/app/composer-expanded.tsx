import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Redo2, SendHorizontal, Undo2, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { GlassSurface } from '@/components/navigation/GlassSurface';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useComposerExpandStore } from '@/features/messages/stores/composerExpandStore';

/** Snapshots are taken after this pause in typing (one undo step per burst). */
const HISTORY_DEBOUNCE_MS = 500;
const HISTORY_LIMIT = 100;

/**
 * Telegram's expanded composer: the text takes the whole screen, close at the
 * top left, undo and redo in a pill at the top right, send at the bottom
 * right. Opened from the composer's expand button; the result goes back
 * through `composerExpandStore`.
 */
export default function ComposerExpandedScreen() {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const initial = useComposerExpandStore((s) => s.text);
  const conversationId = useComposerExpandStore((s) => s.conversationId);
  const finish = useComposerExpandStore((s) => s.finish);

  const textRef = useRef(initial);
  const inputRef = useRef<TextInput>(null);
  // Replacing the field's text deterministically on the New Architecture
  // means remounting it with a new defaultValue (see ChatComposer).
  const [generation, setGeneration] = useState(0);
  const [hasText, setHasText] = useState(initial.trim().length > 0);
  const history = useRef<string[]>([initial]);
  const cursor = useRef(0);
  const [undoable, setUndoable] = useState(false);
  const [redoable, setRedoable] = useState(false);
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoCount = useRef(0);
  const redoCount = useRef(0);

  useEffect(() => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.COMPOSER_EXPANDED, {
      conversation_id: conversationId,
      length: initial.length,
    });
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistoryFlags = useCallback(() => {
    setUndoable(cursor.current > 0);
    setRedoable(cursor.current < history.current.length - 1);
  }, []);

  const snapshot = useCallback(() => {
    const current = textRef.current;
    if (history.current[cursor.current] === current) return;
    history.current = history.current.slice(0, cursor.current + 1);
    history.current.push(current);
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
    cursor.current = history.current.length - 1;
    refreshHistoryFlags();
  }, [refreshHistoryFlags]);

  const handleChangeText = useCallback(
    (value: string) => {
      textRef.current = value;
      const next = value.trim().length > 0;
      setHasText((prev) => (prev === next ? prev : next));
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
      snapshotTimer.current = setTimeout(snapshot, HISTORY_DEBOUNCE_MS);
    },
    [snapshot]
  );

  const restore = useCallback(
    (index: number) => {
      cursor.current = index;
      textRef.current = history.current[index];
      setHasText(textRef.current.trim().length > 0);
      setGeneration((g) => g + 1);
      refreshHistoryFlags();
      haptic('selection');
    },
    [refreshHistoryFlags]
  );

  const undo = useCallback(() => {
    if (snapshotTimer.current) {
      clearTimeout(snapshotTimer.current);
      snapshot();
    }
    if (cursor.current === 0) return;
    undoCount.current += 1;
    restore(cursor.current - 1);
  }, [restore, snapshot]);

  const redo = useCallback(() => {
    if (cursor.current >= history.current.length - 1) return;
    redoCount.current += 1;
    restore(cursor.current + 1);
  }, [restore]);

  const close = useCallback(
    (action: 'close' | 'send') => {
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
      const text = textRef.current;
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.COMPOSER_EXPANDED_CLOSED, {
        conversation_id: conversationId,
        action,
        length: text.trim().length,
        undo_count: undoCount.current,
        redo_count: redoCount.current,
      });
      finish(action, text);
      router.back();
    },
    [conversationId, finish]
  );

  const handleSend = useCallback(() => {
    if (!textRef.current.trim()) return;
    haptic('light');
    close('send');
  }, [close]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <GlassSurface radius={22} style={styles.glassButton}>
          <Pressable
            onPress={() => close('close')}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={t('composer.collapse')}
          >
            <X size={22} color={COLORS.white} strokeWidth={2.25} />
          </Pressable>
        </GlassSurface>
        <GlassSurface radius={22} style={styles.historyPill}>
          <View style={styles.historyRow}>
            <Pressable
              onPress={undo}
              disabled={!undoable}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={t('composer.undo')}
              accessibilityState={{ disabled: !undoable }}
            >
              <Undo2
                size={20}
                color={undoable ? COLORS.white : '#666'}
                strokeWidth={2.25}
              />
            </Pressable>
            <Pressable
              onPress={redo}
              disabled={!redoable}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={t('composer.redo')}
              accessibilityState={{ disabled: !redoable }}
            >
              <Redo2
                size={20}
                color={redoable ? COLORS.white : '#666'}
                strokeWidth={2.25}
              />
            </Pressable>
          </View>
        </GlassSurface>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <TextInput
          key={generation}
          ref={inputRef}
          defaultValue={textRef.current}
          onChangeText={handleChangeText}
          multiline
          style={styles.input}
          keyboardAppearance="dark"
          autoCapitalize="sentences"
          placeholder={t('chat.inputPlaceholder')}
          placeholderTextColor={COLORS.gray[500]}
          maxFontSizeMultiplier={1.2}
          accessibilityLabel={t('chat.inputAccessibilityLabel')}
        />
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.footerSpacer} />
          <Pressable
            onPress={handleSend}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('chat.sendAccessibilityLabel')}
            accessibilityState={{ disabled: !hasText }}
            style={({ pressed }) => [
              styles.sendButton,
              !hasText && styles.sendButtonIdle,
              pressed && hasText && styles.sendButtonPressed,
            ]}
          >
            <SendHorizontal
              size={20}
              color={hasText ? '#000' : '#888'}
              strokeWidth={2.5}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#161618' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  glassButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  historyPill: { height: 44, borderRadius: 22, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  input: {
    flex: 1,
    color: COLORS.white,
    fontFamily: 'Archivo_400Regular',
    fontSize: 17,
    lineHeight: 23,
    paddingHorizontal: 16,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  footerSpacer: { flex: 1 },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonIdle: { backgroundColor: '#444' },
  sendButtonPressed: { opacity: 0.7 },
});

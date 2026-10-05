import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Check, X } from 'lucide-react-native';

import { haptic } from '@/lib/haptics/hapticService';
import { editToSave } from './editRules';
import { flushEditTiming, markEdit } from './editTiming';
import { morphStart, type Box } from './editMorph';

interface Props {
  initialText: string;
  labels: { cancel: string; save: string; field: string };
  /** Where the bubble was on screen when Edit was tapped; the field grows out of it. */
  from?: Box | null;
  /** The bubble's colour, which the field starts in and lets go of. */
  tint: string;
  /** Called with the trimmed new text; unchanged or empty text cancels instead. */
  onSave: (text: string) => void;
  onCancel: () => void;
}

const BUTTON = 40;
const GAP = 8;
// iMessage, recorded at 60 fps on the same phone (Oct 5 2026): the bubble is
// the field 270 ms after the tap on Edit and nothing moves after 500 ms.
const MORPH_MS = 260;
const EASE = Easing.out(Easing.cubic);

/**
 * Editing a message the way iMessage does it, measured on the real app
 * (iOS 26, Oct 5 2026): nothing is blurred and nothing floats. The bubble
 * itself stretches to the left into a full width dark field while a round X
 * (cancel) and a round check (save) come in at its sides, the field grows
 * upward with the text and the rest of the thread dims.
 *
 * The stretch runs on the UI thread from the bubble's measured place, so it
 * starts on the first frame and never waits for JS.
 *
 * Uncontrolled field (defaultValue + ref): a controlled TextInput crashed iOS
 * with dictation (see the composer).
 */
export function EditRow({ initialText, labels, from, tint, onSave, onCancel }: Props) {
  const draft = useRef(initialText);
  const [canSave, setCanSave] = useState(false);
  const fieldRef = useRef<View>(null);
  // 0 = still the bubble, 1 = the field.
  const p = useSharedValue(from ? 0 : 1);
  const startLeft = useSharedValue(0);
  const startDy = useSharedValue(0);

  useLayoutEffect(() => {
    markEdit('mounted');
    const go = () => {
      p.value = withTiming(1, { duration: MORPH_MS, easing: EASE });
    };
    if (!from) {
      go();
      return;
    }
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      const start = morphStart(from, { x, y, width, height });
      startLeft.value = start.left;
      startDy.value = start.dy;
      go();
    });
    // Runs once: the row is keyed by the message it edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void haptic('light');
    const will = Keyboard.addListener('keyboardWillShow', () =>
      markEdit('keyboard_will_show')
    );
    const did = Keyboard.addListener('keyboardDidShow', () => markEdit('keyboard_shown'));
    return () => {
      will.remove();
      did.remove();
      flushEditTiming();
    };
  }, []);

  const save = () => {
    const next = editToSave(initialText, draft.current);
    if (next == null) {
      onCancel();
      return;
    }
    void haptic('light');
    onSave(next);
  };

  const shape = useAnimatedStyle(() => ({
    left: (1 - p.value) * startLeft.value,
    transform: [{ translateY: (1 - p.value) * startDy.value }],
  }));
  const bubbleColour = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  const text = useAnimatedStyle(() => ({
    transform: [
      { translateX: (1 - p.value) * startLeft.value },
      { translateY: (1 - p.value) * startDy.value },
    ],
  }));
  const sides = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.6 + 0.4 * p.value }],
  }));

  return (
    <View style={styles.row}>
      <Animated.View style={sides}>
        <Pressable
          onPress={onCancel}
          hitSlop={8}
          style={styles.cancel}
          accessibilityRole="button"
          accessibilityLabel={labels.cancel}
        >
          <X size={18} color="#FFFFFF" strokeWidth={2.75} />
        </Pressable>
      </Animated.View>
      <View style={styles.field} ref={fieldRef} collapsable={false}>
        <Animated.View style={[styles.shape, shape]} pointerEvents="none">
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: tint }, bubbleColour]}
          />
        </Animated.View>
        <Animated.View style={text}>
          <TextInput
            autoFocus
            multiline
            defaultValue={initialText}
            onFocus={() => markEdit('focused')}
            onChangeText={(value) => {
              draft.current = value;
              setCanSave(editToSave(initialText, value) != null);
            }}
            style={styles.input}
            selectionColor="#FFFFFF"
            keyboardAppearance="dark"
            maxLength={4000}
            accessibilityLabel={labels.field}
          />
        </Animated.View>
      </View>
      <Animated.View style={sides}>
        <Pressable
          onPress={save}
          hitSlop={8}
          style={[styles.save, !canSave && styles.saveIdle]}
          accessibilityRole="button"
          accessibilityLabel={labels.save}
          accessibilityState={{ disabled: !canSave }}
        >
          <Check size={20} color="#000000" strokeWidth={3} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  cancel: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: 'rgba(118,118,128,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    minHeight: BUTTON,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 9 : 4,
    justifyContent: 'center',
  },
  // The field's body is its own layer so it can start as narrow as the bubble
  // and stretch left without squeezing the text.
  shape: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: '#1C1C1E',
    overflow: 'hidden',
  },
  input: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    padding: 0,
    maxHeight: 220,
  },
  save: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveIdle: { opacity: 0.5 },
});

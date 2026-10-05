import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Check, X } from 'lucide-react-native';

import { haptic } from '@/lib/haptics/hapticService';
import { editToSave } from './editRules';

interface Props {
  initialText: string;
  /** Width the bubble had, so the field grows out of it instead of popping in. */
  bubbleWidth: number | null;
  labels: { cancel: string; save: string; field: string };
  /** Called with the trimmed new text; unchanged or empty text cancels instead. */
  onSave: (text: string) => void;
  onCancel: () => void;
}

const BUTTON = 40;
const GAP = 8;

/**
 * Editing a message the way iMessage does it, measured on the real app
 * (iOS 26, Oct 5 2026): nothing is blurred and nothing floats. The message's
 * own row turns into [cancel] [field] [save]: the bubble stretches left into a
 * full width dark field, a round X on the left cancels, a round check on the
 * right saves, the field grows upward with the text and the thread keeps the
 * row right above the composer while everything else dims.
 *
 * Uncontrolled field (defaultValue + ref): a controlled TextInput crashed iOS
 * with dictation (see the composer).
 */
export function EditRow({ initialText, bubbleWidth, labels, onSave, onCancel }: Props) {
  const draft = useRef(initialText);
  const [canSave, setCanSave] = useState(false);
  // 0 = the bubble's own width hugging the right edge, 1 = the full field.
  const grow = useSharedValue(0);

  useEffect(() => {
    void haptic('light');
    grow.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [grow]);

  const fieldStyle = useAnimatedStyle(() => {
    const start = bubbleWidth ? Math.max(0, 1 - grow.value) : 0;
    return { marginLeft: start * 140 };
  });
  const buttonStyle = useAnimatedStyle(() => ({ opacity: grow.value }));

  const save = () => {
    const next = editToSave(initialText, draft.current);
    if (next == null) {
      onCancel();
      return;
    }
    void haptic('light');
    onSave(next);
  };

  return (
    <Animated.View entering={FadeIn.duration(120)} style={styles.row}>
      <Animated.View style={buttonStyle}>
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
      <Animated.View style={[styles.field, fieldStyle]}>
        <TextInput
          autoFocus
          multiline
          defaultValue={initialText}
          onChangeText={(text) => {
            draft.current = text;
            setCanSave(editToSave(initialText, text) != null);
          }}
          style={styles.input}
          selectionColor="#FFFFFF"
          keyboardAppearance="dark"
          maxLength={4000}
          accessibilityLabel={labels.field}
        />
      </Animated.View>
      <Animated.View style={buttonStyle}>
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
    </Animated.View>
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
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 9 : 4,
    justifyContent: 'center',
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

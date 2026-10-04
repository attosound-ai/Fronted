import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { haptic } from '@/lib/haptics/hapticService';
import type { Anchor } from './TapbackOverlay';
import { editToSave } from './editRules';

interface Props {
  /** Where the bubble sits on screen; null hides the overlay. */
  anchor: Anchor | null;
  initialText: string;
  /** Called with the trimmed new text; never called when unchanged or empty. */
  onSave: (text: string) => void;
  onCancel: () => void;
}

const CHECK_SIZE = 32;
const SIDE = 12;
const GAP = 8;
const FIELD_MIN_HEIGHT = 40;

/**
 * Edit the iMessage way: the thread blurs, the bubble you are editing turns
 * into a text field right where it was (lifted above the keyboard when the
 * keyboard would cover it), a round check saves, and a tap anywhere else
 * cancels. Uncontrolled field (defaultValue + ref): a controlled TextInput
 * crashed iOS with dictation (see the composer).
 */
export function EditInPlaceOverlay({ anchor, initialText, onSave, onCancel }: Props) {
  const { t } = useTranslation('messages');
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const draft = useRef(initialText);
  const [canSave, setCanSave] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  const [fieldHeight, setFieldHeight] = useState(FIELD_MIN_HEIGHT);

  useEffect(() => {
    if (!anchor) return;
    draft.current = initialText;
    setCanSave(false);
    void haptic('light');
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboard(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboard(0)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [anchor, initialText]);

  if (!anchor) return null;

  // Stay where the bubble was; rise just enough to clear the keyboard.
  const lowest = height - keyboard - fieldHeight - SIDE;
  const top = Math.max(insets.top + 56, Math.min(anchor.y, lowest));
  const fieldMax = width - SIDE * 2 - CHECK_SIZE - GAP - 40;
  const fieldMin = Math.min(fieldMax, Math.max(anchor.width, 140));

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
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={StyleSheet.absoluteFill}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('edit.cancelA11y', { defaultValue: 'Cancel editing' })}
        >
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.dim]} />
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={ZoomIn.duration(180).springify().damping(18)}
        style={[styles.row, { top, right: SIDE }]}
      >
        <View style={[styles.field, { minWidth: fieldMin, maxWidth: fieldMax }]}>
          <TextInput
            autoFocus
            multiline
            defaultValue={initialText}
            onChangeText={(text) => {
              draft.current = text;
              setCanSave(editToSave(initialText, text) != null);
            }}
            onContentSizeChange={(e) =>
              setFieldHeight(Math.max(FIELD_MIN_HEIGHT, e.nativeEvent.contentSize.height + 16))
            }
            style={styles.input}
            selectionColor="#FFFFFF"
            keyboardAppearance="dark"
            maxLength={4000}
            accessibilityLabel={t('edit.fieldA11y', { defaultValue: 'Edit message' })}
          />
        </View>
        <Pressable
          onPress={save}
          hitSlop={10}
          style={[styles.check, !canSave && styles.checkIdle]}
          accessibilityRole="button"
          accessibilityLabel={t('edit.saveA11y', { defaultValue: 'Save edit' })}
          accessibilityState={{ disabled: !canSave }}
        >
          <Check size={18} color="#000000" strokeWidth={3} />
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  row: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: GAP,
  },
  field: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(28,28,30,0.96)',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 9 : 4,
    minHeight: FIELD_MIN_HEIGHT,
    justifyContent: 'center',
  },
  input: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 22,
    padding: 0,
    maxHeight: 180,
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: (FIELD_MIN_HEIGHT - CHECK_SIZE) / 2,
  },
  checkIdle: { opacity: 0.45 },
});

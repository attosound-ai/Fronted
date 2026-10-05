import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, X } from 'lucide-react-native';

import { haptic } from '@/lib/haptics/hapticService';
import { editToSave } from './editRules';

interface Props {
  initialText: string;
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
export function EditRow({ initialText, labels, onSave, onCancel }: Props) {
  const draft = useRef(initialText);
  const [canSave, setCanSave] = useState(false);

  useEffect(() => {
    void haptic('light');
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

  // No entrance animation of its own: the field is there the moment Edit is
  // tapped and the keyboard's own rise is the transition (iMessage does not
  // wait either). Any fade here only adds to the time before one can type.
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onCancel}
        hitSlop={8}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityLabel={labels.cancel}
      >
        <X size={18} color="#FFFFFF" strokeWidth={2.75} />
      </Pressable>
      <View style={styles.field}>
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
      </View>
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

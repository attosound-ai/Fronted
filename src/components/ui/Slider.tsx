import { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import NativeSlider from '@react-native-community/slider';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

interface SliderProps {
  /** Current value, 0..1. */
  value: number;
  onChange: (value: number) => void;
  minimumTrackColor?: string;
  thumbColor?: string;
  disabled?: boolean;
}

/**
 * Horizontal slider (0..1) backed by each OS's native control (UISlider on
 * iOS, SeekBar on Android) through @react-native-community/slider.
 *
 * It replaced a JS PanResponder track: inside a BottomSheet the sheet's
 * native pan gesture (react-native-gesture-handler) took over the touch on the
 * first few pixels of movement, so the old track only ever saw the initial
 * touch down. Sliding did nothing, tapping set the value (Sep 12 2026 report).
 * The native control tracks the drag itself, and it is declared to the
 * gesture system with Gesture.Native so an enclosing GestureDetector treats it
 * as a real native gesture participant instead of cancelling it.
 */
export function Slider({
  value,
  onChange,
  minimumTrackColor = '#3B82F6',
  thumbColor = '#FFFFFF',
  disabled = false,
}: SliderProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const handleChange = useCallback(
    (next: number) => {
      if (disabled) return;
      onChange(Math.max(0, Math.min(1, next)));
    },
    [disabled, onChange]
  );

  return (
    <GestureDetector gesture={Gesture.Native()}>
      <View style={[styles.container, disabled && styles.disabled]}>
        <NativeSlider
          style={styles.slider}
          value={clamped}
          minimumValue={0}
          maximumValue={1}
          step={0}
          disabled={disabled}
          onValueChange={handleChange}
          minimumTrackTintColor={minimumTrackColor}
          maximumTrackTintColor="#333333"
          thumbTintColor={thumbColor}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 36,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  slider: {
    width: '100%',
    height: 36,
  },
});

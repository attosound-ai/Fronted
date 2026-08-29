import { useRef, useState } from 'react';
import { View, PanResponder, StyleSheet, type LayoutChangeEvent } from 'react-native';

interface SliderProps {
  /** Current value, 0..1. */
  value: number;
  onChange: (value: number) => void;
  minimumTrackColor?: string;
  thumbColor?: string;
  disabled?: boolean;
}

/**
 * Minimal horizontal slider (0..1), gesture-driven via PanResponder — the app
 * has no @react-native-community/slider, and this keeps the Mixer dependency-free.
 * Inner views are pointerEvents="none" so the container owns every touch and
 * locationX stays relative to the track.
 *
 * `disabled` and `onChange` are read through refs: the PanResponder is created
 * ONCE (useRef), so reading the props directly captured their mount-time values.
 * A slider mounted disabled (every effect row on a dry clip, a mixer channel
 * with record off) then ignored touches forever, even after its row was
 * switched on.
 */
export function Slider({
  value,
  onChange,
  minimumTrackColor = '#3B82F6',
  thumbColor = '#FFFFFF',
  disabled = false,
}: SliderProps) {
  const widthRef = useRef(0);
  const [width, setWidth] = useState(0);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const update = (x: number) => {
    if (widthRef.current <= 0 || disabledRef.current) return;
    onChangeRef.current(Math.max(0, Math.min(1, x / widthRef.current)));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (e) => update(e.nativeEvent.locationX),
      onPanResponderMove: (e) => update(e.nativeEvent.locationX),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setWidth(e.nativeEvent.layout.width);
  };

  const clamped = Math.max(0, Math.min(1, value));
  const thumbX = clamped * width;

  return (
    <View
      style={[styles.container, disabled && styles.disabled]}
      onLayout={onLayout}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={styles.track} />
      <View
        pointerEvents="none"
        style={[styles.fill, { width: thumbX, backgroundColor: minimumTrackColor }]}
      />
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: thumbX - 9, backgroundColor: thumbColor }]}
      />
    </View>
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
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333333',
  },
  fill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    left: 0,
  },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
});

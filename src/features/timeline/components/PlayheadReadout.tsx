import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { formatTimelineMs } from '../utils/timelineCalculations';

// The standard Reanimated pattern for text that changes every frame: an
// uneditable TextInput whose `text` prop is driven by an animated worklet, so
// the readout updates on the UI thread without re-rendering React.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
Animated.addWhitelistedNativeProps({ text: true });

interface PlayheadReadoutProps {
  positionSv: SharedValue<number>;
  totalDurationMs: number;
  style?: StyleProp<TextStyle>;
}

/**
 * "00:12 / 01:30" playhead readout that tracks the UI-thread playhead position
 * at 60fps. Before, it read `state.playbackPositionMs` so it re-rendered (with
 * the whole editor) every frame during playback.
 */
export function PlayheadReadout({
  positionSv,
  totalDurationMs,
  style,
}: PlayheadReadoutProps) {
  const total = formatTimelineMs(totalDurationMs);
  const animatedProps = useAnimatedProps(() => {
    const ms = positionSv.value;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const ss = seconds < 10 ? `0${seconds}` : `${seconds}`;
    // `text` is a whitelisted native prop of TextInput (see addWhitelistedNativeProps
    // above); Reanimated's prop typing doesn't know it, hence the cast.
    return { text: `${mm}:${ss} / ${total}` } as unknown as Record<string, unknown>;
  }, [total]);

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      style={[styles.base, style]}
      animatedProps={animatedProps}
      defaultValue={`${formatTimelineMs(positionSv.value)} / ${total}`}
      maxFontSizeMultiplier={1.2}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 0,
    margin: 0,
    // TextInput adds its own vertical chrome; collapse it so it lines up with
    // the neighbouring caption Text.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});

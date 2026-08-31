import {
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Radio, Square } from 'lucide-react-native';
import { useCallAudioInjection } from '@/hooks/useCallAudioInjection';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import type { InjectSource } from '@/lib/callAudio/AudioInjector';

interface InjectIntoCallButtonProps {
  /** The track to push into the call (the post/reel currently in view, or a beat). */
  source: InjectSource;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * InjectIntoCallButton — drop-in control that plays `source` INTO the live call
 * (remote hears it + rep monitors it). Presentation only: it owns no engine
 * logic, just calls the hook. It renders NOTHING unless a call is connected AND
 * the feature flag is on (`canInject`), so it ships dark in Phase 0 and lights
 * up per-surface once the native engine + flag land.
 *
 * Toggles: tap to start injecting this track; tap again (while this exact track
 * is playing) to stop.
 */
export function InjectIntoCallButton({
  source,
  size = 22,
  style,
}: InjectIntoCallButtonProps) {
  const { canInject, isTrackInjecting, isPreparing, inject, stop } =
    useCallAudioInjection();

  if (!canInject) return null;

  const active = isTrackInjecting(source.uri);
  // Downloading/decoding: show a REAL spinner. The old rendering flipped the
  // icon to the active square during prepare, which read as "stuck loading"
  // when a slow fetch ran its 12s course (David, Aug 30).
  const preparingThis = active && isPreparing;

  return (
    <TouchableOpacity
      onPress={() => {
        void haptic('selection');
        if (active) void stop('user_stopped');
        else void inject(source);
      }}
      style={[styles.button, active && styles.buttonActive, style]}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Stop playing into call' : 'Play into call'}
      hitSlop={8}
    >
      {preparingThis ? (
        <ActivityIndicator size="small" color="#FFF" />
      ) : active ? (
        <Square size={size} color="#FFF" strokeWidth={2.25} fill="#FFF" />
      ) : (
        <Radio size={size} color={COLORS.primary} strokeWidth={2.25} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  buttonActive: {
    backgroundColor: COLORS.primary,
  },
});

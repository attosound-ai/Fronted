import { Platform, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface TopFadeBlurProps {
  /** Total height of the band, from the top of the screen. */
  height: number;
  intensity?: number;
}

/**
 * Telegram's top band: what scrolls under the floating header is blurred and
 * darkened, strongest at the very top and vanishing a little below the
 * header pills, so a message never fights the title for the eye. The blur is
 * masked by a gradient instead of being cut at a hard line.
 */
export function TopFadeBlur({ height, intensity = 44 }: TopFadeBlurProps) {
  // Android has no real blur here (the BlurView is a faint veil there), so the
  // messages showed plainly behind the header pills and the status bar clock
  // (emulator, Oct 7 2026). The same band, drawn as darkness instead of blur:
  // solid at the top and gone a little below the header.
  if (Platform.OS === 'android') {
    return (
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(0,0,0,0.94)',
          'rgba(0,0,0,0.94)',
          'rgba(0,0,0,0.55)',
          'transparent',
        ]}
        locations={[0, 0.5, 0.78, 1]}
        style={[styles.wrap, { height }]}
      />
    );
  }
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <LinearGradient
            colors={['#000', '#000', 'rgba(0,0,0,0.45)', 'transparent']}
            locations={[0, 0.5, 0.78, 1]}
            style={StyleSheet.absoluteFill}
          />
        }
      >
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5 },
});

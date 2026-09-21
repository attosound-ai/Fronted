import { StyleSheet, View } from 'react-native';
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

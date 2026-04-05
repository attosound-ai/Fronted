import { View, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Music } from 'lucide-react-native';

type BadgeSize = 'sm' | 'md' | 'lg';

const SIZES: Record<BadgeSize, { box: number; icon: number }> = {
  sm: { box: 16, icon: 8 },
  md: { box: 20, icon: 10 },
  lg: { box: 24, icon: 12 },
};

interface CreatorBadgeProps {
  size?: BadgeSize;
  style?: ViewStyle;
}

// Pre-compute the spiky circle path (8 spikes, smooth proportions)
const SPIKY_PATH = (() => {
  const cx = 12;
  const cy = 12;
  const spikes = 8;
  const outerR = 12;
  const innerR = 10.2;
  const points: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    const radius = i % 2 === 0 ? outerR : innerR;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join('') + 'Z';
})();

export function CreatorBadge({ size = 'md', style }: CreatorBadgeProps) {
  const { box, icon } = SIZES[size];

  return (
    <View style={[styles.container, { width: box, height: box }, style]}>
      <Svg width={box} height={box} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FDE68A" />
            <Stop offset="35%" stopColor="#F59E0B" />
            <Stop offset="65%" stopColor="#D97706" />
            <Stop offset="100%" stopColor="#B45309" />
          </LinearGradient>
        </Defs>
        <Path d={SPIKY_PATH} fill="url(#gold)" />
        <Circle cx={12} cy={12} r={9.5} fill="url(#gold)" />
      </Svg>
      <Music size={icon} color="#FFF" strokeWidth={2.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

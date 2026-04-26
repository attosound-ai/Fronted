import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { COLORS } from '@/constants/theme';

interface RecBadgeProps {
  isRecording: boolean;
  elapsed: number;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function RecBadge({ isRecording, elapsed }: RecBadgeProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isRecording) {
      pulseAnim.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isRecording, pulseAnim]);

  if (!isRecording) return null;

  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
        <Text style={styles.recText}>REC</Text>
      </View>
      <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  recText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: 'Archivo_700Bold',
  },
  timer: {
    color: COLORS.error,
    fontSize: 18,
    fontFamily: 'Archivo_600SemiBold',
  },
});

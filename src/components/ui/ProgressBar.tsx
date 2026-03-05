import { View, StyleSheet } from 'react-native';

interface ProgressBarProps {
  /** Number of total segments */
  steps: number;
  /** Current step (1-based: 1 = first segment filled) */
  currentStep: number;
  /** Color for filled segments */
  color?: string;
  /** Height of each segment */
  height?: number;
  /** Gap between segments */
  gap?: number;
}

export function ProgressBar({
  steps,
  currentStep,
  color = '#FFFFFF',
  height = 4,
  gap = 6,
}: ProgressBarProps) {
  return (
    <View style={[styles.container, { gap }]}>
      {Array.from({ length: steps }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            {
              height,
              backgroundColor: i < currentStep ? color : '#333333',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    width: '100%',
  },
  segment: {
    flex: 1,
    borderRadius: 2,
  },
});

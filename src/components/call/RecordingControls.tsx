import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Circle, Square, Play, Pause, Trash2 } from 'lucide-react-native';
import { COLORS, SPACING } from '@/constants/theme';

interface RecordingControlsProps {
  isRecording: boolean;
  isPlaying: boolean;
  canPlay: boolean;
  canDelete: boolean;
  isProcessing: boolean;
  onRecord: () => void;
  onStop: () => void;
  onPlay: () => void;
  onDelete: () => void;
}

export function RecordingControls({
  isRecording,
  isPlaying,
  canPlay,
  canDelete,
  isProcessing,
  onRecord,
  onStop,
  onPlay,
  onDelete,
}: RecordingControlsProps) {
  return (
    <View style={styles.container}>
      {/* Record */}
      <TouchableOpacity
        style={[styles.button, isRecording && styles.buttonActive]}
        onPress={onRecord}
        disabled={isRecording || isProcessing}
      >
        <View style={[styles.recordDot, isRecording && styles.recordDotActive]} />
      </TouchableOpacity>

      {/* Stop */}
      <TouchableOpacity
        style={styles.button}
        onPress={onStop}
        disabled={!isRecording}
      >
        <Square
          size={24}
          color={isRecording ? COLORS.white : '#555'}
          fill={isRecording ? COLORS.white : '#555'}
          strokeWidth={0}
        />
      </TouchableOpacity>

      {/* Play / Pause */}
      <TouchableOpacity
        style={styles.button}
        onPress={onPlay}
        disabled={!canPlay || isRecording}
      >
        {isPlaying ? (
          <Pause
            size={26}
            color={canPlay && !isRecording ? COLORS.white : '#555'}
            fill={canPlay && !isRecording ? COLORS.white : '#555'}
            strokeWidth={2.25}
          />
        ) : (
          <Play
            size={26}
            color={canPlay && !isRecording ? COLORS.white : '#555'}
            fill={canPlay && !isRecording ? COLORS.white : '#555'}
            strokeWidth={0}
          />
        )}
      </TouchableOpacity>

      {/* Delete */}
      <TouchableOpacity
        style={styles.button}
        onPress={onDelete}
        disabled={!canDelete || isRecording}
      >
        <Trash2
          size={24}
          color={canDelete && !isRecording ? COLORS.white : '#555'}
          strokeWidth={2.25}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  buttonActive: {
    borderColor: COLORS.error,
  },
  recordDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.error,
  },
  recordDotActive: {
    backgroundColor: COLORS.error,
    opacity: 0.5,
  },
});

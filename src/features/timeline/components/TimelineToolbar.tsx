import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';

interface TimelineToolbarProps {
  onSplit: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isRecording?: boolean;
  onRecord?: () => void;
  onStopRecord?: () => void;
  recordingElapsed?: number;
  onImport?: () => void;
  isImporting?: boolean;
  onVolumePress?: () => void;
}

interface ToolButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  variant?: 'default' | 'outlined';
}

function ToolButton({
  icon,
  label,
  onPress,
  disabled,
  color = '#FFF',
  variant = 'default',
}: ToolButtonProps) {
  if (variant === 'outlined') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.outlinedButton, disabled && styles.buttonDisabled]}
      >
        <Ionicons name={icon} size={16} color={disabled ? '#999' : '#000'} />
        <Text
          variant="caption"
          style={[styles.outlinedLabel, disabled && { color: '#999' }]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Ionicons name={icon} size={20} color={disabled ? '#444' : color} />
      <Text variant="caption" style={[styles.label, disabled && styles.labelDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TimelineToolbar({
  onSplit,
  onDelete,
  onUndo,
  onRedo,
  onExport,
  hasSelection,
  canUndo,
  canRedo,
  isRecording,
  onRecord,
  onStopRecord,
  recordingElapsed = 0,
  onImport,
  isImporting = false,
  onVolumePress,
}: TimelineToolbarProps) {
  return (
    <View style={styles.container}>
      {/* Recording button row */}
      {(onRecord || onStopRecord) && (
        <View style={styles.recordRow}>
          {isRecording ? (
            <Pressable style={styles.stopRecordButton} onPress={onStopRecord}>
              <Ionicons name="stop-circle" size={18} color="#FFF" />
              <Text variant="caption" style={styles.stopRecordText}>
                Stop {formatElapsed(recordingElapsed)}
              </Text>
            </Pressable>
          ) : (
            <Pressable style={styles.recordButton} onPress={onRecord}>
              <View style={styles.recordDot} />
              <Text variant="caption" style={styles.recordText}>
                Record
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.row}>
        <ToolButton icon="cut" label="Split" onPress={onSplit} />
        <ToolButton
          icon="trash-outline"
          label="Delete"
          onPress={onDelete}
          disabled={!hasSelection}
          color="#EF4444"
        />
        {onVolumePress && (
          <ToolButton
            icon="volume-medium"
            label="Volume"
            onPress={onVolumePress}
            disabled={!hasSelection}
          />
        )}
        <ToolButton icon="arrow-undo" label="Undo" onPress={onUndo} disabled={!canUndo} />
        <ToolButton icon="arrow-redo" label="Redo" onPress={onRedo} disabled={!canRedo} />
      </View>
      <View style={styles.row}>
        {onImport && (
          <ToolButton
            icon="folder-open-outline"
            label={isImporting ? 'Importing...' : 'Import'}
            onPress={onImport}
            disabled={isImporting}
            variant="outlined"
          />
        )}
        <ToolButton
          icon="download-outline"
          label="Export"
          onPress={onExport}
          variant="outlined"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  recordRow: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    gap: 8,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  stopRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    gap: 8,
  },
  stopRecordText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  button: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    gap: 2,
  },
  outlinedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  outlinedLabel: {
    color: '#000',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  label: {
    color: '#999',
    fontSize: 10,
  },
  labelDisabled: {
    color: '#444',
  },
});

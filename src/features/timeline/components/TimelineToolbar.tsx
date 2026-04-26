import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import {
  Scissors,
  Trash2,
  Volume2,
  Undo2,
  Redo2,
  FolderOpen,
  Download,
  Upload,
  StopCircle,
  Copy,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';

interface TimelineToolbarProps {
  onSplit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
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
  onPublish?: () => void;
  isPublishing?: boolean;
}

interface ToolButtonProps {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  variant?: 'default' | 'outlined';
}

function ToolButton({
  Icon,
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
        <Icon size={16} color={disabled ? '#999' : '#000'} strokeWidth={2.25} />
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
      <Icon size={20} color={disabled ? '#444' : color} strokeWidth={2.25} />
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
  onDuplicate,
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
  onPublish,
  isPublishing = false,
}: TimelineToolbarProps) {
  const { t } = useTranslation('projects');
  return (
    <View style={styles.container}>
      {/* Recording button row */}
      {(onRecord || onStopRecord) && (
        <View style={styles.recordRow}>
          {isRecording ? (
            <Pressable style={styles.stopRecordButton} onPress={onStopRecord}>
              <StopCircle size={18} color="#FFF" strokeWidth={2.25} />
              <Text variant="caption" style={styles.stopRecordText}>
                {t('timeline.toolStopRecording', {
                  elapsed: formatElapsed(recordingElapsed),
                })}
              </Text>
            </Pressable>
          ) : (
            <Pressable style={styles.recordButton} onPress={onRecord}>
              <View style={styles.recordDot} />
              <Text variant="caption" style={styles.recordText}>
                {t('timeline.toolRecord')}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.row}>
        <ToolButton Icon={Scissors} label={t('timeline.toolSplit')} onPress={onSplit} />
        <ToolButton
          Icon={Trash2}
          label={t('timeline.toolDelete')}
          onPress={onDelete}
          disabled={!hasSelection}
          color="#EF4444"
        />
        {onDuplicate && (
          <ToolButton
            Icon={Copy}
            label={t('timeline.toolDuplicate')}
            onPress={onDuplicate}
            disabled={!hasSelection}
          />
        )}
        {onVolumePress && (
          <ToolButton
            Icon={Volume2}
            label={t('timeline.toolVolume')}
            onPress={onVolumePress}
            disabled={!hasSelection}
          />
        )}
        <ToolButton
          Icon={Undo2}
          label={t('timeline.toolUndo')}
          onPress={onUndo}
          disabled={!canUndo}
        />
        <ToolButton
          Icon={Redo2}
          label={t('timeline.toolRedo')}
          onPress={onRedo}
          disabled={!canRedo}
        />
      </View>
      <View style={styles.row}>
        {onImport && (
          <ToolButton
            Icon={FolderOpen}
            label={isImporting ? t('timeline.toolImporting') : t('timeline.toolImport')}
            onPress={onImport}
            disabled={isImporting}
            variant="outlined"
          />
        )}
        <ToolButton
          Icon={Download}
          label={t('timeline.toolExport')}
          onPress={onExport}
          variant="outlined"
        />
        {onPublish && (
          <Pressable
            onPress={onPublish}
            disabled={isPublishing}
            style={[styles.publishButton, isPublishing && styles.buttonDisabled]}
          >
            {isPublishing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Upload size={16} color="#000" strokeWidth={2.25} />
            )}
            <Text style={styles.publishLabel}>
              {isPublishing ? t('timeline.toolPublishing') : t('timeline.toolPublish')}
            </Text>
          </Pressable>
        )}
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
    fontFamily: 'Archivo_500Medium',
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
    fontFamily: 'Archivo_600SemiBold',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
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
    fontFamily: 'Archivo_500Medium',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  publishLabel: {
    color: '#000',
    fontSize: 12,
    fontFamily: 'Archivo_600SemiBold',
  },
  label: {
    color: '#999',
    fontSize: 10,
  },
  labelDisabled: {
    color: '#444',
  },
});

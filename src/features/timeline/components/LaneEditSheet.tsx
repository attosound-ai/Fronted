import { useEffect, useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Check, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import type { LaneMeta } from '../types';

interface LaneEditSheetProps {
  visible: boolean;
  laneIndex: number;
  currentMeta: LaneMeta | undefined;
  /** Whether this lane currently contains clips — controls whether
   *  the delete button is enabled. Deleting a lane with clips would
   *  lose data, so we disable it. */
  hasClips: boolean;
  /** Whether there's only one lane left — you can't delete the last
   *  lane. */
  canDelete: boolean;
  onClose: () => void;
  onSave: (meta: LaneMeta) => void;
  onDelete: () => void;
}

const SWATCHES = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#22C55E', // green
  '#F59E0B', // amber
  '#A855F7', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

/**
 * Bottom sheet for renaming a lane and picking its color. Replaces the
 * previous `Alert.prompt` + `Alert.alert` chain which was clunky, iOS-
 * only, and gave no preview of the selected color.
 *
 * The sheet is fully controlled — it stages the user's edits locally and
 * only commits them to the timeline state when they tap "Save".
 */
export function LaneEditSheet({
  visible,
  laneIndex,
  currentMeta,
  hasClips,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: LaneEditSheetProps) {
  const { t } = useTranslation('projects');
  const [name, setName] = useState(currentMeta?.name ?? '');
  const [color, setColor] = useState(currentMeta?.color ?? SWATCHES[0]);

  // Re-sync local state every time the sheet is opened for a new lane
  useEffect(() => {
    if (!visible) return;
    setName(currentMeta?.name ?? '');
    setColor(currentMeta?.color ?? SWATCHES[0]);
  }, [visible, currentMeta]);

  const handleSave = () => {
    onSave({
      ...currentMeta,
      name: name.trim(),
      color,
    });
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const placeholder = t('timeline.laneEditNamePlaceholder', {
    index: laneIndex + 1,
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('timeline.laneEditTitle')}
    >
      <View style={styles.content}>
        {/* Name input */}
        <View style={styles.field}>
          <Text variant="caption" style={styles.fieldLabel}>
            {t('timeline.laneEditNameLabel')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={placeholder}
            placeholderTextColor="#555"
            style={styles.input}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            selectionColor={color}
            maxLength={40}
          />
        </View>

        {/* Color picker */}
        <View style={styles.field}>
          <Text variant="caption" style={styles.fieldLabel}>
            {t('timeline.laneEditColorLabel')}
          </Text>
          <View style={styles.swatchRow}>
            {SWATCHES.map((swatch) => {
              const isSelected = swatch === color;
              return (
                <TouchableOpacity
                  key={swatch}
                  onPress={() => setColor(swatch)}
                  activeOpacity={0.7}
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch },
                    isSelected && styles.swatchSelected,
                  ]}
                  accessibilityLabel={`Color ${swatch}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  {isSelected && (
                    <Check size={16} color="#FFF" strokeWidth={3} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Delete row — secondary destructive action */}
        {canDelete && (
          <TouchableOpacity
            onPress={handleDelete}
            disabled={hasClips}
            style={[styles.deleteRow, hasClips && styles.deleteRowDisabled]}
            activeOpacity={0.7}
          >
            <Trash2
              size={16}
              color={hasClips ? '#555' : '#EF4444'}
              strokeWidth={2.25}
            />
            <Text
              variant="body"
              style={[
                styles.deleteLabel,
                hasClips && styles.deleteLabelDisabled,
              ]}
            >
              {hasClips
                ? t('timeline.laneEditDeleteBlocked')
                : t('timeline.laneEditDelete')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.actionButton, styles.cancelButton]}
            activeOpacity={0.7}
          >
            <Text variant="body" style={styles.cancelLabel}>
              {t('timeline.laneEditCancel')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.actionButton, styles.saveButton]}
            activeOpacity={0.8}
          >
            <Text variant="body" style={styles.saveLabel}>
              {t('timeline.laneEditSave')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 20,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_500Medium',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: '#FFF',
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#1A0A0A',
    borderWidth: 1,
    borderColor: '#2A1515',
    borderRadius: 10,
  },
  deleteRowDisabled: {
    backgroundColor: '#141414',
    borderColor: '#222',
  },
  deleteLabel: {
    color: '#EF4444',
    fontSize: 13,
    fontFamily: 'Archivo_500Medium',
  },
  deleteLabelDisabled: {
    color: '#555',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cancelLabel: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Archivo_500Medium',
  },
  saveButton: {
    backgroundColor: '#FFF',
  },
  saveLabel: {
    color: '#000',
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
  },
});

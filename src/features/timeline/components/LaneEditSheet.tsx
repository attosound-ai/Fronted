import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Check, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
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
  /** Live pan updates (-1..1). Unlike name/color, pan is not staged
   *  until Save: you judge a pan move by ear while the timeline keeps
   *  playing under the sheet, so it lands in the timeline as you drag. */
  /** `commit` = true for gesture begin / tap / reset, false for drag frames. */
  onPanChange?: (pan: number, commit: boolean) => void;
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

const PAN_THUMB_SIZE = 18;

/**
 * Bottom sheet for renaming a lane, picking its color and setting its pan.
 * Replaces the previous `Alert.prompt` + `Alert.alert` chain which was
 * clunky, iOS-only, and gave no preview of the selected color.
 *
 * Name and color are staged locally and only committed to the timeline
 * state when the user taps "Save". Pan applies live (see `onPanChange`).
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
  onPanChange,
}: LaneEditSheetProps) {
  const { t } = useTranslation('projects');
  const [name, setName] = useState(currentMeta?.name ?? '');
  const [color, setColor] = useState(currentMeta?.color ?? SWATCHES[0]);

  // Re-sync local state when the sheet opens (or is re-targeted to another
  // lane). NOT on every currentMeta change: pan applies live, so currentMeta
  // gets a new identity on each pan move and re-syncing then would wipe an
  // unsaved name/color edit mid-drag.
  useEffect(() => {
    if (!visible) return;
    setName(currentMeta?.name ?? '');
    setColor(currentMeta?.color ?? SWATCHES[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, laneIndex]);

  // ── Pan ──
  // Read straight from currentMeta since every move is already committed.
  const pan = currentMeta?.pan ?? 0;
  const panTrackWidthRef = useRef(0);
  const [panTrackWidth, setPanTrackWidth] = useState(0);
  const panStartX = useRef(0);

  const handlePanLayout = (e: LayoutChangeEvent) => {
    panTrackWidthRef.current = e.nativeEvent.layout.width;
    setPanTrackWidth(e.nativeEvent.layout.width);
  };

  // Same RNGH pan as the lane strip's gain fader: native, so it takes the
  // touch ahead of the sheet's own drag-to-dismiss pan instead of racing it
  // the way a JS PanResponder would. `.minDistance(0)` lets a plain tap
  // jump the thumb; the track width is measured, so `e.x` maps directly.
  const panDrag = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .runOnJS(true)
        .onBegin((e) => {
          const width = panTrackWidthRef.current;
          if (width <= 0) return;
          const clampedX = Math.max(0, Math.min(width, e.x));
          panStartX.current = clampedX;
          onPanChange?.(-1 + (clampedX / width) * 2, true);
        })
        .onUpdate((e) => {
          const width = panTrackWidthRef.current;
          if (width <= 0) return;
          const newX = panStartX.current + e.translationX;
          const pct = Math.max(0, Math.min(1, newX / width));
          onPanChange?.(-1 + pct * 2, false);
        }),
    [onPanChange]
  );
  // Double-tap the slider to re-center (Simultaneous, like the gain fader:
  // the first tap jumps the thumb, the second tap's onEnd snaps it back).
  const panDoubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd(() => {
          void haptic('selection');
          onPanChange?.(0, true);
        }),
    [onPanChange]
  );
  const panGesture = useMemo(
    () => Gesture.Simultaneous(panDrag, panDoubleTap),
    [panDrag, panDoubleTap]
  );

  const handleResetPan = () => {
    void haptic('selection');
    onPanChange?.(0, true);
  };

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

  // Thumb center and the fill that runs from the center mark to it, so
  // the direction of the pan reads at a glance.
  const panCenterX = panTrackWidth / 2;
  const panThumbX = ((Math.max(-1, Math.min(1, pan)) + 1) / 2) * panTrackWidth;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('timeline.laneEditTitle')}>
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
                  accessibilityLabel={t('timeline.laneColorSwatchAccessibility', {
                    color: swatch,
                  })}
                  accessibilityState={{ selected: isSelected }}
                >
                  {isSelected && <Check size={16} color="#FFF" strokeWidth={3} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Pan — one row: label, slider with a center mark, tappable
            readout. Double-tap the slider or tap the readout to re-center. */}
        <View style={styles.panRow}>
          <Text variant="caption" style={[styles.fieldLabel, styles.panLabel]}>
            {t('timeline.lanePanLabel')}
          </Text>
          <GestureDetector gesture={panGesture}>
            <View style={styles.panTrackHit} onLayout={handlePanLayout}>
              <View style={styles.panTrack}>
                <View
                  style={[
                    styles.panFill,
                    {
                      left: Math.min(panCenterX, panThumbX),
                      width: Math.abs(panThumbX - panCenterX),
                      backgroundColor: color,
                    },
                  ]}
                />
                <View style={styles.panCenterMark} />
                <View
                  style={[styles.panThumb, { left: panThumbX - PAN_THUMB_SIZE / 2 }]}
                />
              </View>
            </View>
          </GestureDetector>
          <TouchableOpacity
            onPress={handleResetPan}
            hitSlop={8}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('timeline.lanePanResetAccessibility')}
          >
            <Text variant="caption" style={styles.panValue}>
              {formatPan(pan, t('timeline.lanePanCenter'))}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Delete row — secondary destructive action */}
        {canDelete && (
          <TouchableOpacity
            onPress={handleDelete}
            disabled={hasClips}
            style={[styles.deleteRow, hasClips && styles.deleteRowDisabled]}
            activeOpacity={0.7}
          >
            <Trash2 size={16} color={hasClips ? '#555' : '#EF4444'} strokeWidth={2.25} />
            <Text
              variant="body"
              style={[styles.deleteLabel, hasClips && styles.deleteLabelDisabled]}
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

function formatPan(pan: number, centerLabel: string): string {
  if (Math.abs(pan) < 0.02) return centerLabel;
  const side = pan < 0 ? 'L' : 'R';
  const pct = Math.round(Math.abs(pan) * 100);
  return `${side}${pct}`;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
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
  panRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 36,
  },
  panLabel: {
    width: 40,
  },
  // Full-height hit area around the thin track; the thumb overhangs the
  // track but stays inside this box.
  panTrackHit: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  panTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
  },
  panFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 4,
    opacity: 0.65,
  },
  panCenterMark: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    width: 2,
    top: -3,
    bottom: -3,
    borderRadius: 1,
    backgroundColor: '#555',
  },
  panThumb: {
    position: 'absolute',
    top: -(PAN_THUMB_SIZE - 8) / 2,
    width: PAN_THUMB_SIZE,
    height: PAN_THUMB_SIZE,
    borderRadius: PAN_THUMB_SIZE / 2,
    backgroundColor: '#FFF',
  },
  panValue: {
    minWidth: 52,
    textAlign: 'right',
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
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

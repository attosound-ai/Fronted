import React, { memo, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Pencil } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import type { LaneMeta } from '../types';
import { clampDb, formatDb, DB_MIN, DB_MAX } from '../utils/dbConversion';

interface LanePanelProps {
  laneIndex: number;
  meta: LaneMeta | undefined;
  isActive: boolean;
  onPress: () => void;
  onEdit: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  /**
   * `commit` = true when this value should own an undo entry (gesture begin,
   * tap, double-tap reset); false for the frames of a drag in between, so one
   * drag is one Undo instead of sixty.
   */
  onGainChange: (gainDb: number, commit: boolean) => void;
}

const PANEL_WIDTH = 128;
const PANEL_PADDING_H = 12;
const SLIDER_TRACK_WIDTH = PANEL_WIDTH - PANEL_PADDING_H * 2; // 104

/**
 * Per-lane mixer strip, rendered as a sticky overlay on the left of the
 * timeline. Only what you reach for mid-take lives here; pan (with name,
 * color and delete) sits in LaneEditSheet behind the pencil.
 *
 *   ● Track name                 ✎
 *   GAIN                     +0.0 dB
 *   ───────────●──────────
 *   ┌──────────────────────────┐
 *   │    [ MUTE ]   [ SOLO ]   │   ← anchored to the panel bottom
 *   └──────────────────────────┘
 *
 * Stateless — all mutations are dispatched via the callbacks.
 */
export const LanePanel = memo(function LanePanel({
  laneIndex,
  meta,
  isActive,
  onPress,
  onEdit,
  onToggleMute,
  onToggleSolo,
  onGainChange,
}: LanePanelProps) {
  const { t } = useTranslation('projects');
  const color = meta?.color ?? '#555';
  const name = meta?.name || t('timeline.laneDefaultName', { index: laneIndex + 1 });
  const muted = meta?.muted ?? false;
  const solo = meta?.solo ?? false;
  const gainDb = meta?.gainDb ?? 0;

  // Drag start position — captured on gesture begin so onUpdate can
  // resolve new positions as `start + translationX`.
  const gainStartX = useRef(0);

  // react-native-gesture-handler Pan gesture. We use RNGH (not
  // PanResponder) because the lane panels live inside a vertical
  // ScrollView, and iOS's native UIPanGestureRecognizer on the
  // ScrollView steals drag events from JS PanResponders. RNGH gestures
  // are native and properly negotiate ownership with ScrollView via
  // .blocksExternalGesture() / .simultaneousWithExternalGesture().
  //
  // `.minDistance(0)` fires onBegin on first touch so a plain tap still
  // moves the thumb. `.runOnJS(true)` routes callbacks to the JS thread
  // so we can call React state setters directly.
  const gainPan = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .runOnJS(true)
        .onBegin((e) => {
          const clampedX = Math.max(0, Math.min(SLIDER_TRACK_WIDTH, e.x));
          gainStartX.current = clampedX;
          const pct = clampedX / SLIDER_TRACK_WIDTH;
          onGainChange(clampDb(DB_MIN + pct * (DB_MAX - DB_MIN)), true);
        })
        .onUpdate((e) => {
          const newX = gainStartX.current + e.translationX;
          const pct = Math.max(0, Math.min(1, newX / SLIDER_TRACK_WIDTH));
          onGainChange(clampDb(DB_MIN + pct * (DB_MAX - DB_MIN)), false);
        }),
    [onGainChange]
  );

  // Double-tap the fader to snap back to unity. Composed as Simultaneous so
  // the pan keeps its tap-to-jump feel: the first tap still moves the thumb
  // under the finger, and the second tap's onEnd snaps it to 0 dB.
  const gainDoubleTap = React.useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd(() => {
          void haptic('selection');
          onGainChange(0, true);
        }),
    [onGainChange]
  );
  const gainGesture = React.useMemo(
    () => Gesture.Simultaneous(gainPan, gainDoubleTap),
    [gainPan, gainDoubleTap]
  );

  const handleResetGain = useCallback(() => {
    void haptic('selection');
    onGainChange(0, true);
  }, [onGainChange]);
  const handleToggleMute = useCallback(() => {
    void haptic('selection');
    onToggleMute();
  }, [onToggleMute]);
  const handleToggleSolo = useCallback(() => {
    void haptic('selection');
    onToggleSolo();
  }, [onToggleSolo]);

  return (
    <View style={[styles.container, isActive && styles.containerActive]}>
      {/* Top stack: track name + the gain group. The group has its label
          and track glued together (gap 2); the name row sits a bigger gap
          (12) above it so the name never crowds the GAIN label. */}
      <View style={styles.topStack}>
        {/* Track name + edit button */}
        <View style={styles.nameRow}>
          <TouchableOpacity
            onPress={onPress}
            onLongPress={onEdit}
            style={styles.nameTapArea}
            activeOpacity={0.7}
          >
            <View style={[styles.colorDot, { backgroundColor: color }]} />
            <Text variant="caption" style={styles.nameText} numberOfLines={1}>
              {name}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onEdit}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={styles.editButton}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t('timeline.laneEditTrackAccessibility')}
          >
            <Pencil size={12} color="#888" strokeWidth={2.25} />
          </TouchableOpacity>
        </View>

        {/* Gain group */}
        <View style={styles.sliderGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.metricLabel}>{t('timeline.laneGainLabel')}</Text>
            <TouchableOpacity
              onPress={handleResetGain}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('timeline.laneGainResetAccessibility')}
            >
              <Text style={styles.metricValue}>{formatDb(gainDb)}</Text>
            </TouchableOpacity>
          </View>
          <GestureDetector gesture={gainGesture}>
            <View
              style={styles.sliderTrack}
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
            >
              <View
                style={[
                  styles.sliderFill,
                  { width: dbToTrack(gainDb), backgroundColor: color },
                ]}
              />
              <View style={[styles.sliderThumb, { left: dbToTrack(gainDb) - 5 }]} />
            </View>
          </GestureDetector>
        </View>
      </View>

      {/* Bottom: mute / solo cluster anchored to the container bottom */}
      <View style={styles.buttonWrapper}>
        <TouchableOpacity
          onPress={handleToggleMute}
          hitSlop={{ top: 6, bottom: 4, left: 4, right: 2 }}
          style={[styles.pillButton, muted && styles.pillButtonMuteActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, muted && styles.pillTextActive]}>
            {t('timeline.laneMute')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleToggleSolo}
          hitSlop={{ top: 6, bottom: 4, left: 2, right: 4 }}
          style={[styles.pillButton, solo && styles.pillButtonSoloActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, solo && styles.pillTextActive]}>
            {t('timeline.laneSolo')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

function dbToTrack(db: number): number {
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  const pct = (clamped - DB_MIN) / (DB_MAX - DB_MIN);
  return pct * SLIDER_TRACK_WIDTH;
}

const styles = StyleSheet.create({
  container: {
    // flex: 1 makes the panel fill its parent wrapper's explicit height,
    // which is set in TimelineEditor. Previously this style used an
    // inline `{ height }` prop, which was unreliable when the parent
    // wrapper had no explicit dimensions — Yoga would collapse the
    // container to its content height.
    flex: 1,
    width: PANEL_WIDTH,
    backgroundColor: '#0F0F0F',
    borderRightWidth: 1,
    borderRightColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    paddingHorizontal: PANEL_PADDING_H,
    paddingTop: 10,
    // Safety net: if content grows beyond the declared `height` (e.g.
    // different system font metrics), clip it inside the panel.
    overflow: 'hidden',
  },
  containerActive: {
    backgroundColor: '#171717',
    borderRightColor: '#3B82F6',
  },
  topStack: {
    // Gap between the name row and the gain group so the name reads as
    // its own block above the fader.
    gap: 12,
  },
  sliderGroup: {
    // Tight gap inside the group — label sits right above its slider.
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 16,
    gap: 6,
  },
  nameTapArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    flexGrow: 1,
  },
  editButton: {
    width: 18,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nameText: {
    color: '#FFF',
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'Archivo_600SemiBold',
    flexShrink: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 12,
  },
  metricLabel: {
    color: '#666',
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Archivo_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricValue: {
    color: '#CCC',
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Archivo_500Medium',
  },
  sliderTrack: {
    height: 8,
    width: SLIDER_TRACK_WIDTH,
    backgroundColor: '#1F1F1F',
    borderRadius: 4,
    justifyContent: 'center',
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
    opacity: 0.65,
  },
  sliderThumb: {
    position: 'absolute',
    top: -3,
    width: 10,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#FFF',
  },
  // Mute/solo wrapper — absolutely anchored to the bottom of the panel
  // so the vertical gap between the gain fader and the pill tops is
  // deterministic regardless of how flex distributes slack. With
  // TRACK_HEIGHT=124 the panel is 120 tall: the top stack ends at y≈60
  // (thumb overhang to 63) and this wrapper's divider sits at y=77, so
  // the fader keeps 14pt of clear #0F0F0F below its thumb and its
  // 12pt hitSlop never overlaps the pills' 6pt one.
  buttonWrapper: {
    position: 'absolute',
    left: PANEL_PADDING_H,
    right: PANEL_PADDING_H,
    bottom: 8,
    flexDirection: 'row',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  pillButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  pillButtonMuteActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  pillButtonSoloActive: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  pillText: {
    color: '#888',
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Archivo_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pillTextActive: {
    color: '#FFF',
  },
});

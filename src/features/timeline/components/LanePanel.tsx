import React, { memo, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Pencil } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
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
  onGainChange: (gainDb: number) => void;
  onPanChange: (pan: number) => void;
}

const PANEL_WIDTH = 128;
const PANEL_PADDING_H = 12;
const SLIDER_TRACK_WIDTH = PANEL_WIDTH - PANEL_PADDING_H * 2; // 104

/**
 * Per-lane mixer strip, rendered as a sticky overlay on the left of the
 * timeline.
 *
 *   ● Track name
 *   GAIN                     +0.0 dB
 *   ───────────●──────────
 *   PAN                        Center
 *   ───────────●──────────
 *   ┌──────────────────────────┐
 *   │    [ MUTE ]   [ SOLO ]   │   ← extra vertical padding
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
  onPanChange,
}: LanePanelProps) {
  const color = meta?.color ?? '#555';
  const name = meta?.name || `Track ${laneIndex + 1}`;
  const muted = meta?.muted ?? false;
  const solo = meta?.solo ?? false;
  const gainDb = meta?.gainDb ?? 0;
  const pan = meta?.pan ?? 0;

  // Drag start positions — captured on gesture begin so onUpdate can
  // resolve new positions as `start + translationX`.
  const gainStartX = useRef(0);
  const panStartX = useRef(0);

  // react-native-gesture-handler Pan gestures. We use RNGH (not
  // PanResponder) because the lane panels live inside a vertical
  // ScrollView, and iOS's native UIPanGestureRecognizer on the
  // ScrollView steals drag events from JS PanResponders. RNGH gestures
  // are native and properly negotiate ownership with ScrollView via
  // .blocksExternalGesture() / .simultaneousWithExternalGesture().
  //
  // `.minDistance(0)` fires onBegin on first touch so a plain tap still
  // moves the thumb. `.runOnJS(true)` routes callbacks to the JS thread
  // so we can call React state setters directly.
  const gainGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .runOnJS(true)
        .onBegin((e) => {
          const clampedX = Math.max(0, Math.min(SLIDER_TRACK_WIDTH, e.x));
          gainStartX.current = clampedX;
          const pct = clampedX / SLIDER_TRACK_WIDTH;
          onGainChange(clampDb(DB_MIN + pct * (DB_MAX - DB_MIN)));
        })
        .onUpdate((e) => {
          const newX = gainStartX.current + e.translationX;
          const pct = Math.max(0, Math.min(1, newX / SLIDER_TRACK_WIDTH));
          onGainChange(clampDb(DB_MIN + pct * (DB_MAX - DB_MIN)));
        }),
    [onGainChange]
  );

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .runOnJS(true)
        .onBegin((e) => {
          const clampedX = Math.max(0, Math.min(SLIDER_TRACK_WIDTH, e.x));
          panStartX.current = clampedX;
          const pct = clampedX / SLIDER_TRACK_WIDTH;
          onPanChange(-1 + pct * 2);
        })
        .onUpdate((e) => {
          const newX = panStartX.current + e.translationX;
          const pct = Math.max(0, Math.min(1, newX / SLIDER_TRACK_WIDTH));
          onPanChange(-1 + pct * 2);
        }),
    [onPanChange]
  );

  const handleResetGain = useCallback(() => onGainChange(0), [onGainChange]);
  const handleResetPan = useCallback(() => onPanChange(0), [onPanChange]);

  return (
    <View style={[styles.container, isActive && styles.containerActive]}>
      {/* Top stack: track name + two slider sub-groups. Each slider
          group has its label and track glued together (gap 2), and the
          groups themselves are separated by a bigger gap (10) so the
          previous slider's thumb overhang can't visually touch the next
          label. */}
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
            accessibilityLabel="Edit track"
          >
            <Pencil size={12} color="#888" strokeWidth={2.25} />
          </TouchableOpacity>
        </View>

        {/* Gain group */}
        <View style={styles.sliderGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.metricLabel}>Gain</Text>
            <TouchableOpacity onPress={handleResetGain} hitSlop={6}>
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

        {/* Pan group */}
        <View style={styles.sliderGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.metricLabel}>Pan</Text>
            <TouchableOpacity onPress={handleResetPan} hitSlop={6}>
              <Text style={styles.metricValue}>{formatPan(pan)}</Text>
            </TouchableOpacity>
          </View>
          <GestureDetector gesture={panGesture}>
            <View
              style={styles.sliderTrack}
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
            >
              <View style={styles.panCenterMark} />
              <View style={[styles.sliderThumb, { left: panToTrack(pan) - 5 }]} />
            </View>
          </GestureDetector>
        </View>
      </View>

      {/* Bottom: mute / solo cluster anchored to the container bottom */}
      <View style={styles.buttonWrapper}>
        <TouchableOpacity
          onPress={onToggleMute}
          hitSlop={{ top: 6, bottom: 4, left: 4, right: 2 }}
          style={[styles.pillButton, muted && styles.pillButtonMuteActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, muted && styles.pillTextActive]}>Mute</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onToggleSolo}
          hitSlop={{ top: 6, bottom: 4, left: 2, right: 4 }}
          style={[styles.pillButton, solo && styles.pillButtonSoloActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.pillText, solo && styles.pillTextActive]}>Solo</Text>
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

function panToTrack(pan: number): number {
  const clamped = Math.max(-1, Math.min(1, pan));
  const pct = (clamped + 1) / 2;
  return pct * SLIDER_TRACK_WIDTH;
}

function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.02) return 'Center';
  const side = pan < 0 ? 'L' : 'R';
  const pct = Math.round(Math.abs(pan) * 100);
  return `${side}${pct}`;
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
    paddingTop: 8,
    // Safety net: if content grows beyond the declared `height` (e.g.
    // different system font metrics), clip it inside the panel.
    overflow: 'hidden',
  },
  containerActive: {
    backgroundColor: '#171717',
    borderRightColor: '#3B82F6',
  },
  topStack: {
    // Big gap between logical sections (name, gain group, pan group)
    // so slider thumbs don't visually collide with the next label
    // and each section reads as its own discrete block.
    gap: 16,
  },
  sliderGroup: {
    // Tight gap inside a group — label sits right above its slider.
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
  panCenterMark: {
    position: 'absolute',
    left: '50%',
    width: 1,
    top: 0,
    bottom: 0,
    backgroundColor: '#444',
  },
  // Mute/solo wrapper — absolutely anchored to the bottom of the panel
  // so the vertical gap between the pan slider and the pill tops is
  // deterministic regardless of how flex distributes slack. With
  // TRACK_HEIGHT=136 and the top stack ending at ~y=70, anchoring the
  // wrapper at the bottom gives ~30pt of clear space for the pan slider
  // to breathe (the gap is all empty #0F0F0F panel background).
  buttonWrapper: {
    position: 'absolute',
    left: PANEL_PADDING_H,
    right: PANEL_PADDING_H,
    bottom: 6,
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

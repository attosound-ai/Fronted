import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { CircleHelp, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import type { LocalClip } from '../types';
import { STUDIO_COLORS } from './studioTheme';

/** One envelope point: time inside the clip in ms, and gain 0 to 1. */
export type EnvelopePoint = [number, number];

interface Props {
  clip: LocalClip | null;
  clipLabel: string;
  peaks: number[];
  points: EnvelopePoint[];
  onChange: (points: EnvelopePoint[], commit: boolean) => void;
  onClose: () => void;
}

const PANEL_HEIGHT = 190;
const WAVE_HEIGHT = 130;
const SIDE_PADDING = 12;
const HIT_RADIUS = 18;
/** A drag beyond the top or bottom edge by this much deletes the point. */
const DELETE_MARGIN = 26;

function buildWavePath(peaks: number[], width: number, height: number): string {
  if (peaks.length === 0) return '';
  const mid = height / 2;
  const half = height / 2 - 2;
  const step = width / Math.max(1, peaks.length - 1);
  let top = '';
  let bottom = '';
  for (let i = 0; i < peaks.length; i++) {
    const x = (i * step).toFixed(1);
    const amp = Math.max(0.5, peaks[i] * half);
    top += `${i === 0 ? 'M' : 'L'}${x},${(mid - amp).toFixed(1)}`;
  }
  for (let i = peaks.length - 1; i >= 0; i--) {
    const x = (i * step).toFixed(1);
    const amp = Math.max(0.5, peaks[i] * half);
    bottom += `L${x},${(mid + amp).toFixed(1)}`;
  }
  return `${top}${bottom}Z`;
}

/**
 * SoundLab's volume automation panel: the clip's waveform blown up with a
 * gain envelope over it. Tap the waveform to add a control point, drag a
 * point to shape the curve, drag it off the top or bottom edge to delete
 * it. Non destructive: the points live on the project and the mix applies
 * them, the audio file is untouched.
 */
export function AutomationPanel({
  clip,
  clipLabel,
  peaks,
  points,
  onChange,
  onClose,
}: Props) {
  const { t } = useTranslation('projects');
  const { width: screenWidth } = useWindowDimensions();
  const [showHelp, setShowHelp] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const width = screenWidth - SIDE_PADDING * 2;
  const clipLengthMs = clip ? clip.endInSegment - clip.startInSegment : 0;

  const toX = useCallback(
    (ms: number) => (clipLengthMs > 0 ? (ms / clipLengthMs) * width : 0),
    [clipLengthMs, width]
  );
  const toY = useCallback(
    (gain: number) => (1 - Math.max(0, Math.min(1, gain))) * WAVE_HEIGHT,
    []
  );
  const fromX = useCallback(
    (x: number) => Math.max(0, Math.min(clipLengthMs, (x / width) * clipLengthMs)),
    [clipLengthMs, width]
  );
  const fromY = useCallback(
    (y: number) => Math.max(0, Math.min(1, 1 - y / WAVE_HEIGHT)),
    []
  );

  // The drawn envelope always spans the clip: a flat unity line without
  // points, and the first and last point extended to the edges otherwise.
  const line = useMemo(() => {
    if (points.length === 0) {
      return `0,${toY(1)} ${width},${toY(1)}`;
    }
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    const parts = [`0,${toY(sorted[0][1]).toFixed(1)}`];
    for (const [ms, gain] of sorted) {
      parts.push(`${toX(ms).toFixed(1)},${toY(gain).toFixed(1)}`);
    }
    parts.push(`${width},${toY(sorted[sorted.length - 1][1]).toFixed(1)}`);
    return parts.join(' ');
  }, [points, toX, toY, width]);

  const wavePath = useMemo(
    () => buildWavePath(peaks, width, WAVE_HEIGHT),
    [peaks, width]
  );

  const findPointAt = useCallback(
    (x: number, y: number) => {
      let best = -1;
      let bestDist = HIT_RADIUS;
      points.forEach(([ms, gain], i) => {
        const dx = toX(ms) - x;
        const dy = toY(gain) - y;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      });
      return best;
    },
    [points, toX, toY]
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((e) => {
          if (!clip) return;
          const existing = findPointAt(e.x, e.y);
          if (existing >= 0) return;
          void haptic('light');
          const added: EnvelopePoint = [fromX(e.x), fromY(e.y)];
          const next: EnvelopePoint[] = [...points, added].sort((a, b) => a[0] - b[0]);
          onChange(next, true);
        }),
    [clip, findPointAt, points, fromX, fromY, onChange]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(2)
        .onBegin((e) => {
          const index = findPointAt(e.x, e.y);
          setDragIndex(index >= 0 ? index : null);
          if (index >= 0) void haptic('selection');
        })
        .onUpdate((e) => {
          if (dragIndex === null || !clip) return;
          const next = [...points];
          next[dragIndex] = [fromX(e.x), fromY(e.y)];
          onChange(next, false);
        })
        .onEnd((e) => {
          if (dragIndex === null || !clip) {
            setDragIndex(null);
            return;
          }
          // Dragged off the top or bottom edge: delete the point.
          if (e.y < -DELETE_MARGIN || e.y > WAVE_HEIGHT + DELETE_MARGIN) {
            void haptic('medium');
            onChange(
              points.filter((_, i) => i !== dragIndex),
              true
            );
            setDragIndex(null);
            return;
          }
          const next = [...points];
          next[dragIndex] = [fromX(e.x), fromY(e.y)];
          onChange(
            next.sort((a, b) => a[0] - b[0]),
            true
          );
          setDragIndex(null);
        }),
    [dragIndex, clip, points, findPointAt, fromX, fromY, onChange]
  );

  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text variant="small" numberOfLines={1} style={styles.title}>
          {clip ? clipLabel : t('studio.automation.pickClip')}
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowHelp((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('studio.automation.help')}
          >
            <CircleHelp size={18} color={STUDIO_COLORS.textMuted} strokeWidth={2.25} />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('studio.automation.close')}
            style={styles.close}
          >
            <X size={18} color={STUDIO_COLORS.textMuted} strokeWidth={2.25} />
          </Pressable>
        </View>
      </View>

      {showHelp && (
        <Text variant="caption" style={styles.help}>
          {t('studio.automation.helpText')}
        </Text>
      )}

      <GestureDetector gesture={gesture}>
        <View style={[styles.canvas, { width, height: WAVE_HEIGHT }]}>
          <Svg width={width} height={WAVE_HEIGHT}>
            {wavePath !== '' && <Path d={wavePath} fill={STUDIO_COLORS.waveformDim} />}
            <Polyline
              points={line}
              fill="none"
              stroke={STUDIO_COLORS.selectionLine}
              strokeWidth={2}
            />
            {points.map(([ms, gain], i) => (
              <Circle
                key={`${i}-${ms}`}
                cx={toX(ms)}
                cy={toY(gain)}
                r={dragIndex === i ? 8 : 5}
                fill={STUDIO_COLORS.selectionLine}
                stroke={STUDIO_COLORS.background}
                strokeWidth={1.5}
              />
            ))}
          </Svg>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    height: PANEL_HEIGHT,
    backgroundColor: STUDIO_COLORS.surface,
    paddingHorizontal: SIDE_PADDING,
  },
  header: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: STUDIO_COLORS.text,
    flex: 1,
    marginRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  close: {
    marginLeft: 14,
  },
  help: {
    color: STUDIO_COLORS.textMuted,
    marginBottom: 6,
  },
  canvas: {
    backgroundColor: STUDIO_COLORS.lane,
    borderRadius: 6,
    overflow: 'hidden',
  },
});

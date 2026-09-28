import {
  forwardRef,
  memo,
  useImperativeHandle,
  useMemo,
  useRef,
  type Component,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import {
  isTimelineViewAvailable,
  type AttoTimelineViewProps,
  type TimelineViewRef,
} from '../../../../modules/atto-timeline';
import { STUDIO, STUDIO_COLORS } from './studioTheme';

// The raw native view (not the module's forwardRef wrapper): Reanimated needs
// a host component to push the playhead prop straight from the UI thread.
type NativeInstance = Component<AttoTimelineViewProps> & {
  scrollToMs?: (ms: number, animated: boolean) => Promise<void>;
  setZoom?: (pixelsPerSecond: number, anchorMs: number | null) => Promise<void>;
  setWaveform?: (
    clipId: string,
    peaks: number[],
    startMs: number,
    endMs: number
  ) => Promise<void>;
};
const NativeTimeline = isTimelineViewAvailable()
  ? requireNativeViewManager<AttoTimelineViewProps>('AttoTimeline', 'AttoTimelineView')
  : null;
const AnimatedTimeline = NativeTimeline
  ? Animated.createAnimatedComponent(NativeTimeline)
  : null;

type Props = Omit<AttoTimelineViewProps, 'playheadMs' | 'colors' | 'style'> & {
  /** UI thread playhead; the native view reads it through animated props. */
  positionSv: SharedValue<number>;
  height: number;
};

/**
 * The native timeline (ruler, lanes, waveforms, selection, playhead) with
 * ATTO's palette and the playhead wired to the shared value so playback
 * never renders in JS. Falls back to a notice where the module is absent
 * (Expo Go, a stale build) instead of a blank editor.
 */
export const TimelineSurface = memo(
  forwardRef<TimelineViewRef, Props>(function TimelineSurface(
    { positionSv, height, ...rest },
    ref
  ) {
    const colors = useMemo(
      () => ({
        background: STUDIO_COLORS.background,
        laneBackground: STUDIO_COLORS.lane,
        laneBorder: STUDIO_COLORS.laneBorder,
        waveform: STUDIO_COLORS.waveform,
        waveformSelected: STUDIO_COLORS.waveform,
        playhead: STUDIO_COLORS.playhead,
        selectionLine: STUDIO_COLORS.selectionLine,
        selectionFill: STUDIO_COLORS.selectionFill,
        selectionBorder: STUDIO_COLORS.selectionBorder,
        rulerText: STUDIO_COLORS.textMuted,
        rulerTick: STUDIO_COLORS.borderStrong,
        clipBorder: STUDIO_COLORS.borderStrong,
      }),
      []
    );
    const animatedProps = useAnimatedProps(() => ({ playheadMs: positionSv.value }));
    const nativeRef = useRef<NativeInstance>(null);

    // Las funciones de la vista buscan la vista nativa por su tag, y el tag no
    // existe hasta que Fabric la monta, que pasa DESPUÉS de que React termine
    // su commit. Un efecto que llame a setWaveform nada más montar el editor
    // llega antes: "Unable to find the 'AttoTimelineView' view with tag".
    // Así fue como los clips salieron sin onda el 28 de septiembre de 2026.
    // El primer onLayout es la señal de que la vista ya está; todo lo que
    // necesite la vista espera a eso.
    const montadaRef = useRef<{ promesa: Promise<void>; resolver: () => void } | null>(
      null
    );
    if (!montadaRef.current) {
      let resolver: () => void = () => {};
      const promesa = new Promise<void>((r) => {
        resolver = r;
      });
      montadaRef.current = { promesa, resolver };
    }
    useImperativeHandle(
      ref,
      () => ({
        async scrollToMs(ms, animated = true) {
          const fn = nativeRef.current?.scrollToMs;
          if (typeof fn === 'function') await fn.call(nativeRef.current, ms, animated);
        },
        async setZoom(pixelsPerSecond, anchorMs = null) {
          const fn = nativeRef.current?.setZoom;
          if (typeof fn === 'function') {
            await fn.call(nativeRef.current, pixelsPerSecond, anchorMs ?? null);
          }
        },
        async setWaveform(clipId, peaks, startMs, endMs) {
          await montadaRef.current?.promesa;
          const fn = nativeRef.current?.setWaveform;
          if (typeof fn !== 'function') {
            throw new Error('setWaveform no está en la vista nativa');
          }
          await fn.call(nativeRef.current, clipId, peaks, startMs, endMs);
        },
      }),
      []
    );

    if (!AnimatedTimeline) {
      return (
        <View style={[styles.missing, { height }]}>
          <Text variant="small" style={styles.missingText}>
            Native timeline unavailable in this build
          </Text>
        </View>
      );
    }
    return (
      <AnimatedTimeline
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={nativeRef as any}
        {...rest}
        playheadMs={0}
        colors={colors}
        animatedProps={animatedProps}
        onLayout={() => montadaRef.current?.resolver()}
        rulerHeight={STUDIO.rulerHeight}
        style={[styles.view, { height }]}
      />
    );
  })
);

const styles = StyleSheet.create({
  view: {
    width: '100%',
    backgroundColor: STUDIO_COLORS.background,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.background,
  },
  missingText: {
    color: STUDIO_COLORS.textMuted,
  },
});

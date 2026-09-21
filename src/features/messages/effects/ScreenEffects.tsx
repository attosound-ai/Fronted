import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { haptic } from '@/lib/haptics/hapticService';
import {
  balloonParticles,
  celebrationParticles,
  confettiParticles,
  echoCopies,
  EFFECT_DURATION_MS,
  fireworkBursts,
  heartParticles,
  laserBeams,
  seedFromId,
  type Particle,
  type ScreenEffectName,
} from './effectCatalog';

export interface ActiveScreenEffect {
  name: ScreenEffectName;
  messageId: string;
  /** Echo repeats the message's own words. */
  text?: string;
}

interface ScreenEffectOverlayProps {
  effect: ActiveScreenEffect | null;
  onDone: () => void;
}

const EASE_OUT = Easing.out(Easing.cubic);

/**
 * The full screen iMessage effects. Drawn above the thread, never
 * interactive, and self clearing when the animation ends.
 */
function ScreenEffectOverlayInner({ effect, onDone }: ScreenEffectOverlayProps) {
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (!effect) return;
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.EFFECT_PLAYED, {
      kind: 'screen',
      name: effect.name,
      message_id: effect.messageId,
    });
    void haptic(
      effect.name === 'lasers' || effect.name === 'fireworks' ? 'heavy' : 'medium'
    );
    const timer = setTimeout(onDone, EFFECT_DURATION_MS[effect.name] + 200);
    return () => clearTimeout(timer);
  }, [effect, onDone]);

  if (!effect) return null;
  const seed = seedFromId(effect.messageId);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {effect.name === 'confetti' && (
        <Fallers
          particles={confettiParticles(seed)}
          width={width}
          height={height}
          shape="rect"
        />
      )}
      {effect.name === 'balloons' && (
        <Risers
          particles={balloonParticles(seed)}
          width={width}
          height={height}
          shape="balloon"
        />
      )}
      {effect.name === 'celebration' && (
        <Risers
          particles={celebrationParticles(seed)}
          width={width}
          height={height}
          shape="rect"
        />
      )}
      {effect.name === 'love' && (
        <Risers
          particles={heartParticles(seed)}
          width={width}
          height={height}
          shape="heart"
        />
      )}
      {effect.name === 'lasers' && <Lasers seed={seed} width={width} height={height} />}
      {effect.name === 'fireworks' && (
        <Fireworks seed={seed} width={width} height={height} />
      )}
      {effect.name === 'echo' && (
        <Echo seed={seed} width={width} height={height} text={effect.text ?? ''} />
      )}
      {effect.name === 'spotlight' && <Spotlight width={width} height={height} />}
    </View>
  );
}

export const ScreenEffectOverlay = memo(ScreenEffectOverlayInner);

type Shape = 'rect' | 'balloon' | 'heart';

/** Particles that travel downward (confetti). */
function Fallers({
  particles,
  width,
  height,
  shape,
}: {
  particles: Particle[];
  width: number;
  height: number;
  shape: Shape;
}) {
  return (
    <>
      {particles.map((p, i) => (
        <FlyingParticle
          key={i}
          particle={p}
          width={width}
          height={height}
          shape={shape}
          toY={height * 1.15}
        />
      ))}
    </>
  );
}

/** Particles that travel upward (balloons, hearts, celebration). */
function Risers({
  particles,
  width,
  height,
  shape,
}: {
  particles: Particle[];
  width: number;
  height: number;
  shape: Shape;
}) {
  return (
    <>
      {particles.map((p, i) => (
        <FlyingParticle
          key={i}
          particle={p}
          width={width}
          height={height}
          shape={shape}
          toY={-height * 0.25}
        />
      ))}
    </>
  );
}

function FlyingParticle({
  particle,
  width,
  height,
  shape,
  toY,
}: {
  particle: Particle;
  width: number;
  height: number;
  shape: Shape;
  toY: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      particle.delay,
      withTiming(1, { duration: particle.duration, easing: Easing.linear })
    );
  }, [particle.delay, particle.duration, progress]);

  const fromY = particle.y * height;
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    // Sway while travelling, so nothing falls in a straight line.
    const sway = Math.sin(t * Math.PI * 2) * particle.drift * width;
    return {
      transform: [
        { translateY: fromY + (toY - fromY) * t },
        { translateX: sway },
        { rotate: `${particle.rotation * t}deg` },
      ],
      opacity: t < 0.05 ? t / 0.05 : t > 0.85 ? (1 - t) / 0.15 : 1,
    };
  });

  const left = particle.x * width;
  if (shape === 'heart') {
    return (
      <Animated.Text
        style={[styles.glyph, { left, fontSize: particle.size }, style]}
        allowFontScaling={false}
      >
        ❤️
      </Animated.Text>
    );
  }
  if (shape === 'balloon') {
    return (
      <Animated.View style={[styles.particle, { left }, style]}>
        <View
          style={{
            width: particle.size,
            height: particle.size * 1.25,
            borderRadius: particle.size / 2,
            backgroundColor: particle.color,
          }}
        />
        <View style={[styles.string, { height: particle.size * 0.8 }]} />
      </Animated.View>
    );
  }
  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left,
          width: particle.size,
          height: particle.size * 0.55,
          borderRadius: 2,
          backgroundColor: particle.color,
        },
        style,
      ]}
    />
  );
}

function Lasers({
  seed,
  width,
  height,
}: {
  seed: number;
  width: number;
  height: number;
}) {
  const beams = useMemo(() => laserBeams(seed), [seed]);
  return (
    <>
      <Flash />
      {beams.map((beam, i) => (
        <LaserBeam key={i} beam={beam} width={width} height={height} />
      ))}
    </>
  );
}

function LaserBeam({
  beam,
  width,
  height,
}: {
  beam: Particle;
  width: number;
  height: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      beam.delay,
      withRepeat(
        withTiming(1, { duration: beam.duration, easing: Easing.linear }),
        2,
        false
      )
    );
  }, [beam.delay, beam.duration, progress]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (beam.x + beam.drift * progress.value) * width }],
    opacity: progress.value > 0 && progress.value < 1 ? 1 : 0,
  }));
  return (
    <Animated.View
      style={[
        styles.laser,
        {
          top: beam.y * height,
          height: beam.size,
          width: width * 0.55,
          backgroundColor: beam.color,
          shadowColor: beam.color,
        },
        style,
      ]}
    />
  );
}

function Fireworks({
  seed,
  width,
  height,
}: {
  seed: number;
  width: number;
  height: number;
}) {
  const bursts = useMemo(() => fireworkBursts(seed), [seed]);
  return (
    <>
      {bursts.map((burst, i) => (
        <View
          key={i}
          style={[styles.burst, { left: burst.x * width, top: burst.y * height }]}
          pointerEvents="none"
        >
          {burst.sparks.map((spark, s) => (
            <Spark
              key={s}
              angle={spark.angle}
              distance={spark.distance}
              size={spark.size}
              color={burst.color}
              delay={burst.delay}
            />
          ))}
        </View>
      ))}
    </>
  );
}

function Spark({
  angle,
  distance,
  size,
  color,
  delay,
}: {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 900, easing: EASE_OUT }));
  }, [delay, progress]);
  const rad = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(rad) * distance * progress.value },
      {
        translateY: Math.sin(rad) * distance * progress.value + 26 * progress.value ** 2,
      },
      { scale: 1 - 0.4 * progress.value },
    ],
    opacity: progress.value === 0 ? 0 : 1 - progress.value,
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function Echo({
  seed,
  width,
  height,
  text,
}: {
  seed: number;
  width: number;
  height: number;
  text: string;
}) {
  const copies = useMemo(() => echoCopies(seed), [seed]);
  const body = (text || '💬').slice(0, 24);
  return (
    <>
      {copies.map((copy, i) => (
        <EchoCopy key={i} copy={copy} width={width} height={height} text={body} />
      ))}
    </>
  );
}

function EchoCopy({
  copy,
  width,
  height,
  text,
}: {
  copy: Particle;
  width: number;
  height: number;
  text: string;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      copy.delay,
      withSequence(
        withTiming(1, { duration: copy.duration, easing: EASE_OUT }),
        withTiming(0, { duration: 500 })
      )
    );
  }, [copy.delay, copy.duration, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value * 0.9,
    transform: [
      { scale: 0.4 + copy.size * progress.value },
      { rotate: `${copy.rotation}deg` },
    ],
  }));
  return (
    <Animated.Text
      numberOfLines={1}
      style={[
        styles.echoText,
        { left: copy.x * width - 60, top: copy.y * height },
        style,
      ]}
      allowFontScaling={false}
    >
      {text}
    </Animated.Text>
  );
}

function Spotlight({ width, height }: { width: number; height: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withSequence(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
      withTiming(1, { duration: 400 })
    );
  }, [progress]);
  const dimStyle = useAnimatedStyle(() => ({
    opacity:
      progress.value < 0.1
        ? progress.value * 10
        : progress.value > 0.9
          ? (1 - progress.value) * 10
          : 0.82,
  }));
  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (0.15 + 0.6 * progress.value) * height }],
  }));
  const size = width * 0.85;
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
      <Animated.View
        style={[
          styles.spot,
          { width: size, height: size, borderRadius: size / 2, left: (width - size) / 2 },
          beamStyle,
        ]}
      />
    </>
  );
}

/** One white pulse, used to open the laser effect. */
function Flash() {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withSequence(
      withTiming(0.5, { duration: 90 }),
      withTiming(0, { duration: 320 })
    );
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[StyleSheet.absoluteFill, styles.flash, style]} />;
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', top: 0, alignItems: 'center' },
  glyph: { position: 'absolute', top: 0 },
  string: { width: 1, backgroundColor: 'rgba(255,255,255,0.4)' },
  laser: {
    position: 'absolute',
    left: 0,
    borderRadius: 2,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  burst: {
    position: 'absolute',
    width: 1,
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  echoText: {
    position: 'absolute',
    width: 120,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
  },
  dim: { backgroundColor: '#000000' },
  spot: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  flash: { backgroundColor: '#FFFFFF' },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraCapturedPicture,
  type CameraType,
  type FlashMode,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronDown,
  Images,
  MoreHorizontal,
  RefreshCw,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { GlassSurface } from '@/components/navigation/GlassSurface';
import { COLORS } from '@/constants/theme';
import { haptic } from '@/lib/haptics/hapticService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useCameraStore } from '@/features/messages/stores/cameraStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
/** ChatGPT's camera card: side margins of 14 and about 57% of the screen. */
const SIDE = 14;
const CARD_W = SCREEN_W - SIDE * 2;
const CARD_H = Math.round(SCREEN_H * 0.57);
const CARD_RADIUS = 30;
const CONTROLS_H = 104;
/** WhatsApp shows the video note as the circle it will become. */
const CIRCLE = CARD_W;
const RING = 4;
/** The ring rides just outside the circle so the video never hides it. */
const RING_GAP = 6;
const MAX_VIDEO_MS = 60_000;
const MORPH_MS = 320;

/**
 * The in app camera. ChatGPT's shape: a rounded card that rises from the
 * bottom with the conversation still visible behind it, one white shutter in
 * the middle, collapse on the left and the rest of the controls folded into
 * the button on the right. WhatsApp's video note: choosing it turns the card
 * into the circle that will be sent, before a single frame is recorded.
 *
 * Opened from the chat; the capture goes back through `cameraStore`.
 */
export default function ChatCameraScreen() {
  const { t } = useTranslation('messages');
  const insets = useSafeAreaInsets();
  const initialMode = useCameraStore((s) => s.mode);
  const finish = useCameraStore((s) => s.finish);

  const cameraRef = useRef<CameraView>(null);
  const [mode, setMode] = useState(initialMode);
  const [facing, setFacing] = useState<CameraType>(
    initialMode === 'video_note' ? 'front' : 'back'
  );
  const [flash, setFlash] = useState<FlashMode>('off');
  const [moreOpen, setMoreOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [shot, setShot] = useState<CameraCapturedPicture | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const startedAt = useRef(0);
  const closing = useRef(false);

  const round = mode === 'video_note';
  const frameTop = Math.round((CARD_H - CONTROLS_H - CIRCLE) / 2);

  // One value drives the morph: 0 is the card, 1 the circle.
  const morph = useSharedValue(round ? 1 : 0);
  useEffect(() => {
    morph.value = withTiming(round ? 1 : 0, {
      duration: MORPH_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [round, morph]);

  const frameStyle = useAnimatedStyle(() => ({
    height: CARD_H + (CIRCLE - CARD_H) * morph.value,
    top: frameTop * morph.value,
    borderRadius: CARD_RADIUS + (CIRCLE / 2 - CARD_RADIUS) * morph.value,
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: morph.value }));

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 100);
    return () => clearInterval(id);
  }, [recording]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    router.back();
  }, []);

  const send = useCallback(
    (media: Parameters<typeof finish>[0]) => {
      finish(media);
      close();
    },
    [close, finish]
  );

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    haptic('light');
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.CAMERA_CAPTURE, {
      kind: 'photo',
      facing,
    });
    const picture = await cameraRef.current.takePictureAsync({ quality: 0.85 });
    if (picture) setShot(picture);
  }, [facing]);

  const startVideo = useCallback(async () => {
    if (!cameraRef.current || recording) return;
    if (micPermission && !micPermission.granted) {
      const granted = await requestMicPermission();
      if (!granted.granted) return;
    }
    haptic('medium');
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.CAMERA_CAPTURE, {
      kind: 'video_note',
      facing,
    });
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_MS / 1000,
      });
      setRecording(false);
      if (!video?.uri) return;
      send({
        kind: 'video_note',
        uri: video.uri,
        mime: 'video/mp4',
        durationMs: Date.now() - startedAt.current,
        width: CIRCLE,
        height: CIRCLE,
      });
    } catch {
      setRecording(false);
    }
  }, [facing, micPermission, recording, requestMicPermission, send]);

  const stopVideo = useCallback(() => {
    if (!recording) return;
    haptic('light');
    cameraRef.current?.stopRecording();
  }, [recording]);

  const openLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    send({
      kind: asset.type === 'video' ? 'video' : 'image',
      uri: asset.uri,
      mime: asset.mimeType ?? undefined,
      fileName: asset.fileName ?? undefined,
      bytes: asset.fileSize,
      width: asset.width,
      height: asset.height,
      durationMs: asset.duration ? Math.round(asset.duration) : undefined,
    });
  }, [send]);

  const progress = Math.min(1, elapsed / MAX_VIDEO_MS);
  const ringBox = CIRCLE + (RING_GAP + RING) * 2;
  const radius = CIRCLE / 2 + RING_GAP;
  const circumference = 2 * Math.PI * radius;
  const bottom = Math.max(insets.bottom, 14);

  // The review of a still: the shot takes the card, retake on the left and
  // send on the right.
  const reviewing = shot != null;

  return (
    <View style={styles.container}>
      {/* The dim has to carry the size itself: a wrapper with no dimensions
          would leave the Pressable inside it at zero by zero. */}
      <Animated.View
        style={StyleSheet.absoluteFill}
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(140)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={close}
          accessibilityLabel={t('camera.close')}
        />
        {/* A blur that grows towards the bottom: around the circle the
            conversation would otherwise fight the controls. The mask is a
            gradient, so the blur is strong under the card and vanishes at
            the top instead of cutting a line across the screen. */}
        <MaskedView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.55)', '#000']}
              locations={[0, 0.42, 0.78]}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <BlurView intensity={64} tint="dark" style={StyleSheet.absoluteFill} />
        </MaskedView>
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(280).easing(Easing.out(Easing.cubic))}
        style={[styles.card, { bottom }]}
      >
        <Animated.View style={[styles.frame, frameStyle]}>
          {reviewing ? (
            <Image source={{ uri: shot.uri }} style={styles.fill} />
          ) : permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={styles.fill}
              facing={facing}
              flash={flash}
              mode={round ? 'video' : 'picture'}
              videoQuality="720p"
            />
          ) : (
            <View style={styles.fill} />
          )}
        </Animated.View>

        {/* The ring belongs to the circle: it fills as the note records. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ringWrap,
            { top: frameTop - (RING_GAP + RING), left: -(RING_GAP + RING) },
            ringStyle,
          ]}
        >
          <Svg width={ringBox} height={ringBox}>
            <Circle
              cx={ringBox / 2}
              cy={ringBox / 2}
              r={radius}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth={RING}
              fill="none"
            />
            <Circle
              cx={ringBox / 2}
              cy={ringBox / 2}
              r={radius}
              stroke={COLORS.white}
              strokeWidth={RING}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={circumference * (1 - progress)}
              rotation={-90}
              origin={`${ringBox / 2}, ${ringBox / 2}`}
            />
          </Svg>
        </Animated.View>

        {recording ? (
          <Animated.View entering={FadeIn.duration(140)} style={styles.timerSlot}>
            <GlassSurface radius={16} style={styles.timerPill}>
              <View style={styles.recDot} />
              <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
            </GlassSurface>
          </Animated.View>
        ) : null}

        {/* The secondary controls fold into the button on the right, the way
            ChatGPT keeps the preview clean. */}
        {moreOpen && !reviewing ? (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[styles.moreColumn, { bottom: CONTROLS_H - 8 }]}
          >
            <GlassSurface radius={22} style={styles.smallButton}>
              <Pressable
                onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
                style={styles.fillCenter}
                accessibilityRole="button"
                accessibilityLabel={t('camera.flash')}
              >
                {flash === 'off' ? (
                  <ZapOff size={19} color={COLORS.white} strokeWidth={2.25} />
                ) : (
                  <Zap
                    size={19}
                    color={COLORS.white}
                    strokeWidth={2.25}
                    fill={COLORS.white}
                  />
                )}
              </Pressable>
            </GlassSurface>
            <GlassSurface radius={22} style={styles.smallButton}>
              <Pressable
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                style={styles.fillCenter}
                accessibilityRole="button"
                accessibilityLabel={t('camera.flip')}
              >
                <RefreshCw size={19} color={COLORS.white} strokeWidth={2.25} />
              </Pressable>
            </GlassSurface>
            <GlassSurface radius={22} style={styles.smallButton}>
              <Pressable
                onPress={openLibrary}
                style={styles.fillCenter}
                accessibilityRole="button"
                accessibilityLabel={t('attachMenu.photos')}
              >
                <Images size={19} color={COLORS.white} strokeWidth={2.25} />
              </Pressable>
            </GlassSurface>
          </Animated.View>
        ) : null}

        <View style={[styles.controls, { height: CONTROLS_H }]}>
          {reviewing ? (
            <>
              <Pressable
                onPress={() => setShot(null)}
                style={styles.reviewButton}
                accessibilityRole="button"
                accessibilityLabel={t('camera.retake')}
              >
                <Text style={styles.reviewText}>{t('camera.retake')}</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  send({
                    kind: 'image',
                    uri: shot.uri,
                    mime: 'image/jpeg',
                    width: shot.width,
                    height: shot.height,
                  })
                }
                style={[styles.reviewButton, styles.reviewSend]}
                accessibilityRole="button"
                accessibilityLabel={t('camera.send')}
              >
                <Text style={[styles.reviewText, styles.reviewSendText]}>
                  {t('camera.send')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <GlassSurface radius={22} style={styles.sideButton}>
                <Pressable
                  onPress={close}
                  style={styles.fillCenter}
                  accessibilityRole="button"
                  accessibilityLabel={t('camera.close')}
                >
                  <ChevronDown size={22} color={COLORS.white} strokeWidth={2.25} />
                </Pressable>
              </GlassSurface>

              <View style={styles.center}>
                {!recording ? (
                  <View style={styles.modeRow}>
                    {(['photo', 'video_note'] as const).map((m) => (
                      <Pressable
                        key={m}
                        onPress={() => {
                          haptic('selection');
                          setMode(m);
                          if (m === 'video_note') setFacing('front');
                        }}
                        hitSlop={6}
                        style={styles.modeChip}
                        accessibilityRole="button"
                        accessibilityLabel={t(
                          m === 'photo' ? 'camera.photo' : 'camera.videoNote'
                        )}
                      >
                        <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>
                          {t(m === 'photo' ? 'camera.photo' : 'camera.videoNote')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Pressable
                  onPress={() => {
                    if (!round) return void takePhoto();
                    if (recording) stopVideo();
                    else void startVideo();
                  }}
                  style={styles.shutterOuter}
                  accessibilityRole="button"
                  accessibilityLabel={t(recording ? 'camera.stop' : 'camera.capture')}
                >
                  <View
                    style={[
                      styles.shutterInner,
                      round && styles.shutterVideo,
                      recording && styles.shutterRecording,
                    ]}
                  />
                </Pressable>
              </View>

              <GlassSurface radius={22} style={styles.sideButton}>
                <Pressable
                  onPress={() => {
                    haptic('selection');
                    setMoreOpen((open) => !open);
                  }}
                  style={styles.fillCenter}
                  accessibilityRole="button"
                  accessibilityLabel={t('camera.more')}
                >
                  {moreOpen ? (
                    <X size={21} color={COLORS.white} strokeWidth={2.25} />
                  ) : (
                    <MoreHorizontal size={22} color={COLORS.white} strokeWidth={2.25} />
                  )}
                </Pressable>
              </GlassSurface>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' },
  card: { position: 'absolute', left: SIDE, width: CARD_W, height: CARD_H },
  frame: {
    position: 'absolute',
    left: 0,
    width: CARD_W,
    overflow: 'hidden',
    backgroundColor: '#101012',
  },
  fill: { width: CARD_W, height: CARD_H },
  fillCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ringWrap: { position: 'absolute' },
  timerSlot: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center' },
  timerPill: {
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  timerText: {
    color: COLORS.white,
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
    fontVariant: ['tabular-nums'],
  },
  moreColumn: { position: 'absolute', right: 8, alignItems: 'center', gap: 10 },
  smallButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  sideButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  center: { alignItems: 'center', gap: 8 },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeChip: { paddingHorizontal: 8, paddingVertical: 2 },
  modeText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  modeTextOn: { color: COLORS.white },
  shutterOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3.5,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 53,
    height: 53,
    borderRadius: 27,
    backgroundColor: COLORS.white,
  },
  shutterVideo: { backgroundColor: '#FF3B30' },
  shutterRecording: { width: 26, height: 26, borderRadius: 7 },
  reviewButton: {
    flex: 1,
    height: 48,
    marginHorizontal: 6,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  reviewSend: { backgroundColor: COLORS.white },
  reviewText: { color: COLORS.white, fontSize: 16, fontFamily: 'Archivo_600SemiBold' },
  reviewSendText: { color: COLORS.black },
});

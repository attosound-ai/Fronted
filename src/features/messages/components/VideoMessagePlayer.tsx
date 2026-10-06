/**
 * VideoMessagePlayer — renders a video message inside a gifted-chat bubble.
 *
 * Lazy-loads expo-video on first render to avoid crashing when the native
 * module isn't linked yet.
 */

import { useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Pressable, StyleSheet, Dimensions } from 'react-native';
import type { VideoPlayer } from 'expo-video';
import { Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { hlsToMp4Fallback } from '@/lib/media/cloudinaryUrl';
import { aspectOf, mediaBox } from '../media/mediaBox';
import { useCallPlaybackVideo } from '@/lib/callAudio/session/useCallPlaybackVideo';
import {
  videoLoadStarted,
  videoLoadCompleted,
  videoError,
  videoFallbackUsed,
} from '@/lib/telemetry/videoTelemetry';
import { COLORS } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const VIDEO_WIDTH = SCREEN_WIDTH * 0.65;
// A vertical clip may be this tall before it is narrowed instead.
const VIDEO_MAX_HEIGHT = 360;

interface VideoMessagePlayerProps {
  videoUrl: string;
  /** width / height of the video, from the message. Without it the player asks
   *  the video itself once it has loaded. */
  aspect?: number | null;
  /** Widest the bubble gets; the thread passes its media width. */
  maxWidth?: number;
}

export function VideoMessagePlayer({
  videoUrl,
  aspect = null,
  maxWidth = VIDEO_WIDTH,
}: VideoMessagePlayerProps) {
  const { t } = useTranslation('messages');
  // The bubble takes the shape of the video (WhatsApp): tall for 9:16, wide
  // for 16:9. It used to be a fixed 16:9 strip that cropped vertical clips.
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const box = mediaBox(aspect ?? naturalAspect, maxWidth, VIDEO_MAX_HEIGHT);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [VideoModule, setVideoModule] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    import('expo-video')
      .then((mod) => setVideoModule(mod))
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <View style={[styles.container, box]}>
        <Text style={styles.fallbackText}>{t('media.videoUnavailable')}</Text>
      </View>
    );
  }

  if (!VideoModule) {
    return (
      <View style={[styles.container, box]}>
        <View style={styles.placeholder}>
          <Play size={24} color={COLORS.white} fill={COLORS.white} />
        </View>
      </View>
    );
  }

  const { VideoView, useVideoPlayer } = VideoModule;

  return (
    <VideoViewWrapper
      VideoView={VideoView}
      useVideoPlayer={useVideoPlayer}
      videoUrl={videoUrl}
      box={box}
      onNaturalAspect={aspect == null ? setNaturalAspect : undefined}
    />
  );
}

/**
 * Separate component so the hook call is unconditional.
 */
function VideoViewWrapper({
  VideoView,
  useVideoPlayer,
  videoUrl,
  box,
  onNaturalAspect,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  VideoView: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useVideoPlayer: any;
  videoUrl: string;
  box: { width: number; height: number };
  onNaturalAspect?: (aspect: number) => void;
}) {
  const player = useVideoPlayer(
    videoUrl,
    (p: { loop: boolean; audioMixingMode: string }) => {
      p.loop = false;
      // Never seize the audio session (default 'auto' = Playback, no microphone) —
      // a chat video must not be able to strip the mic from an incoming/active call.
      // See VideoMedia for the full rationale.
      p.audioMixingMode = 'mixWithOthers';
    }
  );

  // Engine call (Sep 15 2026): while `playback.engineVideo` is latched the
  // player stays muted and the message's audio plays through the engine session
  // (from the MP4 rendition, the session cannot read HLS). Explicit claim: the
  // tap overlay below starts it; the native controls are hidden in that mode.
  const engine = useCallPlaybackVideo(
    player as VideoPlayer,
    videoUrl,
    'chat_video',
    {
      type: 'file',
      kind: 'message',
      uri: hlsToMp4Fallback(videoUrl) ?? videoUrl,
      isVideo: true,
    },
    { claimPolicy: 'explicit', active: false }
  );

  // If the adaptive (HLS) source can't be delivered, fall back to optimized MP4.
  // Also reports load-time / error telemetry tagged to the chat surface.
  const triedFallback = useRef(false);
  const loadStartedAt = useRef(0);
  const loadReported = useRef(false);
  useEffect(() => {
    if (!player) return;
    triedFallback.current = false;
    loadReported.current = false;
    loadStartedAt.current = Date.now();
    videoLoadStarted({ surface: 'chat' }, videoUrl);

    const reportReady = () => {
      if (loadReported.current) return;
      loadReported.current = true;
      videoLoadCompleted({ surface: 'chat' }, Date.now() - loadStartedAt.current);
    };
    if (player.status === 'readyToPlay') reportReady();

    const sub = player.addListener('statusChange', ({ status }: { status: string }) => {
      if (status === 'readyToPlay') {
        reportReady();
        return;
      }
      if (status === 'error') {
        const fallback = !triedFallback.current ? hlsToMp4Fallback(videoUrl) : null;
        videoError({ surface: 'chat' }, { source: videoUrl, willFallback: !!fallback });
        if (!fallback) return;
        triedFallback.current = true;
        loadReported.current = false;
        loadStartedAt.current = Date.now();
        setTimeout(() => {
          try {
            // replaceAsync, not replace: Expo documents that on iOS `replace` "loads
            // the asset data synchronously on the UI thread and can block it for
            // extended periods of time". Blocking the UI thread during a call setup
            // window is exactly what we're eliminating.
            void player.replaceAsync(fallback);
            videoFallbackUsed({ surface: 'chat' });
          } catch {
            // player disposed — ignore
          }
        }, 500);
      }
    });
    return () => sub.remove();
  }, [player, videoUrl]);

  // Messages sent before sizes were stored have no proportions: read them from
  // the video once its tracks are known, so those bubbles get their shape too.
  useEffect(() => {
    if (!player || !onNaturalAspect) return;
    const report = (size?: { width?: number; height?: number } | null) => {
      const value = aspectOf(size?.width, size?.height);
      if (value !== null) onNaturalAspect(value);
    };
    let sub: { remove: () => void } | null = null;
    try {
      sub = player.addListener(
        'sourceLoad',
        (payload: {
          availableVideoTracks?: Array<{ size?: { width?: number; height?: number } }>;
        }) => report(payload?.availableVideoTracks?.[0]?.size)
      );
    } catch {
      // An older player without this event: the bubble keeps the default shape.
    }
    return () => sub?.remove();
  }, [player, onNaturalAspect]);

  if (engine.engineMode) {
    return (
      <View style={[styles.container, box]}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={() => void engine.toggle()}>
          {!engine.isPlaying && (
            <View style={styles.placeholder}>
              <Play size={24} color={COLORS.white} fill={COLORS.white} />
            </View>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, box]}>
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    color: COLORS.gray[500],
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
    fontFamily: 'Archivo_400Regular',
  },
});

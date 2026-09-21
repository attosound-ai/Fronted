import { memo, useCallback, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Play,
  Pause,
  Images,
  RotateCcw,
  RotateCw,
  Video as VideoIcon,
  Music4,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/constants/theme';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useAudioPlayback } from '@/features/feed/hooks/useAudioPlayback';
import { AudioWaveform } from '@/features/feed/components/AudioWaveform';
import { useRegisterNowPlaying } from '@/lib/callAudio/useRegisterNowPlaying';
import type { SharedPost } from '../types';

export const POST_CARD_WIDTH = 248;

interface SharedPostCardProps {
  post: SharedPost;
  /** A note the sender wrote with the post. */
  caption?: string | null;
  /** The card sits on a light bubble (own or creator gold). */
  onLight: boolean;
}

/**
 * A post shared into the chat: its cover, who made it and what it is, with
 * the audio playable right here and a tap that opens the post itself. The
 * card is the message, the way a link preview is in iMessage or Telegram,
 * except this one plays.
 */
function SharedPostCardInner({ post, caption, onLight }: SharedPostCardProps) {
  const { t } = useTranslation('messages');
  const audio = post.audioUrl ?? undefined;
  const {
    isPlaying,
    progress,
    currentTime,
    duration,
    barAmplitudes,
    togglePlayPause,
    seekToFraction,
    seekBy,
    durationSec,
    currentSec,
  } = useAudioPlayback(audio);
  const waveWidth = useRef(0);
  useRegisterNowPlaying({ kind: 'message', uri: audio ?? '' }, isPlaying);

  const cover = post.coverUrl || post.thumbnailUrl || post.imageUrl || null;
  const fg = onLight ? COLORS.black : COLORS.white;
  const dim = onLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
  const track = onLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.28)';

  const open = useCallback(() => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.SHARED_POST_OPENED, {
      post_id: post.id,
      post_type: post.type,
    });
    router.push({ pathname: '/post/[id]', params: { id: post.id } });
  }, [post.id, post.type]);

  const toggle = useCallback(() => {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.SHARED_POST_PLAYED, {
      post_id: post.id,
      action: isPlaying ? 'pause' : 'play',
    });
    togglePlayPause();
  }, [isPlaying, post.id, togglePlayPause]);

  const kindLabel =
    post.type === 'audio'
      ? t('sharedPost.audio')
      : post.type === 'video' || post.type === 'reel'
        ? t('sharedPost.video')
        : t('sharedPost.photo');

  const remaining = Math.max(0, (durationSec || post.duration || 0) - currentSec);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={post.title || kindLabel}
      >
        <View style={styles.coverWrap}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, styles.coverEmpty]}>
              {post.type === 'audio' ? (
                <Music4 size={30} color={COLORS.white} strokeWidth={1.8} />
              ) : post.type === 'video' || post.type === 'reel' ? (
                <VideoIcon size={30} color={COLORS.white} strokeWidth={1.8} />
              ) : (
                <Images size={30} color={COLORS.white} strokeWidth={1.8} />
              )}
            </View>
          )}
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: fg }]} numberOfLines={2}>
            {post.title || post.description || t('sharedPost.untitled')}
          </Text>
          <Text style={[styles.author, { color: dim }]} numberOfLines={1}>
            {post.authorName ? `@${post.authorName}` : ''}
          </Text>
        </View>
      </Pressable>

      {/* The same transport the post has, inside the bubble: back and
          forward fifteen, play, the waveform to scrub, time run and time
          left. */}
      {audio ? (
        <View style={styles.player}>
          <View style={styles.transport}>
            <Pressable
              onPress={() => seekBy(-15)}
              hitSlop={8}
              style={styles.skip}
              accessibilityRole="button"
              accessibilityLabel={t('sharedPost.back15')}
            >
              <RotateCcw size={31} color={fg} strokeWidth={1.5} />
              <Text style={[styles.skipText, { color: fg }]}>15</Text>
            </Pressable>
            <Pressable
              onPress={toggle}
              style={[styles.play, { backgroundColor: fg }]}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? t('media.pause') : t('media.play')}
            >
              {isPlaying ? (
                <Pause
                  size={19}
                  color={onLight ? COLORS.white : COLORS.black}
                  fill={onLight ? COLORS.white : COLORS.black}
                />
              ) : (
                <Play
                  size={19}
                  color={onLight ? COLORS.white : COLORS.black}
                  fill={onLight ? COLORS.white : COLORS.black}
                  style={styles.playGlyph}
                />
              )}
            </Pressable>
            <Pressable
              onPress={() => seekBy(15)}
              hitSlop={8}
              style={styles.skip}
              accessibilityRole="button"
              accessibilityLabel={t('sharedPost.forward15')}
            >
              <RotateCw size={31} color={fg} strokeWidth={1.5} />
              <Text style={[styles.skipText, { color: fg }]}>15</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.waveWrap}
            onLayout={(e) => {
              waveWidth.current = e.nativeEvent.layout.width;
            }}
            onPress={(e) => {
              if (waveWidth.current > 0) {
                seekToFraction(e.nativeEvent.locationX / waveWidth.current);
              }
            }}
            accessibilityRole="adjustable"
            accessibilityLabel={t('sharedPost.timeline')}
          >
            <AudioWaveform
              barCount={34}
              barWidth={2.5}
              barGap={2}
              maxHeight={26}
              minHeight={3}
              color={track}
              playedColor={fg}
              playing={isPlaying}
              progress={progress}
              amplitudes={barAmplitudes}
            />
          </Pressable>

          <View style={styles.times}>
            <Text style={[styles.time, { color: dim }]}>{currentTime}</Text>
            <Text style={[styles.time, { color: dim }]}>
              {`-${formatDuration(remaining)}`}
            </Text>
          </View>
        </View>
      ) : null}

      {caption ? <Text style={[styles.caption, { color: fg }]}>{caption}</Text> : null}
    </View>
  );
}

export const SharedPostCard = memo(SharedPostCardInner);

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: { width: POST_CARD_WIDTH, gap: 10 },
  // WhatsApp's photo with a caption: the picture runs edge to edge under
  // the bubble's top corners and cuts straight across the bottom, so it
  // flows into the text instead of floating above it.
  coverWrap: {
    width: POST_CARD_WIDTH,
    height: 150,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  cover: { width: '100%', height: '100%', backgroundColor: '#1A1A1D' },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  player: { gap: 6, paddingHorizontal: 10 },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  // The number rides inside the circular arrow, centred, the way the feed
  // and Apple draw it: never under the stroke.
  skip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: {
    position: 'absolute',
    fontSize: 9.5,
    lineHeight: 11,
    marginTop: 3,
    fontFamily: 'Archivo_700Bold',
  },
  play: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { marginLeft: 2 },
  waveWrap: { height: 28, justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: {
    fontSize: 11,
    fontFamily: 'Archivo_500Medium',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: 15,
    fontFamily: 'Archivo_400Regular',
    paddingHorizontal: 10,
    paddingTop: 2,
  },
  // The title needs room to breathe under the picture.
  body: { gap: 2, paddingHorizontal: 10, paddingTop: 4 },
  kind: {
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: { fontSize: 15, fontFamily: 'Archivo_600SemiBold' },
  author: { fontSize: 12, fontFamily: 'Archivo_400Regular' },
});

import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { AudioWaveform } from '../AudioWaveform';
import { useAudioPlayback } from '../../hooks/useAudioPlayback';
import { useCallPlayback } from '@/lib/callAudio/session/useCallPlayback';
import { useNowPlayingStore } from '@/stores/nowPlayingStore';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import { claimFeedAudio, releaseFeedAudio } from '@/stores/feedAudioStore';
import { haptic } from '@/lib/haptics/hapticService';
import type { FeedPost } from '@/types/post';

interface Props {
  post: FeedPost;
}

/**
 * An audio post that carries cover art, presented the way a record is: the
 * artwork sits between the two skip buttons, play and pause live on the
 * artwork itself, and a scrub line with the times runs underneath. The card's
 * header and caption already carry the author and the text, so nothing is
 * repeated here. Posts without a cover keep the waveform row in AudioMedia,
 * so this is purely additive.
 *
 * The playback plumbing is the same as AudioMedia's on purpose: one audible
 * owner in the feed, videos muted while audio plays, and the in call session
 * taking over when the engine is latched.
 */
export function AudioCoverMedia({ post }: Props) {
  const { width } = useWindowDimensions();
  const barWidth = useRef(0);

  const engine = useCallPlayback(
    post.id,
    'feed_audio',
    post.audioUrl
      ? {
          type: 'file',
          kind: 'post',
          uri: post.audioUrl,
          title: post.title,
          postId: post.id,
        }
      : null
  );

  const {
    isPlaying,
    isLoaded,
    isBuffering,
    progress,
    currentTime,
    duration,
    barAmplitudes,
    togglePlayPause,
    seekToFraction,
    seekBy,
    pause,
  } = useAudioPlayback(post.audioUrl, engine);

  const setNowPlaying = useNowPlayingStore((s) => s.setNowPlaying);
  useEffect(() => {
    if (isPlaying && post.audioUrl) {
      setNowPlaying({
        kind: 'post',
        uri: post.audioUrl,
        postId: post.id,
        title: post.title,
      });
    }
  }, [isPlaying, post.audioUrl, post.id, post.title, setNowPlaying]);

  useEffect(() => {
    if (isPlaying) {
      if (engine.engineMode) {
        claimFeedAudio(post.id, () => void engine.pause());
      } else {
        claimFeedAudio(post.id, () => pause());
      }
      useVideoSoundStore.getState().setMuted(true);
    } else {
      releaseFeedAudio(post.id);
    }
    return () => releaseFeedAudio(post.id);
  }, [isPlaying, post.id, pause, engine.engineMode, engine.pause]);

  const showLoading = (!isLoaded || isBuffering) && isPlaying;
  // The artwork leaves room on both sides for the skip controls, the way a
  // player lays them out: back, record, forward.
  const artSize = Math.min(width - (SIDE_BUTTON + SIDE_GAP) * 2, width * 0.62);
  // The wave shares its row with the play button: fit as many bars as the
  // remaining width holds, so it can never run into the button.
  const waveBars = Math.max(
    24,
    Math.floor(
      (width - META_PADDING * 2 - PLAY_BUTTON - PLAY_GAP) / (WAVE_BAR + WAVE_GAP)
    )
  );
  // Only for the accessibility label: the caption is rendered by the card.
  const label = post.title?.trim() || post.description?.trim() || '';

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <Pressable
          onPress={() => {
            void haptic('light');
            seekBy(-SKIP_SECONDS);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${SKIP_SECONDS}`}
          hitSlop={8}
          style={({ pressed }) => [styles.sideButton, pressed && styles.pressed]}
        >
          <RotateCcw size={24} color="#FFFFFF" strokeWidth={2} />
          <Text variant="caption" style={styles.sideLabel}>
            {SKIP_SECONDS}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            void haptic('light');
            togglePlayPause();
          }}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={[styles.art, { width: artSize, height: artSize }]}
        >
          {post.coverUrl ? (
            <Image
              source={{ uri: post.coverUrl }}
              style={styles.image}
              resizeMode="cover"
              accessible={false}
            />
          ) : (
            <View style={[styles.image, styles.imageFallback]} />
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            void haptic('light');
            seekBy(SKIP_SECONDS);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${SKIP_SECONDS}`}
          hitSlop={8}
          style={({ pressed }) => [styles.sideButton, pressed && styles.pressed]}
        >
          <RotateCw size={24} color="#FFFFFF" strokeWidth={2} />
          <Text variant="caption" style={styles.sideLabel}>
            {SKIP_SECONDS}
          </Text>
        </Pressable>
      </View>

      <View style={styles.meta}>
        {/* No title and no author here on purpose: the card's header already
            names the author and the caption sits under the actions. Repeating
            either would say the same thing three times. */}
        {/* The same waveform a post without a cover shows, so the timeline
            reads identically either way; tapping it seeks. */}
        <View style={styles.waveRow}>
          {/* Play lives beside the wave, never over the artwork (David, Sep 21). */}
          <Pressable
            onPress={() => {
              void haptic('light');
              togglePlayPause();
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={6}
            style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
          >
            {showLoading ? (
              <ActivityIndicator color="#000000" />
            ) : isPlaying ? (
              <Pause size={18} color="#000000" fill="#000000" />
            ) : (
              <Play size={18} color="#000000" fill="#000000" style={styles.playIcon} />
            )}
          </Pressable>
          <Pressable
            onPress={(e) => {
              if (barWidth.current > 0) {
                const x = (e.nativeEvent as unknown as { locationX: number }).locationX;
                seekToFraction(Math.max(0, Math.min(1, x / barWidth.current)));
              }
            }}
            onLayout={(e) => {
              barWidth.current = e.nativeEvent.layout.width;
            }}
            accessibilityRole="adjustable"
            style={styles.waveWrap}
          >
            <AudioWaveform
              barCount={64}
              barWidth={3}
              barGap={3}
              maxHeight={48}
              minHeight={3}
              color="#3A3A3A"
              playedColor="#FFFFFF"
              playing={isPlaying}
              progress={progress}
              amplitudes={barAmplitudes}
            />
          </Pressable>
        </View>

        <View style={styles.times}>
          <Text variant="caption" style={styles.time}>
            {currentTime}
          </Text>
          <Text variant="caption" style={styles.time}>
            {duration}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Seconds a side button jumps, the step every audio player uses. */
const SKIP_SECONDS = 15;
const PLAY_BUTTON = 40;
const PLAY_GAP = 10;
const WAVE_BAR = 3;
const WAVE_GAP = 3;
const META_PADDING = 16;
const SIDE_BUTTON = 56;
const SIDE_GAP = 10;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    paddingTop: 10,
  },
  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIDE_GAP,
  },
  sideButton: {
    width: SIDE_BUTTON,
    height: SIDE_BUTTON,
    borderRadius: SIDE_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
  },
  sideLabel: {
    color: '#9A9A9A',
    marginTop: -2,
    fontSize: 10,
  },
  art: {
    backgroundColor: '#141414',
    borderRadius: 10,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    backgroundColor: '#1A1A1A',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playIcon: {
    marginLeft: 3,
  },
  meta: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  waveWrap: {
    flex: 1,
    overflow: 'hidden',
    height: 52,
    justifyContent: 'center',
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: '#777777',
  },
  pressed: {
    opacity: 0.75,
  },
});

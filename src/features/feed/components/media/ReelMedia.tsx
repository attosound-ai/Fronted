import { useState, useEffect, useRef, useCallback } from 'react';
import { View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Smartphone, VolumeX, Volume2, Play } from 'lucide-react-native';
import { cloudinaryVideoMp4 } from '@/lib/media/cloudinaryUrl';
import { videoPlaybackToggled } from '@/lib/telemetry/videoTelemetry';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useVideoStream } from '@/hooks/useVideoStream';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { useCallAwareVideoAudio } from '@/hooks/useCallAwareVideoAudio';
import { useRegisterNowPlaying } from '@/lib/callAudio/useRegisterNowPlaying';
import { VideoPoster } from '@/components/ui/VideoPoster';
import { VideoProgressBar } from '@/components/ui/VideoProgressBar';
import { useVideoSoundStore } from '@/stores/videoSoundStore';
import { useDoubleTapLike } from '@/features/feed/hooks/useDoubleTapLike';
import type { FeedPost, PostAuthor } from '@/types/post';
import { COLORS } from '@/constants/theme';
import { VideoOverlayHeader } from './VideoOverlayHeader';
import { HeartBurst } from './HeartBurst';

interface ReelMediaProps {
  post: FeedPost;
  isVisible?: boolean;
  onProfilePress?: (author: PostAuthor) => void;
  onFollow?: (userId: number) => void;
  onBookmark?: () => void;
  onReport?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Double tap → like (Instagram-style), with a heart burst. */
  onDoubleTap?: () => void;
}

export function ReelMedia({
  post,
  isVisible = false,
  onProfilePress,
  onFollow,
  onBookmark,
  onReport,
  onEdit,
  onDelete,
  onDoubleTap,
}: ReelMediaProps) {
  const { contentWidth } = useDeviceLayout();
  // Pause when the screen loses focus so audio never lingers behind another screen.
  const isFocused = useIsFocused();
  // Global mute shared across every video (Instagram-style).
  const isMuted = useVideoSoundStore((s) => s.isMuted);
  const toggleMuted = useVideoSoundStore((s) => s.toggleMuted);
  // Tap-to-pause: a manual pause that overrides auto-play-when-visible.
  const [userPaused, setUserPaused] = useState(false);
  // Live "should this be playing" flag for the deferred single-tap handler, so a
  // tap that lands just before scrolling away never resumes an off-screen video.
  const playableRef = useRef(false);
  playableRef.current = isVisible && isFocused;

  // Reels render full-screen: use a fixed 1080p MP4 (not adaptive HLS) so the
  // image is sharp from the first frame. See cloudinaryVideoMp4 for the rationale.
  const videoUrl = cloudinaryVideoMp4(post.videoUrl) ?? null;

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = true;
    p.muted = useVideoSoundStore.getState().isMuted;
    // Call-aware from creation (see VideoMedia): don't hijack an active call's session.
    // ALWAYS mixWithOthers — see VideoMedia for the full rationale. 'auto' takes the
    // Playback category (no mic); on a VoIP-push cold launch the player mounts before
    // activeCall is known, stealing the session and dropping the call.
    p.audioMixingMode = 'mixWithOthers';
  });

  // During a call, mix instead of stealing the audio session (keeps the call's mic).
  useCallAwareVideoAudio(player);

  // First-frame readiness (drives the poster) + load/error telemetry.
  const isReady = useVideoStream(player, videoUrl, isVisible && isFocused, {
    surface: 'reel_media',
    postId: post.id,
  });
  const { position, duration } = useVideoProgress(player);

  // This reel is transmittable into a live call (📡): register it as now-playing
  // while it's the active reel; the injector extracts its audio track on demand.
  useRegisterNowPlaying(
    videoUrl ? { kind: 'reel', uri: videoUrl, isVideo: true, postId: post.id } : null,
    isVisible && isFocused && !userPaused
  );

  // Tap the video to pause/resume.
  const togglePlayPause = useCallback(() => {
    if (!player) return;
    const next = !userPaused;
    setUserPaused(next);
    try {
      if (next) player.pause();
      // Only resume if still visible & focused (the single-tap action is deferred,
      // so it can fire just after scrolling away).
      else if (playableRef.current) player.play();
    } catch {
      // player disposed — ignore
    }
    videoPlaybackToggled(
      { surface: 'reel_media', postId: post.id },
      next ? 'pause' : 'play',
      Math.round(position * 1000)
    );
  }, [player, userPaused, post.id, position]);

  // Single tap = pause/resume, double tap = like + heart burst.
  const { handleTap, heartScale, heartOpacity } = useDoubleTapLike({
    onSingleTap: togglePlayPause,
    onDoubleTap,
  });

  // A manual tap-pause wins while visible; scrolling away clears it so the reel
  // auto-plays again when it returns into view.
  useEffect(() => {
    if (!player) return;
    if (isVisible && isFocused) {
      if (!userPaused) player.play();
    } else {
      player.pause();
      if (userPaused) setUserPaused(false);
    }
  }, [isVisible, isFocused, userPaused, player]);

  // Sync this player whenever the shared mute state flips so one video's
  // toggle applies to every other mounted video.
  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  if (!videoUrl) {
    return (
      <View
        style={[styles.placeholder, { width: contentWidth, height: contentWidth * 1.6 }]}
      >
        <Smartphone size={48} color="#666" strokeWidth={1.5} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: contentWidth, height: contentWidth * 1.6 }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Poster shown until the stream produces its first frame */}
      <VideoPoster uri={post.thumbnailUrl} visible={!isReady} />

      {/* Thin progress line at the bottom edge */}
      <VideoProgressBar position={position} duration={duration} showTime={false} />

      {/* Single tap = pause/resume, double tap = like. Below the overlays (author
          / menu / mute), which render after and capture their own taps. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />

      {/* Pause indicator while tap-paused. */}
      {userPaused && (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <View style={styles.pauseBadge}>
            <Play size={38} color="#FFF" fill="#FFF" />
          </View>
        </View>
      )}

      {/* Double-tap like heart burst */}
      <HeartBurst scale={heartScale} opacity={heartOpacity} />

      {/* Author row (avatar · name · follow · ⋯) overlaid at the top edge. */}
      <VideoOverlayHeader
        post={post}
        onProfilePress={onProfilePress}
        onFollow={onFollow}
        onBookmark={onBookmark}
        onReport={onReport}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {/* Bottom gradient (visual only — description is shown outside the reel) */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.5)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* Mute toggle — bottom-right corner (must render after gradient to be on top) */}
      <TouchableOpacity
        style={styles.muteButton}
        onPress={toggleMuted}
        activeOpacity={0.7}
      >
        {isMuted ? (
          <VolumeX size={20} color="#FFF" strokeWidth={2.25} />
        ) : (
          <Volume2 size={20} color="#FFF" strokeWidth={2.25} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background.primary,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  placeholder: {
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Mute
  muteButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    padding: 6,
  },

  // Bottom overlay
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 44,
    paddingHorizontal: 12,
    paddingTop: 24,
  },
});

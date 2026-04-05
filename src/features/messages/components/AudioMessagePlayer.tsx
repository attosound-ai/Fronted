/**
 * AudioMessagePlayer — renders an audio message inside a chat bubble.
 *
 * Uses expo-audio (SDK 55+) instead of deprecated expo-av.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Play, Pause } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { COLORS, SPACING } from '@/constants/theme';

interface AudioMessagePlayerProps {
  audioUrl: string;
}

export function AudioMessagePlayer({ audioUrl }: AudioMessagePlayerProps) {
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);
  const [loadError, setLoadError] = useState(false);

  const isPlaying = status.playing;
  const duration = status.duration * 1000; // seconds → ms
  const position = status.currentTime * 1000;

  useEffect(() => {
    if (status.error) setLoadError(true);
  }, [status.error]);

  const togglePlayback = useCallback(() => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch {
      setLoadError(true);
    }
  }, [isPlaying, player]);

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? position / duration : 0;

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.time}>Audio unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
        {isPlaying ? (
          <Pause size={18} color={COLORS.white} fill={COLORS.white} />
        ) : (
          <Play size={18} color={COLORS.white} fill={COLORS.white} />
        )}
      </TouchableOpacity>

      <View style={styles.waveform}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.time}>{formatTime(isPlaying ? position : duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    gap: 10,
    minWidth: 200,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveform: {
    flex: 1,
    gap: 4,
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 2,
  },
  time: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Archivo_400Regular',
  },
});

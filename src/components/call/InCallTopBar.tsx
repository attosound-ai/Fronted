import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  Volume1,
  Volume2,
  Phone,
  Grid3x3,
  SlidersHorizontal,
  Radio,
  Square,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { GlassSurface } from '@/components/navigation/GlassSurface';
import { HeaderBlur } from '@/components/ui/HeaderBlur';
import { useCallStore } from '@/stores/callStore';
import { useNowPlayingStore } from '@/stores/nowPlayingStore';
import { isCallConnected, isOnCallScreen } from '@/hooks/useInCallChrome';
import { hangUpCall, toggleMuteCall, toggleSpeaker } from '@/hooks/useTwilioVoice';
import { useCallAudioInjection } from '@/hooks/useCallAudioInjection';
import { preloadCallSounds } from '@/lib/sound/callSounds';
import { haptic } from '@/lib/haptics/hapticService';
import { openKeypad } from './DtmfKeypadHost';
import { openMixer } from './MixerHost';
import { useFeatureFlag } from '@/lib/analytics';
import { AUDIO_INJECTION_FLAG } from '@/lib/callAudio/createAudioInjector';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function InCallTopBar() {
  const { t } = useTranslation('calls');
  const activeCall = useCallStore((s) => s.activeCall);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  // Mixer button shows only when the audio-injection feature is on (same flag).
  const mixerEnabled = useFeatureFlag(AUDIO_INJECTION_FLAG) === true;
  // General "transmit app audio into the call" control: injects whatever the
  // user last played in the feed/reels (nowPlaying), not a specific post.
  const { canInject, isInjecting, inject, stop } = useCallAudioInjection();
  const nowPlaying = useNowPlayingStore((s) => s.track);

  // Transmit is a MODE, not a one-shot: tap 📡 once → from then on EVERYTHING the
  // app plays (reel / post / video / beat — whatever becomes nowPlaying) is pushed
  // into the call; tap again → stop. So it works regardless of what's on screen.
  const [transmitMode, setTransmitMode] = useState(false);

  const onTransmit = () => {
    void haptic('selection');
    setTransmitMode((m) => !m);
  };

  // While transmit mode is ON, follow whatever is currently playing — re-inject as
  // the source changes so switching content keeps streaming into the call.
  useEffect(() => {
    if (transmitMode && nowPlaying) void inject(nowPlaying);
  }, [transmitMode, nowPlaying?.uri, inject]);

  // Stop the moment the user turns the mode off.
  useEffect(() => {
    if (!transmitMode && isInjecting) void stop('user_stopped');
  }, [transmitMode, isInjecting, stop]);

  const isConnected = isCallConnected(activeCall?.state);

  // Warm the DTMF + end-call players the moment a call is live, so the first
  // keypad tap / hang-up is instant (no allocation on the interaction).
  useEffect(() => {
    if (isConnected) preloadCallSounds();
  }, [isConnected]);

  // Hide on the dedicated call screen (it has its own controls)
  const onCallScreen = isOnCallScreen(pathname);

  // Elapsed timer
  useEffect(() => {
    if (!isConnected || !activeCall?.connectedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      const diff = Math.floor(
        (Date.now() - new Date(activeCall.connectedAt!).getTime()) / 1000
      );
      setElapsed(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isConnected, activeCall?.connectedAt]);

  if (!isConnected || onCallScreen) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      {/* Green frosted-blur that dissolves downward (like the search bar's blur,
          but green) — an OVERLAY that does NOT push content (reels/feed layouts
          untouched); screens reserve room below via useScreenTopInset. Green
          lives ONLY here, never on the screen headers. */}
      <HeaderBlur tintRgb="34, 197, 94" fadeExtend={28} />
      <View style={styles.content}>
        <View style={styles.timerContainer}>
          <View style={styles.liveDot} />
          <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
        </View>

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity
            style={[styles.glassBtnInner, activeCall?.isMuted && styles.glassBtnActive]}
            onPress={toggleMuteCall}
          >
            {activeCall?.isMuted ? (
              <MicOff size={20} color="#FFF" strokeWidth={2.25} />
            ) : (
              <Mic size={20} color="#FFF" strokeWidth={2.25} />
            )}
          </TouchableOpacity>
        </GlassSurface>

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity
            style={[styles.glassBtnInner, activeCall?.isSpeaker && styles.glassBtnActive]}
            onPress={toggleSpeaker}
          >
            {activeCall?.isSpeaker ? (
              <Volume2 size={20} color="#FFF" strokeWidth={2.25} />
            ) : (
              <Volume1 size={20} color="#FFF" strokeWidth={2.25} />
            )}
          </TouchableOpacity>
        </GlassSurface>

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity style={styles.glassBtnInner} onPress={openKeypad}>
            <Grid3x3 size={20} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>
        </GlassSurface>

        {/* Transmit the app's currently-playing audio INTO the call (flag-gated).
            Red Square while transmitting; the Radio dims when nothing has played. */}
        {canInject ? (
          <GlassSurface radius={21} style={styles.glassBtn}>
            <TouchableOpacity
              style={[styles.glassBtnInner, transmitMode && styles.glassBtnActive]}
              onPress={onTransmit}
            >
              {transmitMode ? (
                <Square size={18} color="#FFF" fill="#FFF" strokeWidth={2.25} />
              ) : (
                <Radio size={20} color="#FFF" strokeWidth={2.25} />
              )}
            </TouchableOpacity>
          </GlassSurface>
        ) : null}

        {/* Mixer — opens the multitrack recording mixer (flag-gated). */}
        {mixerEnabled ? (
          <GlassSurface radius={21} style={styles.glassBtn}>
            <TouchableOpacity style={styles.glassBtnInner} onPress={openMixer}>
              <SlidersHorizontal size={20} color="#FFF" strokeWidth={2.25} />
            </TouchableOpacity>
          </GlassSurface>
        ) : null}

        <GlassSurface radius={21} style={styles.glassBtn}>
          <TouchableOpacity
            style={[styles.glassBtnInner, styles.hangUpTint]}
            onPress={hangUpCall}
          >
            <View style={styles.hangUpIcon}>
              <Phone size={20} color="#FFF" strokeWidth={2.25} />
            </View>
          </TouchableOpacity>
        </GlassSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    // The green frosted blur (HeaderBlur) is the background; let its fade spill
    // below the bar so the green dissolves smoothly into the content.
    overflow: 'visible',
  },
  glassBtn: {
    width: 42,
    height: 42,
  },
  hangUpTint: {
    backgroundColor: 'rgba(239, 68, 68, 0.6)',
  },
  glassBtnInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassBtnActive: {
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  timer: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  hangUpBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
});

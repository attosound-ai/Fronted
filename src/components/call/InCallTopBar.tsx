import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mic, MicOff, Volume1, Volume2, Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { useCallStore } from '@/stores/callStore';
import { hangUpCall, toggleMuteCall, toggleSpeaker } from '@/hooks/useTwilioVoice';

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

  const isConnected =
    activeCall?.state === 'connected' || activeCall?.state === 'reconnecting';

  // Hide on the dedicated call screen (it has its own controls)
  const isOnCallScreen = pathname === '/call' || pathname === '/recording' || pathname === '/(tabs)/recording';

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

  if (!isConnected || isOnCallScreen) return null;

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Timer */}
        <View style={styles.timerContainer}>
          <View style={styles.liveDot} />
          <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.btn, activeCall?.isMuted && styles.btnActive]}
            onPress={toggleMuteCall}
          >
            {activeCall?.isMuted ? (
              <MicOff size={18} color="#FFF" strokeWidth={2.25} />
            ) : (
              <Mic size={18} color="#FFF" strokeWidth={2.25} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, activeCall?.isSpeaker && styles.btnActive]}
            onPress={toggleSpeaker}
          >
            {activeCall?.isSpeaker ? (
              <Volume2 size={18} color="#FFF" strokeWidth={2.25} />
            ) : (
              <Volume1 size={18} color="#FFF" strokeWidth={2.25} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.hangUpBtn} onPress={hangUpCall}>
            <View style={styles.hangUpIcon}>
              <Phone size={18} color="#FFF" strokeWidth={2.25} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#22C55E',
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

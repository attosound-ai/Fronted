import { useCallback } from 'react';
import { View, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { Mic, Phone, Music2, Timer, Minus, Plus } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Slider } from '@/components/ui/Slider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { haptic } from '@/lib/haptics/hapticService';
import { mixerService } from '@/lib/callAudio/mixerService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { useMixerStore, MIXER_CHANNELS, type MixerChannel } from '@/stores/mixerStore';
import { GOLD } from '@/constants/gold';

const CHANNEL_META: Record<MixerChannel, { label: string; Icon: typeof Mic }> = {
  mic: { label: 'Mi micrófono', Icon: Mic },
  remote: { label: 'La otra persona', Icon: Phone },
  app: { label: 'Audio del app', Icon: Music2 },
  metronome: { label: 'Metrónomo', Icon: Timer },
};

// The captured sources (mic / remote / injected app audio). The metronome is NOT
// listed here — it has its own single enable + gain + BPM control below, so it
// isn't a confusing second "Metrónomo" toggle in the channel list.
const RECORD_CHANNELS = MIXER_CHANNELS.filter((ch) => ch !== 'metronome');

interface MixerSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * MixerSheet — the in-call CONFIGURATION mixer. Per-channel record-enable + gain
 * for the captured sources (mic / remote / injected app audio) plus a single
 * metronome enable + gain + BPM. It ONLY configures the channels; the actual
 * recording is started from each subscription's own recording screen, never here.
 * Every change is mirrored to the native engine via mixerService.
 */
export function MixerSheet({ visible, onClose }: MixerSheetProps) {
  const channels = useMixerStore((s) => s.channels);
  const metronomeEnabled = useMixerStore((s) => s.metronomeEnabled);
  const bpm = useMixerStore((s) => s.bpm);
  const setChannelGain = useMixerStore((s) => s.setChannelGain);
  const setChannelRecord = useMixerStore((s) => s.setChannelRecord);
  const setMetronomeEnabled = useMixerStore((s) => s.setMetronomeEnabled);
  const setBpm = useMixerStore((s) => s.setBpm);

  // Mirror a channel change to BOTH the store and the native bus.
  const onGain = useCallback(
    (ch: MixerChannel, gain: number) => {
      setChannelGain(ch, gain);
      mixerService.setChannel(ch, gain, channels[ch].record);
    },
    [setChannelGain, channels]
  );

  const onRecord = useCallback(
    (ch: MixerChannel, record: boolean) => {
      void haptic('selection');
      setChannelRecord(ch, record);
      mixerService.setChannel(ch, channels[ch].gain, record);
    },
    [setChannelRecord, channels]
  );

  const onMetronome = useCallback(
    (on: boolean) => {
      void haptic('selection');
      setMetronomeEnabled(on);
      // ONE metronome control: enabling it also enrolls it in the recorded mix
      // (its record channel follows the enable) — no separate channel toggle.
      setChannelRecord('metronome', on);
      mixerService.setMetronome(on, bpm);
      mixerService.setChannel('metronome', channels.metronome.gain, on);
      analytics.capture(ANALYTICS_EVENTS.CALL.AUDIO_MIX_METRONOME, { enabled: on, bpm });
    },
    [setMetronomeEnabled, setChannelRecord, bpm, channels]
  );

  const onBpm = useCallback(
    (next: number) => {
      void haptic('selection');
      setBpm(next);
      mixerService.setMetronome(metronomeEnabled, next);
    },
    [setBpm, metronomeEnabled]
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Mezclador">
      <View style={styles.body}>
        <Text style={styles.sectionLabel}>Canales de grabación</Text>
        {RECORD_CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch];
          const state = channels[ch];
          return (
            <View key={ch} style={styles.channelRow}>
              <View style={styles.channelHead}>
                <View style={styles.channelLabel}>
                  <meta.Icon
                    size={18}
                    color={state.record ? GOLD.base : '#666'}
                    strokeWidth={2.25}
                  />
                  <Text
                    style={[styles.channelName, !state.record && styles.channelNameOff]}
                  >
                    {meta.label}
                  </Text>
                </View>
                <Switch
                  value={state.record}
                  onValueChange={(v) => onRecord(ch, v)}
                  trackColor={{ false: '#333', true: GOLD.base }}
                  thumbColor="#FFF"
                />
              </View>
              <Slider
                value={state.gain}
                onChange={(v) => onGain(ch, v)}
                disabled={!state.record}
                minimumTrackColor={GOLD.base}
              />
            </View>
          );
        })}

        <View style={styles.divider} />

        {/* Single metronome control: enable + gain + BPM. */}
        <View style={styles.metroHead}>
          <View style={styles.channelLabel}>
            <Timer
              size={18}
              color={metronomeEnabled ? GOLD.base : '#666'}
              strokeWidth={2.25}
            />
            <Text style={styles.channelName}>Metrónomo</Text>
          </View>
          <Switch
            value={metronomeEnabled}
            onValueChange={onMetronome}
            trackColor={{ false: '#333', true: GOLD.base }}
            thumbColor="#FFF"
          />
        </View>
        <Slider
          value={channels.metronome.gain}
          onChange={(v) => onGain('metronome', v)}
          disabled={!metronomeEnabled}
          minimumTrackColor={GOLD.base}
        />
        <View style={styles.bpmRow}>
          <Text style={styles.bpmLabel}>BPM</Text>
          <TouchableOpacity
            style={styles.bpmBtn}
            onPress={() => onBpm(bpm - 1)}
            disabled={!metronomeEnabled}
          >
            <Minus
              size={18}
              color={metronomeEnabled ? '#FFF' : '#555'}
              strokeWidth={2.5}
            />
          </TouchableOpacity>
          <Text style={[styles.bpmValue, !metronomeEnabled && styles.bpmValueOff]}>
            {bpm}
          </Text>
          <TouchableOpacity
            style={styles.bpmBtn}
            onPress={() => onBpm(bpm + 1)}
            disabled={!metronomeEnabled}
          >
            <Plus
              size={18}
              color={metronomeEnabled ? '#FFF' : '#555'}
              strokeWidth={2.5}
            />
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    gap: 4,
  },
  sectionLabel: {
    color: '#888',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  channelRow: {
    paddingVertical: 6,
  },
  channelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  channelName: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
  channelNameOff: {
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#222',
    marginVertical: 12,
  },
  metroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bpmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  bpmLabel: {
    color: '#888',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
    flex: 1,
  },
  bpmBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F1F1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpmValue: {
    color: '#FFF',
    fontFamily: 'Archivo_700Bold',
    fontSize: 22,
    minWidth: 56,
    textAlign: 'center',
  },
  bpmValueOff: {
    color: '#555',
  },
});

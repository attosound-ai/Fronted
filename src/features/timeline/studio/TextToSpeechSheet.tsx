import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import NativeSlider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { haptic } from '@/lib/haptics/hapticService';
import { speechVoices, type SpeechVoice } from '../../../../modules/atto-audio-transcode';
import { STUDIO_COLORS } from './studioTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  busy: boolean;
  /** Renders the line and places it; the sheet closes when it resolves true. */
  onCreate: (input: {
    text: string;
    voiceId?: string;
    rate: number;
    pitch: number;
  }) => Promise<boolean>;
}

/**
 * SoundLab's "Text To Speech" track source: type a line, pick one of the
 * voices installed on the device, set speed and pitch, and the result lands
 * on a new track. The render happens offline on the device, so nothing is
 * played out loud while it is made.
 */
export function TextToSpeechSheet({ visible, onClose, busy, onCreate }: Props) {
  const { t } = useTranslation('projects');
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  const [rate, setRate] = useState(0.5);
  const [pitch, setPitch] = useState(1);
  const voices = useMemo<SpeechVoice[]>(() => speechVoices(), []);

  useEffect(() => {
    if (!visible) return;
    setText('');
    // Prefer a voice in the app's language, then anything installed.
    const preferred = voices.find((v) => v.language.startsWith('es')) ?? voices[0];
    setVoiceId(preferred?.id);
  }, [visible, voices]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('studio.tts.title')}>
      <View style={styles.content}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('studio.tts.placeholder')}
          placeholderTextColor={STUDIO_COLORS.textDisabled}
          multiline
          style={styles.input}
          maxLength={600}
        />

        <Text variant="caption" style={styles.label}>
          {t('studio.tts.voice')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.voices}
        >
          {voices.map((voice) => {
            const active = voice.id === voiceId;
            return (
              <Pressable
                key={voice.id}
                onPress={() => {
                  void haptic('selection');
                  setVoiceId(voice.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.voice, active && styles.voiceActive]}
              >
                <Text
                  variant="small"
                  numberOfLines={1}
                  style={[styles.voiceName, active && styles.voiceNameActive]}
                >
                  {voice.name}
                </Text>
                <Text
                  variant="caption"
                  style={[styles.voiceMeta, active && styles.voiceMetaActive]}
                >
                  {voice.language}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sliderRow}>
          <Text variant="caption" style={styles.sliderLabel}>
            {t('studio.tts.rate')}
          </Text>
          <NativeSlider
            style={styles.slider}
            minimumValue={0.25}
            maximumValue={0.8}
            value={rate}
            onValueChange={setRate}
            minimumTrackTintColor={STUDIO_COLORS.text}
            maximumTrackTintColor={STUDIO_COLORS.borderStrong}
            thumbTintColor={STUDIO_COLORS.text}
          />
        </View>
        <View style={styles.sliderRow}>
          <Text variant="caption" style={styles.sliderLabel}>
            {t('studio.tts.pitch')}
          </Text>
          <NativeSlider
            style={styles.slider}
            minimumValue={0.6}
            maximumValue={1.6}
            value={pitch}
            onValueChange={setPitch}
            minimumTrackTintColor={STUDIO_COLORS.text}
            maximumTrackTintColor={STUDIO_COLORS.borderStrong}
            thumbTintColor={STUDIO_COLORS.text}
          />
        </View>

        <Pressable
          onPress={async () => {
            if (busy || text.trim().length === 0) return;
            void haptic('medium');
            const ok = await onCreate({ text, voiceId, rate, pitch });
            if (ok) onClose();
          }}
          disabled={busy || text.trim().length === 0}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            (busy || text.trim().length === 0) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={STUDIO_COLORS.onPrimary} />
          ) : (
            <Text variant="body" style={styles.actionText}>
              {t('studio.tts.create')}
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  input: {
    minHeight: 96,
    borderRadius: 10,
    padding: 12,
    backgroundColor: STUDIO_COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    color: STUDIO_COLORS.text,
    fontFamily: 'Archivo_400Regular',
    textAlignVertical: 'top',
  },
  label: {
    color: STUDIO_COLORS.textMuted,
    marginTop: 14,
    marginBottom: 6,
  },
  voices: {
    maxHeight: 54,
  },
  voice: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO_COLORS.borderStrong,
    marginRight: 8,
    maxWidth: 160,
  },
  voiceActive: {
    backgroundColor: STUDIO_COLORS.primary,
    borderColor: STUDIO_COLORS.primary,
  },
  voiceName: {
    color: STUDIO_COLORS.text,
  },
  voiceNameActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  voiceMeta: {
    color: STUDIO_COLORS.textMuted,
  },
  voiceMetaActive: {
    color: STUDIO_COLORS.onPrimary,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  sliderLabel: {
    width: 56,
    color: STUDIO_COLORS.textMuted,
  },
  slider: {
    flex: 1,
    height: 34,
  },
  action: {
    height: 50,
    borderRadius: 25,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STUDIO_COLORS.primary,
  },
  actionText: {
    color: STUDIO_COLORS.onPrimary,
    fontFamily: 'Archivo_700Bold',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});

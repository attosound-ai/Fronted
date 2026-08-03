import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AudioLines, Check, EarOff, MicOff } from 'lucide-react-native';

import { Text } from '@/components/ui/Text';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCallStore } from '@/stores/callStore';
import { haptic } from '@/lib/haptics/hapticService';
import {
  reportAudioProblem,
  type AudioProblemSymptom,
} from '@/lib/telemetry/callTelemetry';
import { SPACING } from '@/constants/theme';

/**
 * In-call "the audio is wrong" report sheet.
 *
 * WHY this exists at all: in the AirPods no-audio incident every timestamp had to
 * be inferred from the client's remedial actions (he pulled the AirPods out, so
 * the failure must have started before that), and the DIRECTION of the failure
 * rested entirely on one sentence he wrote afterwards. One tap replaces both with
 * a fact, stamped by reportAudioProblem with the full live AVAudioSession state
 * and the last five route transitions of the call. It is also the only instrument
 * that will ever capture echo, for which the app has no measurement of any kind.
 *
 * It is deliberately a three-option sheet and nothing more. This is a live call
 * screen, not a feedback form: no free text, no rating, no follow-up. The tap
 * itself is the measurement, and everything else on the row is already recorded.
 *
 * Mounted ONCE at the root next to DtmfKeypadHost / MixerHost, so a single sheet
 * serves every call surface. Opened via `openAudioProblemReport()`.
 */

// ── Module-level open bridge ────────────────────────────────────────────────
// Same pattern as showToast (src/components/ui/Toast.tsx): the mounted host
// registers a setter, so any call surface can open the sheet without a store
// field or a context. Safe to call with no host mounted (silently ignored).
type OpenFn = () => void;
let _open: OpenFn | null = null;

/** Open the audio-problem sheet from a control-bar button. */
export function openAudioProblemReport(): void {
  _open?.();
}

/** How long the confirmation stays up before the sheet closes itself. */
const CONFIRM_MS = 1100;

/** How long the sheet survives the call ending, so a report can be finished. */
const POST_CALL_GRACE_MS = 10_000;

interface SymptomOption {
  symptom: AudioProblemSymptom;
  Icon: typeof EarOff;
  label: string;
}

export function AudioProblemHost() {
  const { t } = useTranslation('calls');
  const [visible, setVisible] = useState(false);
  const [reported, setReported] = useState<AudioProblemSymptom | null>(null);
  const callSid = useCallStore((s) => s.activeCall?.callSid ?? null);

  useEffect(() => {
    _open = () => {
      setReported(null);
      setVisible(true);
    };
    return () => {
      _open = null;
    };
  }, []);

  // The call ending must not yank the sheet out from under a half-made report.
  // The likeliest moment to tap "I cannot hear them" is the instant the call
  // drops, and reportAudioProblem is built for exactly that: the route-transition
  // ring is cleared when the NEXT call starts, not when this one ends, so a report
  // tapped just after hangup still carries the call that just failed. So we give a
  // grace window instead of closing immediately, then close so the sheet can never
  // be left sitting over the feed.
  useEffect(() => {
    if (callSid) return;
    const id = setTimeout(() => setVisible(false), POST_CALL_GRACE_MS);
    return () => clearTimeout(id);
  }, [callSid]);

  // Auto-dismiss once the tap has been acknowledged. The user is on a call and
  // has better things to do than close a sheet.
  useEffect(() => {
    if (!reported) return;
    const id = setTimeout(() => setVisible(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [reported]);

  const options: SymptomOption[] = [
    {
      symptom: 'cant_hear_them',
      Icon: EarOff,
      label: t('audioProblem.cantHearThem', 'I cannot hear them'),
    },
    {
      symptom: 'they_cant_hear_me',
      Icon: MicOff,
      label: t('audioProblem.theyCantHearMe', 'They cannot hear me'),
    },
    {
      symptom: 'echo',
      Icon: AudioLines,
      label: t('audioProblem.echo', 'Echo'),
    },
  ];

  const onPick = (symptom: AudioProblemSymptom) => {
    // Fire first, render second: the whole point is to stamp the moment the human
    // noticed, so the native audio read must not wait on a React commit.
    // reportAudioProblem never throws and never returns a value.
    void reportAudioProblem(symptom);
    void haptic('success');
    setReported(symptom);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={() => setVisible(false)}
      title={t('audioProblem.title', 'Audio problem')}
    >
      <View style={styles.body}>
        {reported ? (
          <View style={styles.confirm}>
            <View style={styles.confirmIcon}>
              <Check size={20} color="#3B82F6" strokeWidth={2.5} />
            </View>
            <Text style={styles.confirmText}>
              {t('audioProblem.confirmed', 'Noted. The call keeps running.')}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              {t('audioProblem.hint', 'What is happening right now?')}
            </Text>
            {options.map(({ symptom, Icon, label }) => (
              <TouchableOpacity
                key={symptom}
                style={styles.option}
                activeOpacity={0.85}
                onPress={() => onPick(symptom)}
              >
                <Icon size={20} color="#EF4444" strokeWidth={2} />
                <Text style={styles.optionText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: SPACING.md,
    gap: 10,
  },
  hint: {
    color: '#888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    marginBottom: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#111',
  },
  optionText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  confirmIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#111',
  },
  confirmText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    flexShrink: 1,
  },
});

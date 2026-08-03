import {
  View,
  Modal,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import type { ImportProgress } from '../hooks/useImportAudio';

export type AudioPreparingMode = 'recording' | 'import';

interface AudioPreparingModalProps {
  visible: boolean;
  /** Picks the i18n strings shown to the user. */
  mode: AudioPreparingMode;
  /**
   * When provided, shows a Cancel action that aborts the upload. Without an
   * escape hatch a stalled network left this modal spinning forever with the
   * editor unusable (David, Jul 19).
   */
  onCancel?: () => void;
  /**
   * Live byte progress. Null = indeterminate (recording mode, or a total the
   * platform could not report), which falls back to the plain spinner.
   */
  progress?: ImportProgress | null;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEta(ms: number): string {
  const secs = Math.max(5, Math.round(ms / 1000 / 5) * 5);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

/**
 * Blocking modal shown while a recording or an imported file is being prepared.
 *
 * Honest-progress rules, all deliberate:
 *  - Bytes map to 0-90%; the last 10% is the server tail (gateway buffering,
 *    transcode, storage). The bar therefore never sits at 100% doing nothing,
 *    which is the most trust-destroying state a progress bar has.
 *  - The percentage is monotonic (clamped upstream) so it never walks backwards.
 *  - Stage labels come from real state, never from timers.
 *  - MB counters show alongside the percent, so the number stays honest even when
 *    the percentage is an estimate.
 *  - An ETA appears only after 3s and is rounded, because an early or jittery
 *    estimate is worse than none.
 *  - After 15s with no bytes moving the copy says the connection looks slow, and
 *    Cancel stays available throughout.
 *
 * A real 27MB import measured 49s (David, Aug 2), so this modal's old note that it
 * "usually takes 1-3 seconds" was off by more than an order of magnitude — which is
 * part of why the wait was never prioritised.
 */
export function AudioPreparingModal({
  visible,
  mode,
  onCancel,
  progress,
}: AudioPreparingModalProps) {
  const { t } = useTranslation(['projects', 'common']);

  const title =
    mode === 'recording'
      ? t('timeline.preparingRecordingTitle')
      : t('timeline.preparingImportTitle');

  const hasBar = !!progress && progress.totalBytes > 0;
  const pctLabel = progress ? Math.round(progress.pct * 100) : 0;

  const subtitle = (() => {
    if (!progress) {
      return mode === 'recording'
        ? t('timeline.preparingRecordingSubtitle')
        : t('timeline.preparingImportSubtitle');
    }
    if (progress.stalled) {
      return t('timeline.importStalled', 'Connection seems slow…');
    }
    if (progress.stage === 'preparing') {
      return t('timeline.importPreparing', 'Preparing…');
    }
    if (progress.stage === 'processing') {
      return t('timeline.importProcessing', 'Processing on server…');
    }
    return hasBar
      ? `${formatMb(progress.bytesSent)} / ${formatMb(progress.totalBytes)}`
      : t('timeline.preparingImportSubtitle');
  })();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {hasBar ? (
            <View style={styles.barWrap}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(progress.pct * 100)}%` },
                  ]}
                />
              </View>
              <Text variant="caption" style={styles.pct}>
                {pctLabel}%
              </Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color="#FFFFFF" />
          )}

          <Text variant="body" style={styles.title}>
            {title}
          </Text>
          <Text variant="caption" style={styles.subtitle}>
            {subtitle}
          </Text>
          {progress?.etaMs != null && progress.stage === 'uploading' && (
            <Text variant="caption" style={styles.eta}>
              {t('timeline.importEta', 'About {{time}} left', {
                time: formatEta(progress.etaMs),
              })}
            </Text>
          )}

          {onCancel && (
            <TouchableOpacity
              onPress={onCancel}
              style={styles.cancelButton}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
              <Text variant="body" style={styles.cancelText}>
                {t('common:buttons.cancel')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 14,
    maxWidth: 320,
    minWidth: 260,
  },
  barWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  barTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#333',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#3B82F6',
  },
  pct: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  cancelText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 14,
  },
  eta: {
    color: '#666',
    fontFamily: 'Archivo_400Regular',
    fontSize: 11,
  },
  subtitle: {
    color: '#888888',
    fontFamily: 'Archivo_400Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
});

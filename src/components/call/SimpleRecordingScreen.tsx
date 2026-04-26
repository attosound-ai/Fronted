import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Alert, TouchableOpacity, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mic, MicOff, Volume1, Volume2, Phone, CloudUpload, FolderUp } from 'lucide-react-native';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, AudioModule, setAudioModeAsync } from 'expo-audio';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Text } from '@/components/ui/Text';
import { Logo } from '@/components/ui/Logo';
import { showToast } from '@/components/ui/Toast';

const ATTO_LOGO_URI =
  'https://res.cloudinary.com/da9vymoah/image/upload/v1774905442/Property_1_Default_zqv4qr.png';
import { AudioVisualizer } from './AudioVisualizer';
import { RecBadge } from './RecBadge';
import { RecordingControls } from './RecordingControls';
import { UploadButton } from './UploadButton';
import { useCallStore } from '@/stores/callStore';
import { useCreatePostStore } from '@/stores/createPostStore';
import { useSimpleRecordingPlayback } from '@/hooks/useSimpleRecordingPlayback';
import { hangUpCall, toggleMuteCall, toggleSpeaker } from '@/hooks/useTwilioVoice';
import { telephonyService } from '@/lib/api/telephonyService';
import { projectService } from '@/lib/api/projectService';
import { router } from 'expo-router';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { AudioSegment } from '@/types/call';
import { COLORS, SPACING } from '@/constants/theme';

interface SimpleRecordingScreenProps {
  onBack: () => void;
}

function getAudioExportMeta(format?: string, uri?: string) {
  const normalized = (format || '').toLowerCase();
  const fromUri = (uri || '').split('?')[0].toLowerCase();

  if (normalized === 'wav' || fromUri.endsWith('.wav')) {
    return { extension: 'wav', mimeType: 'audio/wav', uti: 'com.microsoft.waveform-audio' };
  }
  if (normalized === 'mp3' || fromUri.endsWith('.mp3')) {
    return { extension: 'mp3', mimeType: 'audio/mpeg', uti: 'public.mp3' };
  }

  return { extension: 'm4a', mimeType: 'audio/mp4', uti: 'public.mpeg-4-audio' };
}

export function SimpleRecordingScreen({ onBack }: SimpleRecordingScreenProps) {
  const { t } = useTranslation(['calls', 'common']);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();

  const activeCall = useCallStore((s) => s.activeCall);
  const activeProjectId = useCallStore((s) => s.activeProjectId);
  const { startCapture, stopCapture } = useCallStore();

  // Invalidate project cache on unmount
  const projectIdRef = useRef(activeProjectId);
  projectIdRef.current = activeProjectId;
  useEffect(() => {
    return () => {
      if (projectIdRef.current) {
        queryClient.invalidateQueries({ queryKey: ['project', projectIdRef.current] });
      }
    };
  }, [queryClient]);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadSheetVisible, setUploadSheetVisible] = useState(false);
  const [uploadSheetCanClose, setUploadSheetCanClose] = useState(false);
  const uploadSheetCloseUnlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSegments, setLocalSegments] = useState<
    (AudioSegment & { downloadUrl?: string })[]
  >([]);
  const hasSegments = localSegments.length > 0;

  useEffect(() => {
    console.log('[SimpleRecording] uploadSheetVisible ->', uploadSheetVisible);
  }, [uploadSheetVisible]);

  useEffect(() => {
    console.log('[SimpleRecording] segments ->', localSegments.length, {
      isRecording,
      isProcessing,
    });
  }, [localSegments.length, isRecording, isProcessing]);

  // Local microphone recorder:
  // - Without call: saves the actual recording
  // - During call: used ONLY for metering (we discard the file, Twilio records via Media Stream)
  const localRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(localRecorder, 60); // 60ms poll interval

  // Current instantaneous amplitude (0..1) from the recorder's metering.
  const currentAmplitude = useMemo(() => {
    const metering = recorderState.metering;
    if (metering == null) return 0;
    const db = Math.max(-60, Math.min(0, metering));
    return Math.pow((db + 60) / 60, 2);
  }, [recorderState.metering]);


  // Playback
  const { isPlaying, toggle: togglePlayback, stop: stopPlayback } =
    useSimpleRecordingPlayback(localSegments);

  // Recording timer
  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      setRecordingElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  // ── Start recording ──
  const handleRecord = useCallback(async () => {
    if (isRecording) return;
    if (isPlaying) stopPlayback();

    // With active call → use Twilio Media Stream for actual recording,
    // plus start the local recorder JUST for metering (real-time wave).
    if (activeCall) {
      try {
        const { streamSid } = await telephonyService.startCapture(
          activeCall.callSid,
        );
        startCapture(streamSid);
        setRecordingElapsed(0);
        setIsRecording(true);
        // Enable recording in expo-audio (needed even though Twilio already
        // set PlayAndRecord at the iOS level — expo-audio has its own flag).
        // Use mixWithOthers so we don't fight with Twilio for the session.
        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
            interruptionMode: 'mixWithOthers',
          });
          await localRecorder.prepareToRecordAsync();
          localRecorder.record();
        } catch (meterErr) {
          console.warn('[SimpleRecording] metering recorder failed:', meterErr);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        Alert.alert(t('active.recordingFailed'), msg);
      }
      return;
    }

    // No call → use device microphone
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('active.recordingFailed'),
          'Microphone permission is required to record.',
        );
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await localRecorder.prepareToRecordAsync();
      localRecorder.record();
      setRecordingElapsed(0);
      setIsRecording(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      Alert.alert(t('active.recordingFailed'), msg);
    }
  }, [activeCall, isRecording, isPlaying, startCapture, stopPlayback, localRecorder, t]);

  // ── Stop recording ──
  const handleStop = useCallback(async () => {
    // Local microphone recording (no call)
    if (!activeCall) {
      try {
        await localRecorder.stop();
        const uri = localRecorder.uri;
        setIsRecording(false);
        // Restore normal playback mode
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        });
        if (uri) {
          const durationMs = recordingElapsed * 1000;
          // Create a synthetic segment so the existing UI works
          const localSegment: AudioSegment & { downloadUrl?: string } = {
            id: `local-${Date.now()}`,
            callId: 'local',
            twilioStreamSid: 'local',
            segmentIndex: localSegments.length + 1,
            track: 'mono',
            startMs: 0,
            endMs: durationMs,
            durationMs,
            format: 'm4a',
            sampleRate: 44100,
            fileSizeBytes: 0,
            storageBucket: 'local',
            storageKey: uri,
            createdAt: new Date().toISOString(),
            downloadUrl: uri,
          };
          setLocalSegments([localSegment]);
          showToast(t('common:toasts.recordingAdded'));
        }
      } catch (error: unknown) {
        setIsRecording(false);
        const msg = error instanceof Error ? error.message : String(error);
        Alert.alert(t('active.recordingFailed'), msg);
      }
      return;
    }

    // Stop the local metering recorder (we don't use its file — Twilio records the actual audio)
    try {
      await localRecorder.stop();
    } catch {
      // Best-effort
    }

    // Baseline segment count before stopping
    let baselineCount = 0;
    try {
      const current = await telephonyService.getSegments(activeCall.callSid);
      baselineCount = current.length;
    } catch {
      // 0 is safe
    }

    // Stop the stream
    if (activeCall.activeStreamSid) {
      try {
        await telephonyService.stopCapture(
          activeCall.callSid,
          activeCall.activeStreamSid,
        );
      } catch {
        // Stream may have already ended
      }
    }
    stopCapture();
    setIsRecording(false);
    setIsProcessing(true);

    // Poll for new segment
    const maxRetries = 10;
    const retryDelayMs = 2000;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      try {
        const allSegments = await telephonyService.getSegments(
          activeCall.callSid,
        );
        if (allSegments.length > baselineCount) {
          const newSegment = allSegments[allSegments.length - 1];

          // Link segment to project
          if (activeProjectId) {
            try {
              await projectService.addSegment(activeProjectId, newSegment.id);
              queryClient.invalidateQueries({
                queryKey: ['project', activeProjectId],
              });
              queryClient.invalidateQueries({ queryKey: ['projects'] });
            } catch (e: unknown) {
              const m = e instanceof Error ? e.message : String(e);
              showToast(t('active.couldNotLink', { message: m }));
            }
          }

          setLocalSegments(allSegments);
          setIsProcessing(false);
          showToast(t('common:toasts.recordingAdded'));
          return;
        }
      } catch (error: unknown) {
        if (i === maxRetries - 1) {
          setIsProcessing(false);
          const msg = error instanceof Error ? error.message : String(error);
          Alert.alert(
            t('active.recordingFailed'),
            t('active.couldNotLoadRecording', { message: msg }),
          );
          return;
        }
      }
    }

    // All retries exhausted
    setIsProcessing(false);
    Alert.alert(
      t('active.recordingNotFound'),
      t('active.recordingNotFoundMessage'),
    );
  }, [activeCall, activeProjectId, stopCapture, queryClient, t, localRecorder, recordingElapsed, localSegments.length]);

  // ── Delete ──
  const handleDelete = useCallback(() => {
    if (localSegments.length === 0) return;
    stopPlayback();
    Alert.alert(
      t('simple.deleteConfirm'),
      t('simple.deleteConfirmMessage'),
      [
        { text: t('common:buttons.cancel'), style: 'cancel' },
        {
          text: t('simple.delete'),
          style: 'destructive',
          onPress: async () => {
            if (activeProjectId) {
              for (const seg of localSegments) {
                try {
                  await projectService.removeSegment(activeProjectId, seg.id);
                } catch {
                  // Best effort
                }
              }
              queryClient.invalidateQueries({
                queryKey: ['project', activeProjectId],
              });
            }
            setLocalSegments([]);
            setRecordingElapsed(0);
          },
        },
      ],
    );
  }, [localSegments, activeProjectId, stopPlayback, queryClient, t]);

  // ── Publish: navigate to create-post with the recorded audio ──
  const handlePublish = useCallback(() => {
    if (localSegments.length === 0) return;
    const lastSegment = localSegments[localSegments.length - 1];
    if (!lastSegment.downloadUrl) {
      showToast(t('simple.uploadFailed'));
      return;
    }
    useCreatePostStore.getState().setPendingAudio({
      uri: lastSegment.downloadUrl,
      fileName: `recording-${Date.now()}.wav`,
      durationMs: lastSegment.durationMs ?? 0,
    });
    router.push('/create-post');
  }, [localSegments, t]);

  const resolveShareableUri = useCallback(
    async (sourceUri: string, extension: string) => {
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDir) {
        throw new Error('No writable directory available');
      }
      const targetUri = `${baseDir}atto-export-${Date.now()}.${extension}`;

      if (!sourceUri.startsWith('http://') && !sourceUri.startsWith('https://')) {
        // Ensure a deterministic filename+extension so Files receives a real audio file.
        await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
        return targetUri;
      }

      await FileSystem.downloadAsync(sourceUri, targetUri);
      return targetUri;
    },
    []
  );

  const handleExportToFiles = useCallback(async () => {
    console.log('[SimpleRecording] handleExportToFiles:start');
    if (localSegments.length === 0) return;
    const lastSegment = localSegments[localSegments.length - 1];
    if (!lastSegment.downloadUrl) {
      showToast(t('simple.uploadFailed'));
      return;
    }

    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(t('simple.exportNotAvailableTitle'), t('simple.exportNotAvailableMessage'));
        return;
      }

      const exportMeta = getAudioExportMeta(lastSegment.format, lastSegment.downloadUrl);
      const shareableUri = await resolveShareableUri(
        lastSegment.downloadUrl,
        exportMeta.extension
      );
      console.log('[SimpleRecording] share file prepared', {
        source: lastSegment.downloadUrl,
        shareableUri,
        format: lastSegment.format,
        mimeType: exportMeta.mimeType,
        uti: exportMeta.uti,
      });
      await Sharing.shareAsync(shareableUri, {
        mimeType: exportMeta.mimeType,
        dialogTitle: t('simple.exportDialogTitle'),
        UTI: exportMeta.uti,
      });
      console.log('[SimpleRecording] shareAsync:done');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[SimpleRecording] handleExportToFiles:error', message);
      Alert.alert(t('simple.exportNotAvailableTitle'), t('simple.exportFailed', { message }));
      showToast(t('simple.exportFailed', { message }));
    }
  }, [localSegments, resolveShareableUri, t]);

  const handleExportOptionPress = useCallback(() => {
    console.log('[SimpleRecording] export option pressed');
    setUploadSheetVisible(false);
    // Wait until the sheet closes, then present iOS share sheet.
    setTimeout(() => {
      void handleExportToFiles();
    }, 280);
  }, [handleExportToFiles]);

  const handleUploadPress = useCallback(() => {
    console.log('[SimpleRecording] cloud pressed', {
      hasSegments,
      isRecording,
      isProcessing,
      segments: localSegments.length,
    });
    if (!hasSegments || isRecording || isProcessing) return;
    if (uploadSheetCloseUnlockTimeoutRef.current) {
      clearTimeout(uploadSheetCloseUnlockTimeoutRef.current);
      uploadSheetCloseUnlockTimeoutRef.current = null;
    }

    // Guard against immediate backdrop-close on the same touch gesture.
    setUploadSheetCanClose(false);
    setUploadSheetVisible(true);
    uploadSheetCloseUnlockTimeoutRef.current = setTimeout(() => {
      setUploadSheetCanClose(true);
      uploadSheetCloseUnlockTimeoutRef.current = null;
    }, 320);
  }, [hasSegments, isRecording, isProcessing, localSegments.length]);

  useEffect(() => {
    return () => {
      if (uploadSheetCloseUnlockTimeoutRef.current) {
        clearTimeout(uploadSheetCloseUnlockTimeoutRef.current);
      }
    };
  }, []);

  const visualizerWidth = screenWidth;

  const isConnected =
    activeCall?.state === 'connected' || activeCall?.state === 'reconnecting';

  // Call elapsed timer
  const [callElapsed, setCallElapsed] = useState(0);
  useEffect(() => {
    if (!isConnected || !activeCall?.connectedAt) {
      setCallElapsed(0);
      return;
    }
    const tick = () => {
      const diff = Math.floor(
        (Date.now() - new Date(activeCall.connectedAt!).getTime()) / 1000
      );
      setCallElapsed(Math.max(0, diff));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isConnected, activeCall?.connectedAt]);

  const formattedElapsed = useMemo(() => {
    const h = Math.floor(callElapsed / 3600);
    const m = Math.floor((callElapsed % 3600) / 60);
    const s = callElapsed % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
  }, [callElapsed]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {isConnected ? (
        <>
          {/* Green call header — with timer, centered ATTO logo, and controls */}
          <View style={styles.callBar}>
            <View style={styles.callTimerContainer}>
              <View style={styles.liveDot} />
              <Text style={styles.callTimer}>{formattedElapsed}</Text>
            </View>

            <View style={styles.callBarLogoCenter} pointerEvents="none">
              <Image source={{ uri: ATTO_LOGO_URI }} style={styles.attoLogo} resizeMode="contain" />
              <Text style={styles.attoSubtext}>sound</Text>
            </View>

            <View style={styles.callBarControls}>
              <TouchableOpacity
                style={[styles.callBarBtn, activeCall?.isMuted && styles.callBarBtnActive]}
                onPress={toggleMuteCall}
              >
                {activeCall?.isMuted ? (
                  <MicOff size={18} color="#FFF" strokeWidth={2.25} />
                ) : (
                  <Mic size={18} color="#FFF" strokeWidth={2.25} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.callBarBtn, activeCall?.isSpeaker && styles.callBarBtnActive]}
                onPress={toggleSpeaker}
              >
                {activeCall?.isSpeaker ? (
                  <Volume2 size={18} color="#FFF" strokeWidth={2.25} />
                ) : (
                  <Volume1 size={18} color="#FFF" strokeWidth={2.25} />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.callBarHangUp} onPress={hangUpCall}>
                <View style={{ transform: [{ rotate: '135deg' }] }}>
                  <Phone size={18} color="#FFF" strokeWidth={2.25} />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Back button — below the green bar during a call */}
          <View style={styles.backRow}>
            <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={16}>
              <ArrowLeft size={22} color="#FFF" strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        /* No call — back button + ATTO logo in top nav */
        <View style={styles.topNav}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={16}>
            <ArrowLeft size={22} color="#FFF" strokeWidth={2.25} />
          </TouchableOpacity>
          <View style={styles.topNavLogoCenter} pointerEvents="none">
            <Image source={{ uri: ATTO_LOGO_URI }} style={styles.attoLogo} resizeMode="contain" />
            <Text style={styles.attoSubtext}>sound</Text>
          </View>
        </View>
      )}

      {/* Audio visualizer — reactive to recording or playback */}
      <View style={styles.visualizerContainer}>
        <AudioVisualizer
          isActive={isRecording || isPlaying}
          width={visualizerWidth}
          height={200}
          liveAmplitude={isRecording ? currentAmplitude : undefined}
        />
      </View>

      {/* Bottom controls */}
      <View style={styles.controlsSection}>
        {/* REC badge + timer */}
        <View style={styles.badgeContainer}>
          {isRecording ? (
            <RecBadge isRecording={isRecording} elapsed={recordingElapsed} />
          ) : isProcessing ? (
            <Text style={styles.processingText}>
              {t('active.processingRecording')}
            </Text>
          ) : null}
        </View>

        {/* Record / Stop / Play / Delete */}
        <RecordingControls
          isRecording={isRecording}
          isPlaying={isPlaying}
          canPlay={hasSegments && !isProcessing}
          canDelete={hasSegments && !isProcessing}
          isProcessing={isProcessing}
          onRecord={handleRecord}
          onStop={handleStop}
          onPlay={togglePlayback}
          onDelete={handleDelete}
        />

        {/* Publish */}
        <UploadButton
          onUpload={handleUploadPress}
          disabled={!hasSegments || isRecording || isProcessing}
          isUploading={false}
        />
      </View>

      <BottomSheet
        visible={uploadSheetVisible}
        onClose={() => {
          console.log('[SimpleRecording] bottomSheet:onClose', {
            uploadSheetCanClose,
          });
          if (!uploadSheetCanClose) return;
          setUploadSheetVisible(false);
        }}
        title={t('simple.uploadSheetTitle')}
      >
        <View style={styles.uploadSheetOptions}>
          <TouchableOpacity
            style={styles.uploadSheetOption}
            onPress={() => {
              setUploadSheetVisible(false);
              handlePublish();
            }}
            activeOpacity={0.75}
          >
            <View style={styles.uploadSheetOptionIcon}>
              <CloudUpload size={18} color="#FFF" strokeWidth={2.25} />
            </View>
            <View style={styles.uploadSheetOptionTextWrap}>
              <Text style={styles.uploadSheetOptionTitle}>{t('simple.uploadOptionTitle')}</Text>
              <Text style={styles.uploadSheetOptionSubtitle}>{t('simple.uploadOptionSubtitle')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.uploadSheetOption}
            onPress={handleExportOptionPress}
            activeOpacity={0.75}
          >
            <View style={styles.uploadSheetOptionIcon}>
              <FolderUp size={18} color="#FFF" strokeWidth={2.25} />
            </View>
            <View style={styles.uploadSheetOptionTextWrap}>
              <Text style={styles.uploadSheetOptionTitle}>{t('simple.exportOptionTitle')}</Text>
              <Text style={styles.uploadSheetOptionSubtitle}>{t('simple.exportOptionSubtitle')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNavLogoCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  backRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  callBarLogoCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1AA34D',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  callTimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  callTimer: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
  },
  attoLogo: {
    width: 100,
    height: 28,
  },
  attoSubtext: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_400Regular',
    fontSize: 7,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  callBarControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callBarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBarBtnActive: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  callBarHangUp: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualizerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsSection: {
    justifyContent: 'flex-end',
    gap: SPACING.lg,
    paddingBottom: 32,
  },
  badgeContainer: {
    alignItems: 'center',
    minHeight: 28,
  },
  processingText: {
    color: COLORS.gray[400],
    fontSize: 14,
    fontFamily: 'Archivo_500Medium',
  },
  uploadSheetOptions: {
    gap: 10,
    paddingBottom: 8,
  },
  uploadSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#141414',
  },
  uploadSheetOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
  },
  uploadSheetOptionTextWrap: {
    flex: 1,
    gap: 2,
  },
  uploadSheetOptionTitle: {
    color: '#FFF',
    fontSize: 15,
    fontFamily: 'Archivo_600SemiBold',
  },
  uploadSheetOptionSubtitle: {
    color: COLORS.gray[400],
    fontSize: 12,
    fontFamily: 'Archivo_500Medium',
  },
});

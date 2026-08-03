import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Toast } from '@/components/ui/Toast';
import { TimelineEditor } from '@/features/timeline/components/TimelineEditor';
import { CallProjectChooser } from './CallProjectChooser';
import { useProjectDetail } from '@/features/projects/hooks/useProjectDetail';
import { useCallStore } from '@/stores/callStore';
import { useCreatePostStore } from '@/stores/createPostStore';
import { analytics, ANALYTICS_EVENTS, useFeatureFlag } from '@/lib/analytics';
import { INCALL_EDITOR_AUTOLOAD_FLAG } from '@/hooks/useConnectedCallLanding';
import type { ExportResult } from '@/types/project';
import { COLORS } from '@/constants/theme';

interface ActiveCallScreenProps {
  onBack: () => void;
}

// Hard ceiling for downloading the exported WAV to the device. Generous enough
// for a long take on a slow link, but finite so a stalled download can't hang
// the publish forever (downloadAsync has no built-in timeout).
const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Thin wrapper that mounts the canonical `TimelineEditor` with the project
 * belonging to the active Twilio call, and switches the editor's record button
 * to the Twilio Media Stream pipeline via `recordingMode="twilioCall"`.
 *
 * The in-call controls (timer, mute, speaker, keypad, transmit, mixer, end) are
 * the GLOBAL green `InCallTopBar` that already floats over this screen — we do
 * NOT inject a second green bar here (that produced the doubled-green header).
 * TimelineEditor reserves the bar's height at the top so its own header clears it.
 */
export function ActiveCallScreen({ onBack }: ActiveCallScreenProps) {
  const { t } = useTranslation('calls');
  const queryClient = useQueryClient();
  const activeProjectId = useCallStore((s) => s.activeProjectId);
  const setPendingAudio = useCreatePostStore((s) => s.setPendingAudio);

  // Relief (David, Jul 22): the Record Pro editor OOM-killed the app on every call.
  // Default OFF → show a plain call screen; the rep opens the recorder deliberately.
  // Gate the project fetch too (it pulls segments + waveforms = memory) so a plain
  // call never touches the heavy path. Re-enable per-cohort via the flag once the
  // editor's in-call memory is reduced. See useConnectedCallLanding for the flag.
  const editorFlagOn = useFeatureFlag(INCALL_EDITOR_AUTOLOAD_FLAG) === true;
  const [manualOpen, setManualOpen] = useState(false);
  const showEditor = editorFlagOn || manualOpen;

  const { data, isLoading } = useProjectDetail(showEditor ? (activeProjectId ?? '') : '');

  // Telemetry: log WHY the editor is (or isn't) loading, once per distinct state,
  // so production shows the stuck-loading reason and confirms the fix flips it to ready.
  const loadingReason = !activeProjectId
    ? 'no_project'
    : isLoading
      ? 'loading'
      : !data
        ? 'no_data'
        : 'ready';
  const loggedStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (loggedStateRef.current === loadingReason) return;
    loggedStateRef.current = loadingReason;
    analytics.capture(ANALYTICS_EVENTS.CALL.RECORDER_STATE, {
      state: loadingReason,
      has_project: !!activeProjectId,
    });
  }, [loadingReason, activeProjectId]);

  // Refresh the project query on unmount so other screens see the
  // latest clips/segments captured during the call.
  const projectIdRef = useRef(activeProjectId);
  projectIdRef.current = activeProjectId;
  useEffect(() => {
    return () => {
      if (projectIdRef.current) {
        queryClient.invalidateQueries({
          queryKey: ['project', projectIdRef.current],
        });
      }
    };
  }, [queryClient]);

  const handlePublish = useCallback(
    async (result: ExportResult, durationMs: number) => {
      const localUri = `${FileSystem.cacheDirectory}export_${activeProjectId}_${Date.now()}.wav`;
      // Download the exported WAV to the device before handing it to the
      // post composer. This is the phase we suspected of the "Publicar tardó
      // demasiado" slowness (the export is an uncompressed WAV), so time it and
      // guard it: downloadAsync has no built-in timeout, and without one a
      // stalled download would hang the publish forever.
      const tDownload = Date.now();
      try {
        await Promise.race([
          FileSystem.downloadAsync(result.downloadUrl, localUri),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('export download timed out')),
              DOWNLOAD_TIMEOUT_MS
            )
          ),
        ]);
        analytics.capture(ANALYTICS_EVENTS.PROJECT.EXPORT_DOWNLOAD, {
          outcome: 'succeeded',
          download_ms: Date.now() - tDownload,
          file_size_bytes: result.fileSizeBytes ?? null,
          project_id: activeProjectId ?? null,
        });
      } catch (error: unknown) {
        analytics.capture(ANALYTICS_EVENTS.PROJECT.EXPORT_DOWNLOAD, {
          outcome: 'failed',
          download_ms: Date.now() - tDownload,
          file_size_bytes: result.fileSizeBytes ?? null,
          project_id: activeProjectId ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
        // Rethrow so handleExport's catch surfaces the error toast and clears
        // the publishing state, instead of silently pushing to an empty composer.
        throw error;
      }
      setPendingAudio({
        uri: localUri,
        fileName: `${data?.project.name ?? 'project'}.wav`,
        durationMs,
      });
      router.push('/create-post');
    },
    [activeProjectId, data?.project.name, setPendingAudio]
  );

  // Relief mode: plain call screen. No editor, no project fetch, no waveforms —
  // so a normal call (the common case: Larry just talks) can't OOM the app. The
  // global InCallTopBar already floats the mute/speaker/hang-up controls over
  // this; here we only offer a deliberate "Record" entry into the editor.
  if (!showEditor) {
    return (
      <View style={styles.plainContainer}>
        <Text variant="body" style={styles.plainStatus}>
          {t('active.onCall', 'On call')}
        </Text>
        <TouchableOpacity
          style={styles.recordButton}
          activeOpacity={0.85}
          onPress={() => {
            analytics.capture(ANALYTICS_EVENTS.CALL.RECORDER_STATE, {
              state: 'manual_open',
              has_project: !!activeProjectId,
            });
            setManualOpen(true);
          }}
        >
          <Text variant="body" style={styles.recordButtonText}>
            {t('active.openRecorder', 'Record')}
          </Text>
        </TouchableOpacity>
        <Toast />
      </View>
    );
  }

  // No project on the call yet → let the rep CHOOSE one (Record Pro manages
  // projects; deciding for them is wrong, and the old code just spun forever
  // here because the auto-landing skips the CallBanner's project picker).
  if (!activeProjectId) {
    // onBack so the chooser is not a dead end: without it, picking a project was
    // the only way off this screen, and a rep who just wanted to talk was stuck
    // on it for the whole call (David, Aug 3). The call keeps running.
    return <CallProjectChooser onBack={onBack} />;
  }

  // Loading state — shown until the project payload arrives. The call
  // controls are not interactive yet because we don't know which lanes
  // exist; that's a fair tradeoff because the editor takes <1s to load
  // in practice.
  if (isLoading || !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text variant="body" style={styles.loadingText}>
          {t('active.loading', 'Loading project…')}
        </Text>
        <Toast />
      </View>
    );
  }

  return (
    <TimelineEditor
      // Key on the PROJECT only, never updatedAt: every in-call recording bumps
      // updatedAt, and keying on it force-remounted the whole editor per recording.
      // Combined with the player-release leak that stacked ~600MB per remount →
      // OOM (David, Jul 23). The editor already ingests new clips/segments via
      // props, so it never needed the remount. Switching projects still remounts.
      key={activeProjectId}
      projectId={activeProjectId}
      clips={data.clips}
      segments={data.segments}
      lanes={data.project.lanes}
      onClose={onBack}
      onPublish={handlePublish}
      recordingMode="twilioCall"
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  plainContainer: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  plainStatus: {
    color: '#888',
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
  },
  recordButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 16,
  },
});

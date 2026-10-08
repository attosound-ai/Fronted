import { exportFileType } from '@/features/timeline/utils/postSize';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useQueryClient } from '@tanstack/react-query';
import { useCallStore } from '@/stores/callStore';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useProjectDetail } from '../hooks/useProjectDetail';
import { usePreloadEditor } from '@/features/timeline/hooks/usePreloadEditor';
import { EditorLoadingModal } from '@/features/timeline/components/EditorLoadingModal';
import { useCreatePostStore } from '@/stores/createPostStore';
import type { ExportResult } from '@/types/project';
import { COLORS } from '@/constants/theme';

interface ProjectDetailScreenProps {
  projectId: string;
  publishMode?: boolean;
}

export function ProjectDetailScreen({
  projectId,
  publishMode = false,
}: ProjectDetailScreenProps) {
  const { t } = useTranslation(['projects', 'common']);
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, isFetchedAfterMount, isPaused } =
    useProjectDetail(projectId);
  const [editorOpen, setEditorOpen] = useState(false);
  const editorWasOpened = useRef(false);
  const { isPreloading, progress, preloadEditor } = usePreloadEditor(data?.clips ?? []);
  const setPendingAudio = useCreatePostStore((s) => s.setPendingAudio);
  // Drives recordingMode below: this screen is reachable DURING a live call (the
  // in-call editor landing opens it), and recording works completely differently
  // there. See the recordingMode prop for the failure this prevents.
  const activeCall = useCallStore((s) => s.activeCall);

  // A project opens straight in the editor, ONCE, as soon as its data is
  // here. This screen used to stop on a page of its own first (tracks, clips,
  // status and an "Open Editor" button), and only publish mode skipped it.
  // The client asked for that step to go (Oct 7 2026: "an extra step that we
  // don't really need"); renaming and deleting moved to the list.
  //
  // It opens from what the server has NOW, not from the copy kept from the
  // last visit: that copy is from before the last edit, and the editor would
  // open on it and then start over when the fresh one arrived. Without a
  // connection the kept copy is what there is, and it opens on that.
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaitedLongEnough(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  const readyToOpen =
    !!data && !isFetching && (isFetchedAfterMount || isPaused || waitedLongEnough);
  useEffect(() => {
    if (!readyToOpen || editorWasOpened.current || isPreloading) return;
    editorWasOpened.current = true;
    preloadEditor().then(() => setEditorOpen(true));
  }, [readyToOpen, isPreloading, preloadEditor]);

  /** Out of the project: back to where it was opened from. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text variant="body" style={{ color: '#666' }}>
            {t('detail.projectNotFound')}
          </Text>
          <Button title={t('common:buttons.back')} onPress={leave} />
        </View>
      </SafeAreaView>
    );
  }

  const { project, segments, clips } = data;

  if (editorOpen) {
    const TimelineEditor =
      require('@/features/timeline/components/TimelineEditor').TimelineEditor;

    const handlePublish = async (
      result: ExportResult,
      durationMs: number,
      coverUri?: string
    ) => {
      // Keep the format the exporter produced (AAC is .m4a, MP3 is .mp3):
      // the stored post takes its type from this extension.
      const { extension, mimeType } = exportFileType(result.downloadUrl);
      const localUri = `${FileSystem.cacheDirectory}export_${projectId}_${Date.now()}.${extension}`;
      await FileSystem.downloadAsync(result.downloadUrl, localUri);
      setPendingAudio({
        uri: localUri,
        fileName: `${project.name}.${extension}`,
        mimeType,
        durationMs,
        coverUri,
      });
      if (publishMode) {
        router.back();
      } else {
        router.push('/create-post');
      }
    };

    return (
      <TimelineEditor
        // RECORD DURING A CALL (build 156). Without this the editor fell back to
        // the default 'mic' mode, and its recorder (a) cannot get the microphone
        // while CallKit/Twilio own the session, so the take came out EMPTY, and
        // (b) writes setAudioModeAsync({playsInSilentMode:true}) — the Playback
        // category, which STRIPS the mic from the live call. The client hit
        // exactly this on Aug 20: he was auto-landed here mid-call by
        // incall_editor_autoload, tapped Record twice and "there was nothing
        // there" (call_recording_placed fired, call_capture_started never did).
        // With an active call we use the same server-side Twilio capture the
        // dedicated call screen uses; with no call, plain mic recording.
        recordingMode={activeCall ? 'twilioCall' : 'mic'}
        projectName={project.name}
        // Force a fresh mount whenever the server-side data changes
        // (e.g. after a refetch). This guarantees `useTimeline`'s
        // `useReducer` lazy init reads the latest lanes/clips instead
        // of holding onto stale state from the previous mount, which
        // would persist indefinitely because React's `useReducer`
        // doesn't react to changes in its initial-state argument.
        key={`${projectId}-${project.updatedAt}`}
        projectId={projectId}
        clips={clips}
        segments={segments}
        lanes={project.lanes}
        settings={project.settings}
        onClose={() => {
          // The list shows the new length and date of the project. The
          // project itself is read again the next time it is opened (see
          // useProjectDetail); reading it now would restart this editor
          // while the screen is on its way out.
          void queryClient.invalidateQueries({ queryKey: ['projects'] });
          leave();
        }}
        onPublish={handlePublish}
      />
    );
  }

  // The project is loaded and the editor is getting ready (waveforms). There
  // is nothing to read here: the screen that used to show tracks, clips and
  // an "Open Editor" button is gone.
  return (
    <View style={styles.container}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
      <EditorLoadingModal visible={isPreloading} progress={progress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
});

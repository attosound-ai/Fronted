import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { Mic, MicOff, Volume1, Volume2, Phone } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Text } from '@/components/ui/Text';
import { Toast } from '@/components/ui/Toast';
import { TimelineEditor } from '@/features/timeline/components/TimelineEditor';
import { useProjectDetail } from '@/features/projects/hooks/useProjectDetail';
import { useCallStore } from '@/stores/callStore';
import { useCreatePostStore } from '@/stores/createPostStore';
import { hangUpCall, toggleMuteCall, toggleSpeaker } from '@/hooks/useTwilioVoice';
import type { ExportResult } from '@/types/project';

interface ActiveCallScreenProps {
  onBack: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Thin wrapper that mounts the canonical `TimelineEditor` with the
 * project belonging to the active Twilio call. Renders an in-call
 * control bar (ATTO + timer + Unmute / Speaker / End) above the editor
 * via `topSlot`, and switches the editor's record button to use the
 * Twilio Media Stream pipeline via `recordingMode="twilioCall"`.
 *
 * Replaces the old per-screen timeline implementation that duplicated
 * everything from `TimelineEditor` with a slightly different layout.
 */
export function ActiveCallScreen({ onBack }: ActiveCallScreenProps) {
  const { t } = useTranslation('calls');
  const queryClient = useQueryClient();
  const activeCall = useCallStore((s) => s.activeCall);
  const activeProjectId = useCallStore((s) => s.activeProjectId);
  const setPendingAudio = useCreatePostStore((s) => s.setPendingAudio);

  const { data, isLoading } = useProjectDetail(activeProjectId ?? '');

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

  // Call elapsed timer.
  const [callElapsed, setCallElapsed] = useState(0);
  useEffect(() => {
    if (!activeCall?.connectedAt) return;
    const start = activeCall.connectedAt.getTime();
    const tick = () => setCallElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeCall?.connectedAt]);

  const handlePublish = useCallback(
    async (result: ExportResult, durationMs: number) => {
      const localUri = `${FileSystem.cacheDirectory}export_${activeProjectId}_${Date.now()}.wav`;
      await FileSystem.downloadAsync(result.downloadUrl, localUri);
      setPendingAudio({
        uri: localUri,
        fileName: `${data?.project.name ?? 'project'}.wav`,
        durationMs,
      });
      router.push('/create-post');
    },
    [activeProjectId, data?.project.name, setPendingAudio]
  );

  // Loading state — shown until the project payload arrives. The call
  // controls are not interactive yet because we don't know which lanes
  // exist; that's a fair tradeoff because the editor takes <1s to load
  // in practice.
  if (isLoading || !data || !activeProjectId) {
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

  const isMuted = activeCall?.isMuted ?? false;
  const isSpeaker = activeCall?.isSpeaker ?? false;

  return (
    <TimelineEditor
      key={`${activeProjectId}-${data.project.updatedAt}`}
      projectId={activeProjectId}
      clips={data.clips}
      segments={data.segments}
      lanes={data.project.lanes}
      onClose={onBack}
      onPublish={handlePublish}
      recordingMode="twilioCall"
      topSlot={
        <View style={styles.callBar}>
          <View style={styles.callBarLeft}>
            <View style={styles.liveDot} />
            <Text variant="caption" style={styles.callTimer}>
              {formatElapsed(callElapsed)}
            </Text>
          </View>
          <View style={styles.callBarControls}>
            <TouchableOpacity
              style={[styles.callBtn, isMuted && styles.callBtnMutedActive]}
              onPress={toggleMuteCall}
              activeOpacity={0.7}
            >
              {isMuted ? (
                <MicOff size={16} color="#FFF" strokeWidth={2.25} />
              ) : (
                <Mic size={16} color="#FFF" strokeWidth={2.25} />
              )}
              <Text variant="caption" style={styles.callBtnLabel}>
                {isMuted ? t('active.unmute') : t('active.mute')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.callBtn, isSpeaker && styles.callBtnSpeakerActive]}
              onPress={toggleSpeaker}
              activeOpacity={0.7}
            >
              {isSpeaker ? (
                <Volume2 size={16} color="#FFF" strokeWidth={2.25} />
              ) : (
                <Volume1 size={16} color="#FFF" strokeWidth={2.25} />
              )}
              <Text variant="caption" style={styles.callBtnLabel}>
                {t('active.speaker')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.hangUpBtn}
              onPress={hangUpCall}
              activeOpacity={0.8}
            >
              <View style={styles.hangUpIcon}>
                <Phone size={16} color="#FFF" strokeWidth={2.25} />
              </View>
              <Text variant="caption" style={styles.hangUpLabel}>
                {t('active.end')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  // In-call control bar — sits above the TimelineEditor's own header
  // via the `topSlot` prop. Green background mirrors the global
  // `InCallTopBar` so the call state reads as consistent across the app.
  callBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#22C55E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  callBarLeft: {
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
  callTimer: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  callBarControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  callBtnMutedActive: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  callBtnSpeakerActive: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  callBtnLabel: {
    color: '#FFF',
    fontFamily: 'Archivo_500Medium',
    fontSize: 11,
  },
  hangUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#EF4444',
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
  hangUpLabel: {
    color: '#FFF',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 11,
  },
});

import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { showToast } from '@/components/ui/Toast';
import { projectService } from '@/lib/api/projectService';
import { serverClipToLocal } from '../types';
import type { LocalClip } from '../types';

interface UseImportAudioOptions {
  projectId: string;
  activeLaneIndex: number;
  addClip: (clip: LocalClip) => void;
}

export function useImportAudio({
  projectId,
  activeLaneIndex,
  addClip,
}: UseImportAudioOptions) {
  const [isImporting, setIsImporting] = useState(false);

  const importAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'audio/wav',
          'audio/x-wav',
          'audio/mpeg',
          'audio/mp3',
          'audio/mp4',
          'audio/m4a',
          'audio/x-m4a',
          'audio/aac',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      if (!file) return;

      setIsImporting(true);

      const clip = await projectService.uploadAudio(
        projectId,
        file.uri,
        file.name,
        file.mimeType ?? 'audio/wav',
        activeLaneIndex
      );

      // Convert server clip to local and add to timeline
      addClip(serverClipToLocal(clip));
      showToast('Audio imported');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(`Import failed: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  }, [projectId, activeLaneIndex, addClip]);

  return { importAudio, isImporting };
}

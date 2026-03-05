import { useState, useCallback } from 'react';
import { mediaService, type MediaContext } from '@/lib/media/mediaService';

interface UseMediaUploadResult {
  isUploading: boolean;
  progress: number;
  error: string | null;
  upload: (
    fileUri: string,
    fileName: string,
    mimeType: string,
    context: MediaContext
  ) => Promise<string | null>;
  reset: () => void;
}

/**
 * useMediaUpload — React hook wrapping mediaService with progress + error state.
 *
 * Returns the public_id on success, or null on failure.
 */
export function useMediaUpload(): UseMediaUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback(
    async (
      fileUri: string,
      fileName: string,
      mimeType: string,
      context: MediaContext
    ): Promise<string | null> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      try {
        const publicId = await mediaService.upload(
          fileUri,
          fileName,
          mimeType,
          context,
          setProgress
        );
        return publicId;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  return { isUploading, progress, error, upload, reset };
}

/**
 * MediaService — handles Cloudinary signed uploads and media deletion.
 *
 * Single Responsibility: Only manages media upload/delete HTTP calls.
 * The signing happens on our backend; the actual upload goes directly to Cloudinary.
 */

import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';
import * as FileSystem from 'expo-file-system/legacy';
import { Video as VideoCompressor } from 'react-native-compressor';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * Cloudinary rejects a single upload request over ~100MB with HTTP 413. A raw
 * phone video of a minute or two easily exceeds that, which is why Anthony's
 * original 1:02 clip failed while David's WhatsApp-shrunk copy of the same clip
 * uploaded fine (Aug 27). Compress any video above this size first; the cap is
 * set well under 100MB so the compressed result has margin.
 */
const VIDEO_COMPRESS_THRESHOLD_BYTES = 40 * 1024 * 1024; // 40 MB
/** Hard ceiling after compression: above this we stop and tell the user clearly. */
const VIDEO_MAX_UPLOAD_BYTES = 95 * 1024 * 1024; // 95 MB, just under Cloudinary's 413

async function fileSizeBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}

/** Error thrown when a video is still too large after compression. */
export class MediaTooLargeError extends Error {
  constructor(public bytes: number) {
    super('MEDIA_TOO_LARGE');
    this.name = 'MediaTooLargeError';
  }
}

/**
 * Shrink a video below Cloudinary's request limit before upload. Returns the URI
 * to actually upload (compressed when it helped, original otherwise) plus the
 * sizes, so the caller can report them. NEVER throws for a compression failure —
 * it falls back to the original URI so a bad compressor can't block a small
 * video that would have uploaded fine.
 */
async function prepareVideoForUpload(
  fileUri: string,
  onProgress?: (progress: number) => void
): Promise<{
  uri: string;
  originalBytes: number | null;
  finalBytes: number | null;
  compressed: boolean;
}> {
  const originalBytes = await fileSizeBytes(fileUri);
  if (originalBytes !== null && originalBytes <= VIDEO_COMPRESS_THRESHOLD_BYTES) {
    return { uri: fileUri, originalBytes, finalBytes: originalBytes, compressed: false };
  }
  try {
    // 'auto' picks a sensible bitrate/resolution; report the compression phase
    // as the first 40% of the upload progress bar so it never looks frozen.
    const outUri = await VideoCompressor.compress(
      fileUri,
      { compressionMethod: 'auto' },
      (p) => onProgress?.(p * 0.4)
    );
    const finalBytes = await fileSizeBytes(outUri);
    // If compression somehow made it bigger (or unknown), keep whichever is smaller.
    if (finalBytes !== null && originalBytes !== null && finalBytes >= originalBytes) {
      return {
        uri: fileUri,
        originalBytes,
        finalBytes: originalBytes,
        compressed: false,
      };
    }
    return { uri: outUri, originalBytes, finalBytes, compressed: true };
  } catch {
    // Compressor unavailable/failed → upload the original and let the size guard
    // + 413 handling below give a clear outcome.
    return { uri: fileUri, originalBytes, finalBytes: originalBytes, compressed: false };
  }
}

/** Signed upload params returned by our backend. */
interface SignedUploadParams {
  upload_url: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  public_id: string;
  eager?: string;
  /** When true, send `eager_async=true` so Cloudinary builds HLS in background. */
  eager_async?: boolean;
  resource_type: string;
}

/** Cloudinary upload response (subset of fields we care about). */
export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  bytes: number;
}

export type MediaContext = 'avatar' | 'content' | 'audio' | 'chat' | 'video' | 'reel';

/**
 * Get signed upload parameters from our backend.
 */
async function getSignedParams(
  context: MediaContext,
  resourceType: string = 'image'
): Promise<SignedUploadParams> {
  const response = await apiClient.post(API_ENDPOINTS.MEDIA.SIGN, {
    context,
    resource_type: resourceType,
  });
  return response.data.data;
}

/**
 * Upload a file directly to Cloudinary using XMLHttpRequest for progress tracking.
 *
 * @param fileUri   - Local file URI from image picker / camera
 * @param fileName  - Name for the file (e.g. "photo.jpg")
 * @param mimeType  - MIME type (e.g. "image/jpeg")
 * @param params    - Signed params from getSignedParams()
 * @param onProgress - Optional progress callback (0-1)
 */
async function uploadToCloudinary(
  fileUri: string,
  fileName: string,
  mimeType: string,
  params: SignedUploadParams,
  onProgress?: (progress: number) => void
): Promise<CloudinaryUploadResult> {
  const uploadUrl = params.upload_url;

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);
  formData.append('api_key', params.api_key);
  formData.append('timestamp', String(params.timestamp));
  formData.append('signature', params.signature);
  formData.append('folder', params.folder);
  formData.append('public_id', params.public_id);

  if (params.eager) {
    formData.append('eager', params.eager);
  }

  // HLS eager transforms (video/reel) are transcoded in the background so the
  // upload returns immediately. Must match what the backend signed.
  if (params.eager_async) {
    formData.append('eager_async', 'true');
  }

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response from Cloudinary'));
        }
      } else if (xhr.status === 413) {
        // Payload Too Large — the file exceeds Cloudinary's request limit.
        reject(new MediaTooLargeError(-1));
      } else {
        reject(new Error(`Cloudinary upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      console.error('[Upload] XHR error:', xhr.status, xhr.statusText, xhr.responseText);
      reject(new Error(`Network error during upload (${xhr.status})`));
    };
    xhr.timeout = 300000; // 5 minutes for large videos
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(formData);
  });
}

/**
 * Convenience: sign + upload in one call.
 *
 * @returns The full public_id (including folder) on success.
 */
async function upload(
  fileUri: string,
  fileName: string,
  mimeType: string,
  context: MediaContext,
  onProgress?: (progress: number) => void
): Promise<string> {
  let resourceType = 'image';
  if (context === 'audio') resourceType = 'raw';
  else if (context === 'video' || context === 'reel') resourceType = 'video';

  const isVideo = context === 'video' || context === 'reel';
  let uploadUri = fileUri;
  let originalBytes: number | null = null;
  let finalBytes: number | null = null;
  let compressed = false;

  if (isVideo) {
    const prepared = await prepareVideoForUpload(fileUri, onProgress);
    uploadUri = prepared.uri;
    originalBytes = prepared.originalBytes;
    finalBytes = prepared.finalBytes;
    compressed = prepared.compressed;
    // Refuse before we even ask Cloudinary if it's still over the ceiling — a
    // clear "too large" beats a cryptic 413, and saves a doomed 95MB upload.
    if (finalBytes !== null && finalBytes > VIDEO_MAX_UPLOAD_BYTES) {
      analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
        context,
        outcome: 'too_large_precheck',
        original_bytes: originalBytes,
        final_bytes: finalBytes,
        compressed,
      });
      throw new MediaTooLargeError(finalBytes);
    }
  }

  try {
    const params = await getSignedParams(context, resourceType);
    const result = await uploadToCloudinary(
      uploadUri,
      fileName,
      mimeType,
      params,
      // Compression already consumed 0-40% for video; map the network upload to 40-100%.
      isVideo && compressed ? (p) => onProgress?.(0.4 + p * 0.6) : onProgress
    );
    analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
      context,
      outcome: 'uploaded',
      original_bytes: originalBytes,
      final_bytes: finalBytes,
      compressed,
    });
    return result.public_id;
  } catch (error: unknown) {
    const is413 =
      error instanceof MediaTooLargeError ||
      (error instanceof Error && error.message.includes('413'));
    analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
      context,
      outcome: is413 ? 'rejected_413' : 'failed',
      original_bytes: originalBytes,
      final_bytes: finalBytes,
      compressed,
      error: error instanceof Error ? error.message : String(error),
    });
    // Normalize a raw 413 into the typed error so the UI shows the clear message.
    if (is413 && !(error instanceof MediaTooLargeError)) {
      throw new MediaTooLargeError(finalBytes ?? -1);
    }
    throw error;
  }
}

/**
 * Delete media via our backend (which calls Cloudinary destroy API).
 */
async function deleteMedia(
  publicId: string,
  resourceType: string = 'image'
): Promise<void> {
  await apiClient.delete(
    `${API_ENDPOINTS.MEDIA.DELETE(encodeURIComponent(publicId))}?resource_type=${resourceType}`
  );
}

export const mediaService = {
  getSignedParams,
  uploadToCloudinary,
  upload,
  deleteMedia,
};

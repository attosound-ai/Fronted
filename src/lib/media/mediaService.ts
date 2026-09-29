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
import { AUDIO_UPLOAD_MAX_BYTES } from './uploadLimits';
import {
  addProcessProgressListener,
  shrinkVideo,
} from '../../../modules/atto-audio-transcode';

import {
  VIDEO_COMPRESS_THRESHOLD_BYTES,
  VIDEO_MAX_UPLOAD_BYTES,
} from './videoPostLimits';

async function fileSizeBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * Thrown when the media is too large for the upload target. `bytes` is the
 * actual file size (or -1 if unknown); `maxBytes` is the target's limit when we
 * could parse it from the server response — so the UI can show both and suggest
 * compressing.
 */
export class MediaTooLargeError extends Error {
  constructor(
    public bytes: number,
    public maxBytes?: number
  ) {
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
  const smaller = (bytes: number | null) =>
    bytes !== null && bytes > 0 && (originalBytes === null || bytes < originalBytes);

  // 1. ATTO's compressor (AttoVideoShrink): fixed 2 Mbps HEVC 1080p, HDR
  //    tone mapped, so the size is what videoPostLimits promised when the
  //    video was picked. Its progress fills the first 40% of the bar.
  const jobId = `shrink-${Date.now()}`;
  const sub = addProcessProgressListener((e) => {
    if (e.jobId === jobId) onProgress?.(e.progress * 0.4);
  });
  try {
    const out = `${FileSystem.cacheDirectory}video-1080-${Date.now()}.mp4`;
    const shrunk = await shrinkVideo(fileUri, out, jobId);
    if (shrunk && smaller(shrunk.outputBytes)) {
      analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
        context: 'video',
        outcome: 'shrunk_native',
        original_bytes: originalBytes,
        final_bytes: shrunk.outputBytes,
        encode_ms: shrunk.encodeMs,
        duration_ms: shrunk.durationMs,
        preset: shrunk.preset,
      });
      onProgress?.(0.4);
      return {
        uri: shrunk.outputPath,
        originalBytes,
        finalBytes: shrunk.outputBytes,
        compressed: true,
      };
    }
  } catch (error: unknown) {
    analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
      context: 'video',
      outcome: 'shrink_native_failed',
      original_bytes: originalBytes,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    sub?.remove();
  }

  // 2. The JS compressor, only as a fallback: it hands back the original
  //    untouched whenever its export fails (iPhone HDR does that).
  try {
    const outUri = await VideoCompressor.compress(
      fileUri,
      { compressionMethod: 'auto' },
      (p) => onProgress?.(p * 0.4)
    );
    const finalBytes = await fileSizeBytes(outUri);
    if (smaller(finalBytes)) {
      return { uri: outUri, originalBytes, finalBytes, compressed: true };
    }
    analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
      context: 'video',
      outcome: 'compress_not_smaller',
      original_bytes: originalBytes,
      final_bytes: finalBytes,
    });
  } catch (error: unknown) {
    analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
      context: 'video',
      outcome: 'compress_failed',
      original_bytes: originalBytes,
      source_uri_scheme: fileUri.split(':')[0] ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Nothing helped: upload the original and let the size guard give a clear
  // outcome, with the size and the limit.
  return { uri: fileUri, originalBytes, finalBytes: originalBytes, compressed: false };
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

    // A stalled upload used to hang forever with no progress and no error
    // (a file that no longer existed, Sep 29 2026). Sixty seconds without a
    // single byte moving is a dead connection: abort with a network error.
    let lastMove = Date.now();
    const stall = setInterval(() => {
      if (Date.now() - lastMove > 60_000) {
        clearInterval(stall);
        xhr.abort();
        reject(new Error('Network stalled: no upload progress for 60 s'));
      }
    }, 5_000);
    xhr.addEventListener('loadend', () => clearInterval(stall));

    xhr.upload.onprogress = (event) => {
      lastMove = Date.now();
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
        // Payload Too Large: the file exceeds Cloudinary's request limit.
        reject(new MediaTooLargeError(-1));
      } else {
        const body = (xhr.responseText || '').slice(0, 600);
        // Cloudinary returns 400 (not 413) when a file exceeds the per-file
        // limit for its resource type. RAW (how audio uploads) has a much
        // smaller cap than video, so a long WAV lands here. Parse the exact
        // "Got X. Maximum is Y" so the user sees both, and route it through the
        // typed too-large path.
        if (xhr.status === 400 && /too large|maximum is|file size/i.test(body)) {
          const got = body.match(/got\s+(\d+)/i);
          const max = body.match(/maximum(?:\s+is)?\s+(\d+)/i);
          reject(
            new MediaTooLargeError(
              got ? Number(got[1]) : -1,
              max ? Number(max[1]) : undefined
            )
          );
          return;
        }
        const err = new Error(`Cloudinary upload failed (${xhr.status})`) as Error & {
          httpStatus?: number;
          cloudinaryBody?: string;
        };
        err.httpStatus = xhr.status;
        err.cloudinaryBody = body;
        reject(err);
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
      throw new MediaTooLargeError(finalBytes, VIDEO_MAX_UPLOAD_BYTES);
    }
  }

  // Size of what we're actually uploading, for EVERY context (video already
  // has finalBytes from compression; audio/image/etc. are stat'd here). This is
  // the key field for diagnosing size-driven failures — e.g. long WAV audio
  // uploaded as Cloudinary `raw`, whose per-file limit is far below video's.
  const uploadBytes = finalBytes ?? (await fileSizeBytes(uploadUri));

  // Audio over the raw ceiling is refused by Cloudinary only after the whole
  // file went up. Stop here with both numbers so the screen can say them.
  if (
    context === 'audio' &&
    uploadBytes !== null &&
    uploadBytes > AUDIO_UPLOAD_MAX_BYTES
  ) {
    analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
      context,
      resource_type: resourceType,
      outcome: 'too_large_precheck',
      file_bytes: uploadBytes,
      max_bytes: AUDIO_UPLOAD_MAX_BYTES,
    });
    throw new MediaTooLargeError(uploadBytes, AUDIO_UPLOAD_MAX_BYTES);
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
      resource_type: resourceType,
      outcome: 'uploaded',
      file_bytes: uploadBytes,
      original_bytes: originalBytes,
      final_bytes: finalBytes,
      compressed,
    });
    return result.public_id;
  } catch (error: unknown) {
    const is413 =
      error instanceof MediaTooLargeError ||
      (error instanceof Error && error.message.includes('413'));
    // Enriched failure telemetry: the actual HTTP status and the verbatim
    // Cloudinary error body (previously discarded) — so a bare "400" always
    // carries its real reason (e.g. "File size too large. Got X. Maximum is Y"),
    // plus the resource_type and the byte size to correlate.
    const detail = error as Error & { httpStatus?: number; cloudinaryBody?: string };
    analytics.capture(ANALYTICS_EVENTS.FEED.MEDIA_UPLOAD, {
      context,
      resource_type: resourceType,
      outcome: is413 ? 'rejected_413' : 'failed',
      http_status: detail.httpStatus ?? null,
      cloudinary_error: detail.cloudinaryBody ?? null,
      file_bytes: uploadBytes,
      original_bytes: originalBytes,
      final_bytes: finalBytes,
      compressed,
      error: error instanceof Error ? error.message : String(error),
    });
    // Normalize a raw 413 into the typed error so the UI shows the clear message.
    if (is413 && !(error instanceof MediaTooLargeError)) {
      throw new MediaTooLargeError(uploadBytes ?? finalBytes ?? -1);
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

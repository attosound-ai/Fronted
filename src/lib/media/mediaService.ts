/**
 * MediaService — handles Cloudinary signed uploads and media deletion.
 *
 * Single Responsibility: Only manages media upload/delete HTTP calls.
 * The signing happens on our backend; the actual upload goes directly to Cloudinary.
 */

import { apiClient } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/endpoints';

/** Signed upload params returned by our backend. */
interface SignedUploadParams {
  upload_url: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  public_id: string;
  eager?: string;
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
  const params = await getSignedParams(context, resourceType);
  const result = await uploadToCloudinary(
    fileUri,
    fileName,
    mimeType,
    params,
    onProgress
  );
  return result.public_id;
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

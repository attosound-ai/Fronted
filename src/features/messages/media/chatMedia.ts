import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { mediaService } from '@/lib/media/mediaService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { MessageContentType, MessageMetadata } from '../types';

/**
 * What a chat will carry. Generous, like WhatsApp and Telegram, but bounded,
 * and every bound has a sentence the person actually understands.
 */
export const CHAT_MEDIA_LIMITS = {
  /** Longest edge of a photo after shrinking. */
  imageMaxDimension: 1920,
  imageQuality: 0.72,
  /** Below this a photo is sent untouched: shrinking would only cost quality. */
  imageSkipBelowBytes: 220 * 1024,
  videoMaxDurationMs: 10 * 60_000,
  /** Anything above this is compressed before it goes up. */
  videoCompressAboveBytes: 8 * 1024 * 1024,
  /** Cloudinary answers 413 near 100 MB, so this is the hard stop. */
  videoMaxBytes: 95 * 1024 * 1024,
  fileMaxBytes: 100 * 1024 * 1024,
  audioMaxDurationMs: 30 * 60_000,
} as const;

export type MediaRejectionReason =
  | 'video_too_long'
  | 'video_too_big'
  | 'file_too_big'
  | 'audio_too_long';

/** A refusal we can explain: the UI turns the reason into one clear line. */
export class MediaRejectedError extends Error {
  constructor(
    public reason: MediaRejectionReason,
    public detail: Record<string, number | null> = {}
  ) {
    super(reason);
    this.name = 'MediaRejectedError';
  }
}

async function fileBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * Make the capture as light as it can be without looking worse: photos are
 * resized and recompressed, long or heavy videos go through the native
 * compressor, and whatever is still past a limit is refused here, before a
 * single byte travels.
 */
export async function prepareChatMedia(
  media: OutgoingMedia,
  conversationId: string,
  onProgress?: (progress: number) => void
): Promise<OutgoingMedia> {
  if (!media.uri) return media;
  const started = Date.now();
  const originalBytes = media.bytes ?? (await fileBytes(media.uri));

  if (media.kind === 'image') {
    if (
      originalBytes !== null &&
      originalBytes <= CHAT_MEDIA_LIMITS.imageSkipBelowBytes
    ) {
      return { ...media, bytes: originalBytes };
    }
    try {
      const longest = Math.max(media.width ?? 0, media.height ?? 0);
      const scale =
        longest > CHAT_MEDIA_LIMITS.imageMaxDimension
          ? CHAT_MEDIA_LIMITS.imageMaxDimension / longest
          : 1;
      const actions: ImageManipulator.Action[] =
        scale < 1 && media.width && media.height
          ? [
              {
                resize: {
                  width: Math.round(media.width * scale),
                  height: Math.round(media.height * scale),
                },
              },
            ]
          : [];
      const out = await ImageManipulator.manipulateAsync(media.uri, actions, {
        compress: CHAT_MEDIA_LIMITS.imageQuality,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const finalBytes = await fileBytes(out.uri);
      // Keep whichever is smaller: a tiny screenshot can grow as a JPEG.
      if (finalBytes !== null && originalBytes !== null && finalBytes >= originalBytes) {
        return { ...media, bytes: originalBytes };
      }
      analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_COMPRESSED, {
        conversation_id: conversationId,
        kind: 'image',
        original_bytes: originalBytes,
        final_bytes: finalBytes,
        ratio:
          originalBytes && finalBytes
            ? Math.round((finalBytes / originalBytes) * 100)
            : null,
        elapsed_ms: Date.now() - started,
      });
      return {
        ...media,
        uri: out.uri,
        mime: 'image/jpeg',
        bytes: finalBytes ?? undefined,
        width: out.width,
        height: out.height,
      };
    } catch {
      // A failed shrink must never block a photo that would upload fine.
      return { ...media, bytes: originalBytes ?? undefined };
    }
  }

  if (media.kind === 'video' || media.kind === 'video_note') {
    if (
      media.durationMs != null &&
      media.durationMs > CHAT_MEDIA_LIMITS.videoMaxDurationMs
    ) {
      throw new MediaRejectedError('video_too_long', {
        duration_ms: media.durationMs,
        max_ms: CHAT_MEDIA_LIMITS.videoMaxDurationMs,
      });
    }
    let uri = media.uri;
    let finalBytes = originalBytes;
    if (
      originalBytes === null ||
      originalBytes > CHAT_MEDIA_LIMITS.videoCompressAboveBytes
    ) {
      // The same compressor a post uses: ATTO's own first (fixed 2 Mbps HEVC,
      // HDR tone mapped), the JS one only as a fallback. The chat used to call
      // the JS one alone, which hands an iPhone HDR video back untouched and in
      // silence: on Oct 6 2026 a 79 s clip went up at its full 61 MB.
      const prep = await mediaService.prepareVideo(
        media.uri,
        onProgress,
        CHAT_MEDIA_LIMITS.videoCompressAboveBytes
      );
      if (prep.compressed) {
        uri = prep.uri;
        finalBytes = prep.finalBytes ?? finalBytes;
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_COMPRESSED, {
          conversation_id: conversationId,
          kind: media.kind,
          original_bytes: originalBytes,
          final_bytes: prep.finalBytes,
          ratio:
            originalBytes && prep.finalBytes
              ? Math.round((prep.finalBytes / originalBytes) * 100)
              : null,
          elapsed_ms: Date.now() - started,
        });
      } else {
        // Over the bar and still the original: never silent again.
        analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_COMPRESS_SKIPPED, {
          conversation_id: conversationId,
          kind: media.kind,
          original_bytes: originalBytes,
          duration_ms: media.durationMs ?? null,
          elapsed_ms: Date.now() - started,
        });
      }
    }
    if (finalBytes !== null && finalBytes > CHAT_MEDIA_LIMITS.videoMaxBytes) {
      throw new MediaRejectedError('video_too_big', {
        bytes: finalBytes,
        max_bytes: CHAT_MEDIA_LIMITS.videoMaxBytes,
      });
    }
    return { ...media, uri, bytes: finalBytes ?? undefined };
  }

  if (media.kind === 'file') {
    if (originalBytes !== null && originalBytes > CHAT_MEDIA_LIMITS.fileMaxBytes) {
      throw new MediaRejectedError('file_too_big', {
        bytes: originalBytes,
        max_bytes: CHAT_MEDIA_LIMITS.fileMaxBytes,
      });
    }
    return { ...media, bytes: originalBytes ?? undefined };
  }

  if (media.kind === 'audio') {
    if (
      media.durationMs != null &&
      media.durationMs > CHAT_MEDIA_LIMITS.audioMaxDurationMs
    ) {
      throw new MediaRejectedError('audio_too_long', {
        duration_ms: media.durationMs,
        max_ms: CHAT_MEDIA_LIMITS.audioMaxDurationMs,
      });
    }
  }
  return { ...media, bytes: originalBytes ?? undefined };
}

/**
 * Something the user picked or recorded and wants to send. `uri` is local
 * until `uploadChatMedia` returns the hosted url; a contact has no file.
 */
export interface OutgoingMedia {
  kind: Exclude<MessageContentType, 'text' | 'location'>;
  uri?: string;
  mime?: string;
  fileName?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  /** 0 to 1 bars, voice notes only. */
  waveform?: number[];
  contact?: { name: string; phone?: string; email?: string };
}

export const MEDIA_CONTENT_TYPES: MessageContentType[] = [
  'audio',
  'video_note',
  'image',
  'video',
  'file',
  'contact',
  'location',
  'post',
];

export function isMediaContentType(type: string | undefined | null): boolean {
  return (
    !!type && type !== 'text' && MEDIA_CONTENT_TYPES.includes(type as MessageContentType)
  );
}

/** Bubbles whose content fills the bubble (no text padding). */
export function isVisualContentType(type: string | undefined | null): boolean {
  return type === 'image' || type === 'video' || type === 'video_note';
}

function resourceTypeFor(kind: OutgoingMedia['kind']): 'image' | 'video' | 'raw' {
  if (kind === 'image') return 'image';
  if (kind === 'file') return 'raw';
  // Cloudinary stores audio under the video resource type.
  return 'video';
}

/**
 * Upload a picked or recorded file for a chat message and return its hosted
 * url plus the metadata the bubble needs. Contacts skip the upload.
 */
export async function uploadChatMedia(
  media: OutgoingMedia,
  conversationId: string,
  onProgress?: (progress: number) => void
): Promise<{ content: string; metadata: MessageMetadata }> {
  const started = Date.now();
  const base: MessageMetadata = {
    durationMs: media.durationMs,
    waveform: media.waveform,
    mime: media.mime,
    width: media.width,
    height: media.height,
    fileName: media.fileName,
    bytes: media.bytes,
  };
  if (media.kind === 'contact') {
    return {
      content: JSON.stringify(media.contact ?? {}),
      metadata: { ...base, contact: media.contact },
    };
  }
  if (!media.uri) throw new Error('media has no file');
  const mediaUriBefore = media.uri;
  const prepared = await prepareChatMedia(media, conversationId, onProgress);
  const uploadUri = prepared.uri ?? media.uri;
  media = prepared;
  base.bytes = prepared.bytes ?? base.bytes;
  base.width = prepared.width ?? base.width;
  base.height = prepared.height ?? base.height;
  base.mime = prepared.mime ?? base.mime;
  analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_UPLOAD_STARTED, {
    conversation_id: conversationId,
    kind: media.kind,
    bytes: media.bytes ?? null,
    duration_ms: media.durationMs ?? null,
    compressed: uploadUri !== mediaUriBefore,
    transport:
      media.kind === 'video' || media.kind === 'video_note' || media.kind === 'file'
        ? 'background'
        : 'direct',
  });
  try {
    const params = await mediaService.getSignedParams(
      'chat',
      resourceTypeFor(media.kind)
    );
    // Compressing filled the first 40 % of the ring; the upload takes the rest.
    const from = uploadUri !== mediaUriBefore ? 0.4 : 0;
    const onUpload = onProgress
      ? (p: number) => onProgress(from + (1 - from) * p)
      : undefined;
    // Heavy kinds ride the system's background session so leaving the app does
    // not kill them; photos and voice notes are quick and keep the direct path.
    const heavy =
      media.kind === 'video' || media.kind === 'video_note' || media.kind === 'file';
    const send = heavy
      ? mediaService.uploadToCloudinaryInBackground
      : mediaService.uploadToCloudinary;
    const result = await send(
      uploadUri,
      media.fileName ?? defaultFileName(media),
      media.mime ?? defaultMime(media),
      params,
      onUpload
    );
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_UPLOAD_DONE, {
      conversation_id: conversationId,
      kind: media.kind,
      bytes: result.bytes,
      elapsed_ms: Date.now() - started,
    });
    return {
      content: result.secure_url,
      metadata: {
        ...base,
        bytes: result.bytes ?? media.bytes,
        width: result.width || media.width,
        height: result.height || media.height,
      },
    };
  } catch (error) {
    analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_UPLOAD_FAILED, {
      conversation_id: conversationId,
      kind: media.kind,
      elapsed_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      detail:
        (error as { cloudinaryBody?: string }).cloudinaryBody?.slice(0, 300) ?? null,
    });
    throw error;
  }
}

function defaultFileName(media: OutgoingMedia): string {
  const stamp = Date.now();
  switch (media.kind) {
    case 'audio':
      return `voice-${stamp}.m4a`;
    case 'video_note':
    case 'video':
      return `video-${stamp}.mp4`;
    case 'image':
      return `photo-${stamp}.jpg`;
    default:
      return `file-${stamp}`;
  }
}

function defaultMime(media: OutgoingMedia): string {
  switch (media.kind) {
    case 'audio':
      return 'audio/m4a';
    case 'video_note':
    case 'video':
      return 'video/mp4';
    case 'image':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

/** Short label for previews and notifications of a non text message. */
export function mediaPreviewLabel(
  contentType: string | undefined | null,
  t: (key: string) => string
): string | null {
  switch (contentType) {
    case 'audio':
      return t('media.previewAudio');
    case 'video_note':
      return t('media.previewVideoNote');
    case 'image':
      return t('media.previewImage');
    case 'video':
      return t('media.previewVideo');
    case 'file':
      return t('media.previewFile');
    case 'contact':
      return t('media.previewContact');
    case 'location':
      return t('media.previewLocation');
    case 'post':
      return t('media.previewPost');
    default:
      return null;
  }
}

/** The server writes `[audio]` style markers as the conversation preview. */
export function previewFromServer(
  lastMessage: string | null | undefined,
  t: (key: string) => string
): string {
  if (!lastMessage) return '';
  const marker = /^\[([a-z_]+)\]\s*/.exec(lastMessage);
  if (!marker) return lastMessage;
  if (marker[1] === 'thread') return lastMessage.slice(marker[0].length);
  return mediaPreviewLabel(marker[1], t) ?? lastMessage;
}

/** Downsample metering samples into `bars` values between 0 and 1. */
export function waveformFromSamples(samples: number[], bars = 40): number[] {
  if (samples.length === 0) return [];
  const out: number[] = [];
  const step = samples.length / bars;
  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = start; j < end && j < samples.length; j++)
      peak = Math.max(peak, samples[j]);
    out.push(Math.min(1, peak));
  }
  // Quiet notes still get a readable wave: scale so the loudest bar is full,
  // the way WhatsApp draws them (skip near silence, which stays flat).
  const max = Math.max(...out);
  const scaled = max > 0.05 ? out.map((v) => v / max) : out;
  return scaled.map((v) => Math.round(v * 100) / 100);
}

/** Recorder metering comes in dBFS (about -160 to 0): map to 0 to 1. */
export function levelFromDb(db: number | undefined | null): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  const clamped = Math.max(-60, Math.min(0, db));
  return (clamped + 60) / 60;
}

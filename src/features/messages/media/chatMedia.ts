import { mediaService } from '@/lib/media/mediaService';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import type { MessageContentType, MessageMetadata } from '../types';

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
  analytics.capture(ANALYTICS_EVENTS.MESSAGES.MEDIA_UPLOAD_STARTED, {
    conversation_id: conversationId,
    kind: media.kind,
    bytes: media.bytes ?? null,
    duration_ms: media.durationMs ?? null,
  });
  try {
    const params = await mediaService.getSignedParams(
      'chat',
      resourceTypeFor(media.kind)
    );
    const result = await mediaService.uploadToCloudinary(
      media.uri,
      media.fileName ?? defaultFileName(media),
      media.mime ?? defaultMime(media),
      params,
      onProgress
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

import type { MessageContentType } from '../types';

/**
 * A picked or recorded file on its way out of the composer, before it is
 * uploaded and sent. Kept in its own file with no native imports so the pure
 * logic around it (the attachment tray) can be tested without pulling in the
 * upload pipeline.
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

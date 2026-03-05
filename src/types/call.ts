export type CallStatus =
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'no-answer'
  | 'busy'
  | 'failed';

export type CallDirection = 'inbound' | 'outbound';

export interface CallRecord {
  id: string;
  twilioCallSid: string;
  fromNumber: string;
  toNumber: string;
  userId: string;
  direction: CallDirection;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  metadata: Record<string, unknown>;
  segments?: AudioSegment[];
  createdAt: string;
  updatedAt: string;
}

export interface AudioSegment {
  id: string;
  callId: string;
  twilioStreamSid: string | null;
  segmentIndex: number;
  track: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  format: string;
  sampleRate: number;
  fileSizeBytes: number | null;
  storageBucket: string;
  storageKey: string;
  label: string | null;
  projectId: string | null;
  downloadUrl?: string;
  createdAt: string;
}

export type ActiveCallState = 'idle' | 'ringing' | 'connected' | 'reconnecting';

export interface ActiveCall {
  callSid: string;
  fromNumber: string;
  state: ActiveCallState;
  isMuted: boolean;
  isOnHold: boolean;
  isSpeaker: boolean;
  isCapturing: boolean;
  activeStreamSid: string | null;
  connectedAt: Date | null;
}

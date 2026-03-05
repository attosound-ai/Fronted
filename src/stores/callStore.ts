import { create } from 'zustand';
import type { ActiveCall, ActiveCallState } from '@/types/call';

interface CallStoreState {
  activeCall: ActiveCall | null;
  activeProjectId: string | null;
  isRegistered: boolean;
  registrationError: string | null;
}

interface CallStoreActions {
  setRegistered: (registered: boolean, error?: string | null) => void;
  setIncomingCall: (callSid: string, fromNumber: string) => void;
  setCallState: (state: ActiveCallState) => void;
  setMuted: (muted: boolean) => void;
  setOnHold: (hold: boolean) => void;
  setSpeaker: (speaker: boolean) => void;
  startCapture: (streamSid: string) => void;
  stopCapture: () => void;
  setActiveProjectId: (id: string | null) => void;
  endCall: () => void;
}

export const useCallStore = create<CallStoreState & CallStoreActions>((set) => ({
  activeCall: null,
  activeProjectId: null,
  isRegistered: false,
  registrationError: null,

  setRegistered: (registered, error = null) =>
    set({ isRegistered: registered, registrationError: error }),

  setIncomingCall: (callSid, fromNumber) =>
    set({
      activeCall: {
        callSid,
        fromNumber,
        state: 'ringing',
        isMuted: false,
        isOnHold: false,
        isSpeaker: false,
        isCapturing: false,
        activeStreamSid: null,
        connectedAt: null,
      },
    }),

  setCallState: (state) =>
    set((prev) => {
      if (!prev.activeCall) return prev;
      return {
        activeCall: {
          ...prev.activeCall,
          state,
          connectedAt:
            state === 'connected' && !prev.activeCall.connectedAt
              ? new Date()
              : prev.activeCall.connectedAt,
        },
      };
    }),

  setMuted: (muted) =>
    set((prev) => {
      if (!prev.activeCall) return prev;
      return { activeCall: { ...prev.activeCall, isMuted: muted } };
    }),

  setOnHold: (hold) =>
    set((prev) => {
      if (!prev.activeCall) return prev;
      return { activeCall: { ...prev.activeCall, isOnHold: hold } };
    }),

  setSpeaker: (speaker) =>
    set((prev) => {
      if (!prev.activeCall) return prev;
      return { activeCall: { ...prev.activeCall, isSpeaker: speaker } };
    }),

  startCapture: (streamSid) =>
    set((prev) => {
      if (!prev.activeCall) return prev;
      return {
        activeCall: {
          ...prev.activeCall,
          isCapturing: true,
          activeStreamSid: streamSid,
        },
      };
    }),

  stopCapture: () =>
    set((prev) => {
      if (!prev.activeCall) return prev;
      return {
        activeCall: {
          ...prev.activeCall,
          isCapturing: false,
          activeStreamSid: null,
        },
      };
    }),

  setActiveProjectId: (id) => set({ activeProjectId: id }),

  endCall: () => set({ activeCall: null, activeProjectId: null }),
}));

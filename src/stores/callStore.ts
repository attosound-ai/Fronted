import { create } from 'zustand';
import type { ActiveCall, ActiveCallState } from '@/types/call';
import type { InjectionSnapshot } from '@/lib/callAudio/AudioInjector';

interface CallStoreState {
  activeCall: ActiveCall | null;
  activeProjectId: string | null;
  isRegistered: boolean;
  registrationError: string | null;
  // DTMF keypad overlay visibility. Lives at store level (not on ActiveCall)
  // so a single global host can render the sheet for every call surface.
  keypadVisible: boolean;
  routePickerVisible: boolean;
  // Live audio-injection snapshot (a phone-side track played INTO the call).
  // Store-level for the same reason as keypadVisible — a single global host
  // (CallAudioInjectionHost) renders the now-playing UI for every call surface.
  // null when nothing is being injected. Cleared on endCall so a hang-up can
  // never strand a playing engine in the UI.
  injection: InjectionSnapshot | null;
  // True when Twilio is reporting network-quality warnings (high jitter / packet
  // loss / RTT / low MOS). Drives the "Weak signal" chip so a user attributes
  // cutouts to their connection, not the app (Anthony, Aug 5: "not 100% sure it
  // might be on my end"). Reset per call; held briefly after warnings clear.
  networkWeak: boolean;
}

interface CallStoreActions {
  setRegistered: (registered: boolean, error?: string | null) => void;
  setIncomingCall: (callSid: string, fromNumber: string) => void;
  /**
   * Hydrate the store from a call that ALREADY exists in the native SDK — the
   * cold-launch case where CallKit answered before JS booted. setIncomingCall
   * never ran (its CallInvite event fired into a dead process), so without this
   * the store's activeCall stays null and setCallState is a no-op: zero in-call
   * UI over a live, audible call (David's b145 FASE 1A). Direction is 'inbound'
   * by construction (only incoming calls can be CallKit-answered).
   */
  setRecoveredCall: (
    callSid: string,
    fromNumber: string,
    connectedAt: Date | null
  ) => void;
  setCallerUsername: (username: string) => void;
  setOutgoingCall: (callSid: string, recipientId: string, recipientName?: string) => void;
  setCallState: (state: ActiveCallState) => void;
  setMuted: (muted: boolean) => void;
  setOnHold: (hold: boolean) => void;
  setSpeaker: (speaker: boolean) => void;
  startCapture: (streamSid: string) => void;
  stopCapture: () => void;
  setActiveProjectId: (id: string | null) => void;
  showKeypad: () => void;
  hideKeypad: () => void;
  /**
   * Audio route picker sheet (b155). Our OWN 3-option sheet (Bluetooth / oído /
   * altavoz): the system AVRoutePickerView lists DEVICES, not ports, so with a
   * speaker override active the earpiece option simply does not exist there.
   * Store-level like keypadVisible: one global host serves every call surface.
   */
  showRoutePicker: () => void;
  hideRoutePicker: () => void;
  setInjection: (snapshot: InjectionSnapshot | null) => void;
  setNetworkWeak: (weak: boolean) => void;
  endCall: () => void;
}

export const useCallStore = create<CallStoreState & CallStoreActions>((set) => ({
  activeCall: null,
  activeProjectId: null,
  isRegistered: false,
  registrationError: null,
  keypadVisible: false,
  routePickerVisible: false,
  injection: null,
  networkWeak: false,

  setRegistered: (registered, error = null) =>
    set({ isRegistered: registered, registrationError: error }),

  setIncomingCall: (callSid, fromNumber) =>
    set({
      activeCall: {
        callSid,
        fromNumber,
        direction: 'inbound',
        state: 'ringing',
        isMuted: false,
        isOnHold: false,
        isSpeaker: false,
        isCapturing: false,
        activeStreamSid: null,
        connectedAt: null,
      },
    }),

  setRecoveredCall: (callSid, fromNumber, connectedAt) =>
    set({
      activeCall: {
        callSid,
        fromNumber,
        direction: 'inbound',
        state: 'connected',
        isMuted: false,
        isOnHold: false,
        isSpeaker: false,
        isCapturing: false,
        activeStreamSid: null,
        connectedAt: connectedAt ?? new Date(),
      },
    }),

  setCallerUsername: (username) =>
    set((prev) => {
      if (!prev.activeCall) return prev;
      return { activeCall: { ...prev.activeCall, callerUsername: username } };
    }),

  setOutgoingCall: (callSid, recipientId, recipientName) =>
    set({
      activeCall: {
        callSid,
        fromNumber: '',
        direction: 'outbound',
        recipientId,
        recipientName,
        state: 'ringing-outgoing',
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

  showKeypad: () => set({ keypadVisible: true }),
  hideKeypad: () => set({ keypadVisible: false }),

  showRoutePicker: () => set({ routePickerVisible: true }),
  hideRoutePicker: () => set({ routePickerVisible: false }),

  setInjection: (snapshot) => set({ injection: snapshot }),

  setNetworkWeak: (weak) => set({ networkWeak: weak }),

  endCall: () =>
    set({
      activeCall: null,
      activeProjectId: null,
      keypadVisible: false,
      routePickerVisible: false,
      injection: null,
      networkWeak: false,
    }),
}));

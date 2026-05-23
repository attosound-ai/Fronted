/**
 * Signup Store — drives the in-progress registration wizard.
 *
 * The server is authoritative for `nextStep` and the draft. The client only
 * persists three things across cold starts:
 *   1. The session UUID (so we can recover after re-launch).
 *   2. The signup_pending JWT (so /signup/sessions/me works on first hydration).
 *   3. The draft + nextStep cached from the last server response (so we can
 *      paint the wizard immediately while we re-fetch in the background).
 *
 * MMKV is used (vs SecureStore) because:
 *   - It's synchronous → no flash of "wrong step" between mount and rehydrate.
 *   - 30-100x faster than AsyncStorage.
 *   - The signup_pending JWT is scoped (only reaches /signup/*) so storing it
 *     in MMKV instead of Keychain has limited blast radius. Full user tokens
 *     stay in SecureStore.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import * as Sentry from '@sentry/react-native';
import { signupService } from '@/lib/api/signupService';
import { getErrorMessage } from '@/utils/formatters';
import type {
  SignupDraftPatch,
  SignupDraftView,
  SignupNextStep,
  SignupSessionView,
} from '@/types';
import type { StartSignupParams } from '@/lib/api/signupService';

// react-native-mmkv@4 ships a factory function (`createMMKV`) instead of the
// v3 `new MMKV(...)` constructor. The `MMKV` named export is a type-only
// alias now; calling `new` on it crashes at module load with
// "Cannot read property 'prototype' of undefined".
const mmkv = createMMKV({ id: 'signup' });

interface SignupState {
  // Persisted across cold starts.
  sessionId: string | null;
  token: string | null;
  tokenExpiresAt: number | null; // unix ms
  draft: SignupDraftView | null;
  nextStep: SignupNextStep | null;
  completedSteps: string[];
  identifier: string | null;
  identifierType: 'email' | 'phone' | null;

  // Transient.
  hasHydrated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

interface SignupActions {
  /** Start a new session (or re-use an active one server-side). */
  start: (params: StartSignupParams) => Promise<void>;
  /**
   * Verify OTP for the current session; receives signup_pending token.
   * Optional `draft` is merged into the server-side session BEFORE the OTP
   * roundtrip — used to flush name/dob/password atomically so a lost
   * response doesn't leave the server verified without the user's data.
   */
  verifyOtp: (code: string, draft?: SignupDraftPatch) => Promise<void>;
  /** Sync the server-side session into the local store. Idempotent. */
  refresh: () => Promise<void>;
  /** Save a partial draft. Server merges and returns updated view. */
  patch: (patch: SignupDraftPatch) => Promise<void>;
  /** Promote the session into a real user. Returns the full-scope tokens. */
  complete: () => Promise<Awaited<ReturnType<typeof signupService.complete>>>;
  /** User explicitly exited; clears local state + tells server. */
  abandon: () => Promise<void>;
  /** Local-only reset (e.g. after promote-to-user when token rotated). */
  clear: () => void;
  /** Used by zustand/persist after rehydration. */
  setHasHydrated: (v: boolean) => void;
}

const initialState: SignupState = {
  sessionId: null,
  token: null,
  tokenExpiresAt: null,
  draft: null,
  nextStep: null,
  completedSteps: [],
  identifier: null,
  identifierType: null,
  hasHydrated: false,
  isLoading: false,
  isRefreshing: false,
  error: null,
};

function adoptSession(session: SignupSessionView) {
  return {
    sessionId: session.id,
    draft: session.draft,
    nextStep: session.nextStep,
    completedSteps: session.completedSteps,
    identifier: session.identifier,
    identifierType: session.identifierType,
  };
}

export const useSignupStore = create<SignupState & SignupActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      start: async (params) => {
        set({ isLoading: true, error: null });
        try {
          const result = await signupService.start(params);
          set({
            sessionId: result.sessionId,
            // No token yet — emitted after verifyOtp.
            token: null,
            tokenExpiresAt: null,
            identifier: params.identifier,
            identifierType: params.identifierType,
            nextStep: 'otp',
            completedSteps: [],
            draft: null,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false, error: getErrorMessage(err, 'Failed to start signup') });
          throw err;
        }
      },

      verifyOtp: async (code, draft) => {
        const { sessionId } = get();
        if (!sessionId) throw new Error('No active signup session');
        set({ isLoading: true, error: null });
        try {
          const result = await signupService.verifyOtp(sessionId, code, draft);
          const exp = Date.now() + result.expiresIn * 1000;
          set({
            token: result.token,
            tokenExpiresAt: exp,
            ...adoptSession(result.session),
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false, error: getErrorMessage(err, 'Invalid code') });
          throw err;
        }
      },

      refresh: async () => {
        const { token } = get();
        if (!token) return;
        set({ isRefreshing: true, error: null });
        try {
          const session = await signupService.me();
          set({ ...adoptSession(session), isRefreshing: false });
        } catch (err) {
          // 404/410 means the session is gone server-side — clear local copy.
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 404 || status === 410) {
            get().clear();
          } else {
            Sentry.captureException(err, { tags: { subsystem: 'signup_refresh' } });
            set({ isRefreshing: false, error: getErrorMessage(err, 'Failed to load signup state') });
          }
        }
      },

      patch: async (patch) => {
        set({ isLoading: true, error: null });
        try {
          const session = await signupService.patch(patch);
          set({ ...adoptSession(session), isLoading: false });
        } catch (err) {
          set({ isLoading: false, error: getErrorMessage(err, 'Failed to save') });
          throw err;
        }
      },

      complete: async () => {
        set({ isLoading: true, error: null });
        try {
          const result = await signupService.complete();
          // Don't clear locally yet — caller (authStore) hands off to a full
          // session first, then calls clear() once tokens are rotated.
          set({ isLoading: false });
          return result;
        } catch (err) {
          set({ isLoading: false, error: getErrorMessage(err, 'Could not complete registration') });
          throw err;
        }
      },

      abandon: async () => {
        try {
          if (get().token) {
            await signupService.abandon();
          }
        } catch (err) {
          // Best-effort — clear locally even if the server call fails.
          Sentry.captureException(err, { tags: { subsystem: 'signup_abandon' } });
        } finally {
          get().clear();
        }
      },

      clear: () => set({ ...initialState, hasHydrated: true }),

      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'atto-signup-v1',
      storage: createJSONStorage(() => ({
        getItem: (key) => mmkv.getString(key) ?? null,
        setItem: (key, value) => mmkv.set(key, value),
        // v4 renamed `delete` to `remove`. Return type is `boolean`, but
        // zustand/persist expects void → discard it.
        removeItem: (key) => { mmkv.remove(key); },
      })),
      // Only persist what we genuinely need to resume. Skipping `isLoading`,
      // `isRefreshing`, etc. is important — those should never come back true
      // after a cold start.
      partialize: (state) => ({
        sessionId: state.sessionId,
        token: state.token,
        tokenExpiresAt: state.tokenExpiresAt,
        draft: state.draft,
        nextStep: state.nextStep,
        completedSteps: state.completedSteps,
        identifier: state.identifier,
        identifierType: state.identifierType,
      }),
      onRehydrateStorage: () => (state) => {
        // If the persisted token has already expired, drop it. The session may
        // still exist server-side but we'd need to re-start anyway.
        if (state?.tokenExpiresAt && state.tokenExpiresAt < Date.now()) {
          state.sessionId = null;
          state.token = null;
          state.tokenExpiresAt = null;
          state.draft = null;
          state.nextStep = null;
          state.completedSteps = [];
        }
        state?.setHasHydrated(true);
      },
    },
  ),
);

/**
 * Read the current signup_pending token synchronously. Used by the axios
 * request interceptor so /signup/* calls automatically authenticate.
 */
export function getSignupToken(): string | null {
  const { token, tokenExpiresAt } = useSignupStore.getState();
  if (!token) return null;
  if (tokenExpiresAt && tokenExpiresAt < Date.now()) return null;
  return token;
}

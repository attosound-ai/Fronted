import { create } from 'zustand';
import { AxiosError } from 'axios';
import * as Sentry from '@sentry/react-native';
import i18n from '@/lib/i18n';
import { authService } from '@/lib/api/authService';
import { authStorage, migrateKeychainAccessibility } from '@/lib/auth/storage';
import { getSessionEpoch, bumpSessionEpoch } from '@/lib/auth/sessionEpoch';
import { getTokenUserId } from '@/lib/auth/jwt';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { getErrorMessage } from '@/utils/formatters';
import { queryClient } from '@/lib/queryClient';
import { persistSentryUserForNative } from '@/lib/telemetry/sentryNativeUser';
import { useSubscriptionStore } from './subscriptionStore';
import type {
  User,
  LoginDTO,
  RegisterDTO,
  UpdateProfileDTO,
  TokenPair,
  TwoFactorMethod,
} from '@/types';
import { useAccountStore } from './accountStore';

interface Pending2FA {
  tempToken: string;
  method: TwoFactorMethod;
  maskedTarget: string;
}

interface AuthState {
  user: User | null;
  tokens: TokenPair | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  pending2FA: Pending2FA | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  login: (credentials: LoginDTO) => Promise<void>;
  register: (data: RegisterDTO) => Promise<void>;
  adoptCompletedSignup: (
    user: User,
    tokens: TokenPair,
    linkedAccount?: { user: User; tokens: TokenPair }
  ) => Promise<void>;
  updateProfile: (data: UpdateProfileDTO) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<TokenPair | null>;
  /**
   * Ask the server who the current tokens belong to; if that disagrees with
   * the UI user, rebuild the session around the server's answer. Returns the
   * healed user, or null when identities already agree / nothing was proven.
   */
  reconcileServerIdentity: (reason: string) => Promise<User | null>;
  expireSession: (reason: string) => Promise<void>;
  clearError: () => void;
  setUser: (user: User) => void;
  verify2FALogin: (code: string) => Promise<void>;
  clearPending2FA: () => void;
}

const initialState: AuthState = {
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: true,
  isAuthenticating: false,
  error: null,
  pending2FA: null,
};

/**
 * Register a freshly authenticated session with accountStore so the switcher
 * reflects the current user. Without this, activeAccountId can remain pointing
 * to a previously switched account while authStore shows the new one.
 */
async function registerActiveSession(user: User, tokens: TokenPair): Promise<void> {
  const accountStore = useAccountStore.getState();
  await accountStore.addAccount({ user, tokens });
  await accountStore.setActive(user.id);
}

/**
 * A credential rejection the server actually stands behind (4xx auth codes),
 * as opposed to a transient failure (timeout, network, 5xx) that proves
 * nothing about the session. Sessions may only be expired on the former;
 * failing open on the latter is what keeps backend outages from logging
 * users out.
 */
function isDefinitiveAuthRejection(error: unknown): boolean {
  if (!(error instanceof AxiosError)) return false;
  const status = error.response?.status;
  return status === 400 || status === 401 || status === 403;
}

// Single-flight guards. Concurrent callers share one in-flight promise so a
// cold start (initialize + interceptor 401s) performs exactly one refresh,
// and parallel desync observers trigger exactly one reconciliation.
let refreshInFlight: { epoch: number; promise: Promise<TokenPair | null> } | null = null;
let reconcileInFlight: Promise<User | null> | null = null;

/**
 * Make the SERVER's answer for the current tokens the active identity.
 *
 * Used when the UI user and the token subject are proven to disagree. The
 * tokens are what actually authenticate every request (and the Phoenix
 * socket), so the token side wins and UI/state/storage are rebuilt around
 * it. All caches that could mix both identities are cleared.
 */
async function adoptServerIdentity(me: User, reason: string): Promise<void> {
  bumpSessionEpoch();
  const accessToken = await authStorage.getToken();
  const refreshToken = await authStorage.getRefreshToken();
  if (!accessToken || !refreshToken) return;
  const tokens: TokenPair = { accessToken, refreshToken, expiresIn: 0 };

  await authStorage.setUser(me);
  await registerActiveSession(me, tokens);
  useAuthStore.setState({ user: me, tokens, isAuthenticated: true, isLoading: false });

  queryClient.clear();
  useSubscriptionStore.getState().clear();
  void useSubscriptionStore.getState().fetchSubscription();

  analytics.identify(me);
  Sentry.setUser({
    id: String(me.id),
    email: me.email,
    name: me.username,
    username: me.username,
  });
  analytics.capture(ANALYTICS_EVENTS.AUTH.IDENTITY_DESYNC_HEALED, {
    reason,
    healed_user_id: me.id,
  });
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  ...initialState,

  /**
   * Restore session from SecureStore on app start.
   * Validates stored tokens with GET /auth/me.
   *
   * Every write below is guarded by the session epoch captured at entry: if
   * a login/switch/logout takes ownership while this restore's network calls
   * are in flight, the late results are DISCARDED, never applied. A delayed
   * getMe() once resolved ~16s late (backend outage) and overwrote a
   * just-switched session's user without its tokens, splitting UI identity
   * from request identity for the rest of the day.
   */
  initialize: async () => {
    const epochAtStart = getSessionEpoch();
    const isStale = () => getSessionEpoch() !== epochAtStart;
    try {
      set({ isLoading: true, error: null });

      // One-time hardening: re-write any credentials still stored under the
      // legacy lock-only keychain policy so they become background-readable
      // for incoming VoIP calls. Runs here (foreground) where the old items
      // are still readable; idempotent and self-skipping thereafter.
      await migrateKeychainAccessibility();

      const accessToken = await authStorage.getToken();
      const refreshToken = await authStorage.getRefreshToken();
      const storedUser = await authStorage.getUser<User>();

      if (!accessToken || !refreshToken) {
        if (storedUser) {
          // Stored user without tokens is a keychain failure, not a normal
          // logged-out boot — make it visible instead of silently landing
          // the user on the welcome screen.
          analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_MISSING_TOKENS, {
            has_access_token: Boolean(accessToken),
            has_refresh_token: Boolean(refreshToken),
          });
        }
        if (!isStale()) set({ ...initialState, isLoading: false });
        return;
      }

      const tokens: TokenPair = { accessToken, refreshToken, expiresIn: 0 };

      // Optimistically show stored user for instant UI
      if (storedUser && !isStale()) {
        set({ user: storedUser, tokens, isAuthenticated: true, isLoading: false });
      }

      // Validate session + fetch subscription + load accounts in PARALLEL
      try {
        const [freshUser] = await Promise.all([
          authService.getMe(),
          useSubscriptionStore.getState().fetchSubscription(),
          useAccountStore.getState().loadAccounts(),
        ]);
        if (isStale()) return;

        if (storedUser && Number(freshUser.id) !== Number(storedUser.id)) {
          // Stored user and stored tokens belong to DIFFERENT accounts
          // (persisted desync). getMe answered for the tokens' account —
          // adopt that identity wholesale.
          analytics.capture(ANALYTICS_EVENTS.AUTH.IDENTITY_DESYNC_DETECTED, {
            source: 'initialize',
            ui_user_id: storedUser.id,
            server_user_id: freshUser.id,
          });
          await adoptServerIdentity(freshUser, 'initialize_mismatch');
          analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_RESTORED);
          return;
        }

        await authStorage.setUser(freshUser);
        set({ user: freshUser, isAuthenticated: true, isLoading: false });
        analytics.identify(freshUser);
        Sentry.setUser({
          id: String(freshUser.id),
          email: freshUser.email,
          name: freshUser.username,
          username: freshUser.username,
        });
        analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_RESTORED);
      } catch (validationError: unknown) {
        if (isStale()) return;

        if (!isDefinitiveAuthRejection(validationError)) {
          // Backend unreachable or degraded (timeout, 502, network). The
          // stored session is not proven invalid — keep it and re-validate
          // lazily via the interceptor. A backend outage must never log
          // users out.
          analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_RESTORE_DEFERRED, {
            phase: 'getme',
            status:
              validationError instanceof AxiosError
                ? validationError.response?.status
                : undefined,
            error_code:
              validationError instanceof AxiosError ? validationError.code : undefined,
          });
          set({ isLoading: false });
          return;
        }

        // Token rejected — try refresh
        let newTokens: TokenPair | null = null;
        try {
          newTokens = await get().refreshTokens();
        } catch {
          // Transient refresh failure — same fail-open policy as above.
          if (!isStale()) {
            analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_RESTORE_DEFERRED, {
              phase: 'refresh',
            });
            set({ isLoading: false });
          }
          return;
        }
        if (isStale()) return;

        if (newTokens) {
          try {
            const freshUser = await authService.getMe();
            if (isStale()) return;
            if (storedUser && Number(freshUser.id) !== Number(storedUser.id)) {
              analytics.capture(ANALYTICS_EVENTS.AUTH.IDENTITY_DESYNC_DETECTED, {
                source: 'initialize_after_refresh',
                ui_user_id: storedUser.id,
                server_user_id: freshUser.id,
              });
              await adoptServerIdentity(freshUser, 'initialize_mismatch_after_refresh');
              return;
            }
            await authStorage.setUser(freshUser);
            set({ user: freshUser, isAuthenticated: true, isLoading: false });
          } catch (getMeError: unknown) {
            if (isStale()) return;
            if (isDefinitiveAuthRejection(getMeError)) {
              await get().expireSession('init_getme_after_refresh');
            } else {
              analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_RESTORE_DEFERRED, {
                phase: 'getme_after_refresh',
              });
              set({ isLoading: false });
            }
          }
        } else {
          await get().expireSession('init_refresh_failed');
        }
      }
    } catch {
      if (isStale()) return;
      await get().expireSession('init_unexpected_error');
    } finally {
      // Release the loading gate on EVERY exit path. The stale early-returns
      // above skip their `set` calls by design, and a PushKit auto-switch can
      // take ownership before the first one runs — without this, the app
      // would sit on the splash/loading screen forever. The router keys off
      // isLoading, so leaking it true is a hang, not a cosmetic issue.
      if (get().isLoading) set({ isLoading: false });
    }
  },

  login: async (credentials: LoginDTO) => {
    try {
      set({ isAuthenticating: true, error: null, pending2FA: null });

      const result = await authService.login(credentials);

      // 2FA required — store temp state and return without navigating
      if ('requires2FA' in result && result.requires2FA) {
        set({
          isAuthenticating: false,
          pending2FA: {
            tempToken: result.tempToken,
            method: result.method,
            maskedTarget: result.maskedTarget,
          },
        });
        return;
      }

      const { user, tokens } = result as { user: User; tokens: TokenPair };

      // New identity takes ownership — invalidate in-flight restores/refreshes
      // BEFORE the first credential write so none of them can interleave.
      bumpSessionEpoch();
      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);
      await registerActiveSession(user, tokens);

      set({
        user,
        tokens,
        isAuthenticated: true,
        isAuthenticating: false,
      });

      analytics.identify(user);
      Sentry.setUser({
        id: String(user.id),
        email: user.email,
        name: user.username,
        username: user.username,
      });
      analytics.capture(ANALYTICS_EVENTS.AUTH.LOGIN_SUCCESS);
      useSubscriptionStore.getState().fetchSubscription();
    } catch (error: unknown) {
      const message = getErrorMessage(error, i18n.t('common:toasts.invalidCredentials'));
      set({ isAuthenticating: false, error: message });
      analytics.capture(ANALYTICS_EVENTS.AUTH.LOGIN_FAILED, { error: message });
      throw error;
    }
  },

  register: async (data: RegisterDTO) => {
    try {
      set({ isAuthenticating: true, error: null });

      const { user, tokens } = await authService.register(data);

      bumpSessionEpoch();
      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);
      await registerActiveSession(user, tokens);

      set({
        user,
        tokens,
        isAuthenticated: true,
        isAuthenticating: false,
      });

      analytics.identify(user);
      Sentry.setUser({
        id: String(user.id),
        email: user.email,
        name: user.username,
        username: user.username,
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.COMPLETED, { role: user.role });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      set({ isAuthenticating: false, error: message });
      throw error;
    }
  },

  /**
   * Adopt a completed signup as an authenticated session.
   *
   * Called by the wizard at the very end, after /signup/sessions/me/complete
   * returns full-scope user tokens. This:
   *   1. Persists the new tokens in SecureStore (replacing any signup-scoped
   *      token that may have been in axios state).
   *   2. Registers the account with accountStore for the linked-account UI.
   *   3. Flips the store to authenticated so the router redirects to the
   *      main tabs.
   *
   * The signupStore is cleared by the caller after this resolves, so MMKV
   * no longer holds the now-redundant signup_pending token.
   */
  adoptCompletedSignup: async (
    user: User,
    tokens: TokenPair,
    linkedAccount?: { user: User; tokens: TokenPair }
  ) => {
    set({ isAuthenticating: true, error: null });
    try {
      bumpSessionEpoch();
      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);
      await registerActiveSession(user, tokens);

      set({ user, tokens, isAuthenticated: true, isAuthenticating: false });

      if (linkedAccount) {
        await useAccountStore
          .getState()
          .addAccount({ user: linkedAccount.user, tokens: linkedAccount.tokens });
      }

      analytics.identify(user);
      Sentry.setUser({
        id: String(user.id),
        email: user.email,
        name: user.username,
        username: user.username,
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.COMPLETED, { role: user.role });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to finalize signup';
      set({ isAuthenticating: false, error: message });
      throw error;
    }
  },

  updateProfile: async (data: UpdateProfileDTO) => {
    try {
      const token = await authStorage.getToken();
      if (!token) {
        throw new Error('Not authenticated. Please restart registration.');
      }

      const updatedUser = await authService.updateProfile(data);

      await authStorage.setUser(updatedUser);
      set({ user: updatedUser });
      analytics.identify(updatedUser);
      analytics.capture(ANALYTICS_EVENTS.PROFILE.UPDATED);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      set({ error: message });
      throw error;
    }
  },

  logout: async () => {
    bumpSessionEpoch();
    try {
      analytics.capture(ANALYTICS_EVENTS.AUTH.LOGOUT);
      await authService.logout();
    } catch {
      // Best-effort — still clear local state
    } finally {
      analytics.reset();
      Sentry.setUser(null);
      useSubscriptionStore.getState().clear();
      await useAccountStore.getState().clearAll();
      await authStorage.clearAll();
      set({ ...initialState, isLoading: false });
    }
  },

  /**
   * Refresh the active session's tokens.
   *
   * Contract (callers depend on all three outcomes):
   *  - resolves TokenPair — refreshed and persisted;
   *  - resolves null     — the refresh token was DEFINITIVELY rejected, or
   *                        the session changed hands mid-refresh (stale);
   *  - throws            — transient failure (network/timeout/5xx); proves
   *                        nothing, the session must NOT be expired for it.
   *
   * Single-flight: concurrent callers (cold-start 401 wall + initialize)
   * share one network call. Keyed by epoch so a post-switch caller never
   * joins a refresh that belongs to the previous account.
   */
  refreshTokens: async (): Promise<TokenPair | null> => {
    const epochAtStart = getSessionEpoch();
    if (refreshInFlight && refreshInFlight.epoch === epochAtStart) {
      return refreshInFlight.promise;
    }

    const promise = (async (): Promise<TokenPair | null> => {
      const currentRefreshToken = await authStorage.getRefreshToken();
      if (!currentRefreshToken) return null;

      let newTokens: TokenPair;
      try {
        newTokens = await authService.refreshToken(currentRefreshToken);
      } catch (error: unknown) {
        const status = error instanceof AxiosError ? error.response?.status : undefined;
        analytics.capture(ANALYTICS_EVENTS.AUTH.TOKEN_REFRESH_FAILED, {
          status,
          is_auth_error: status === 401 || status === 403,
          is_network_error:
            error instanceof AxiosError && error.message === 'Network Error',
          error_code: error instanceof AxiosError ? error.code : undefined,
        });
        // Do NOT clear the session here — callers (initialize, interceptor)
        // decide whether to expire the session based on context.
        if (isDefinitiveAuthRejection(error)) return null;
        throw error;
      }

      if (getSessionEpoch() !== epochAtStart) {
        // The session changed hands while the refresh was in flight (switch,
        // login, logout). These tokens belong to the PREVIOUS identity —
        // persisting them would clobber the new session's tokens.
        analytics.capture(ANALYTICS_EVENTS.AUTH.REFRESH_DISCARDED_STALE, {});
        return null;
      }

      await authStorage.setToken(newTokens.accessToken);
      await authStorage.setRefreshToken(newTokens.refreshToken);

      set({ tokens: newTokens });

      // Keep accountStore tokens in sync so cached entries stay fresh — but
      // only when the token's subject and the UI user agree. Mirroring
      // across a desync poisons one account's stored entry with the other
      // account's tokens.
      const currentUser = get().user;
      const tokenUserId = getTokenUserId(newTokens.accessToken);
      if (currentUser && tokenUserId !== null && Number(currentUser.id) === tokenUserId) {
        useAccountStore.getState().addAccount({ user: currentUser, tokens: newTokens });
      } else if (currentUser && tokenUserId !== null) {
        analytics.capture(ANALYTICS_EVENTS.AUTH.IDENTITY_DESYNC_DETECTED, {
          source: 'refresh_mirror',
          ui_user_id: currentUser.id,
          token_user_id: tokenUserId,
        });
        void get().reconcileServerIdentity('refresh_mirror_mismatch');
      }

      analytics.capture(ANALYTICS_EVENTS.AUTH.TOKEN_REFRESHED);
      return newTokens;
    })();

    refreshInFlight = { epoch: epochAtStart, promise };
    promise
      .catch(() => undefined)
      .finally(() => {
        if (refreshInFlight?.promise === promise) refreshInFlight = null;
      });
    return promise;
  },

  reconcileServerIdentity: async (reason: string): Promise<User | null> => {
    if (reconcileInFlight) return reconcileInFlight;
    reconcileInFlight = (async (): Promise<User | null> => {
      try {
        const epochAtStart = getSessionEpoch();
        // getMe answers for the token actually attached to the request —
        // that IS the identity every other API call runs as.
        const me = await authService.getMe();
        if (getSessionEpoch() !== epochAtStart) return null; // ownership moved
        const current = get().user;
        if (!current || Number(current.id) === Number(me.id)) return null; // coherent
        analytics.capture(ANALYTICS_EVENTS.AUTH.IDENTITY_DESYNC_DETECTED, {
          source: 'reconcile',
          reason,
          ui_user_id: current.id,
          server_user_id: me.id,
        });
        await adoptServerIdentity(me, reason);
        return me;
      } catch {
        // Network failure — nothing proven, change nothing.
        return null;
      } finally {
        reconcileInFlight = null;
      }
    })();
    return reconcileInFlight;
  },

  /**
   * Explicitly expire the session and redirect to login.
   * Called by initialize() and the response interceptor when a refresh
   * definitively fails — never as a side effect of refreshTokens().
   */
  expireSession: async (reason: string) => {
    bumpSessionEpoch();
    analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_EXPIRED, { reason });
    analytics.reset();
    Sentry.setUser(null);
    await authStorage.clearAll();
    set({ ...initialState, isLoading: false });
  },

  verify2FALogin: async (code: string) => {
    const { pending2FA } = get();
    if (!pending2FA) throw new Error('No pending 2FA session');

    try {
      set({ isAuthenticating: true, error: null });

      const { user, tokens } = await authService.login2FA({
        tempToken: pending2FA.tempToken,
        code,
      });

      bumpSessionEpoch();
      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);
      await registerActiveSession(user, tokens);

      set({
        user,
        tokens,
        isAuthenticated: true,
        isAuthenticating: false,
        pending2FA: null,
      });

      analytics.identify(user);
      Sentry.setUser({
        id: String(user.id),
        email: user.email,
        name: user.username,
        username: user.username,
      });
      analytics.capture(ANALYTICS_EVENTS.AUTH.LOGIN_SUCCESS);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      set({ isAuthenticating: false, error: message });
      throw error;
    }
  },

  clearPending2FA: () => set({ pending2FA: null, error: null }),

  clearError: () => set({ error: null }),

  setUser: (user: User) => {
    set({ user });
    authStorage.setUser(user);
    analytics.identify(user);
  },
}));

// Mirror the signed-in identity into native NSUserDefaults so the native Sentry
// SDK can attribute a pre-JS cold-launch crash (the PushKit/CallKit window) to a
// user. Every identity path in this store — login, session restore, account
// switch, logout — ends in a `user` mutation, so one subscription covers them
// all (including `setUser`, which does not call Sentry.setUser directly). Deduped
// on the id so an unrelated state change does not re-write NSUserDefaults.
let lastMirroredSentryUserId: string | null = null;
useAuthStore.subscribe((state) => {
  const id = state.user ? String(state.user.id) : null;
  if (id === lastMirroredSentryUserId) return;
  lastMirroredSentryUserId = id;
  persistSentryUserForNative(id, state.user?.username ?? null);
});

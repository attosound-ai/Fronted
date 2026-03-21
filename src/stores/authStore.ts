import { create } from 'zustand';
import * as Sentry from '@sentry/react-native';
import i18n from '@/lib/i18n';
import { authService } from '@/lib/api/authService';
import { authStorage } from '@/lib/auth/storage';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';
import { getErrorMessage } from '@/utils/formatters';
import { useSubscriptionStore } from './subscriptionStore';
import type {
  User,
  LoginDTO,
  RegisterDTO,
  PreRegisterDTO,
  CompleteRegistrationDTO,
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
  preRegister: (data: PreRegisterDTO) => Promise<void>;
  completeRegistration: (data: CompleteRegistrationDTO) => Promise<number | null>;
  updateProfile: (data: UpdateProfileDTO) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<TokenPair | null>;
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

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  ...initialState,

  /**
   * Restore session from SecureStore on app start.
   * Validates stored tokens with GET /auth/me.
   */
  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      const accessToken = await authStorage.getToken();
      const refreshToken = await authStorage.getRefreshToken();
      const storedUser = await authStorage.getUser<User>();

      if (!accessToken || !refreshToken) {
        set({ ...initialState, isLoading: false });
        return;
      }

      const tokens: TokenPair = { accessToken, refreshToken, expiresIn: 0 };

      // Optimistically show stored user for instant UI
      if (storedUser) {
        set({ user: storedUser, tokens, isAuthenticated: true, isLoading: false });
      }

      // Validate session + fetch subscription + load accounts in PARALLEL
      try {
        const [freshUser] = await Promise.all([
          authService.getMe(),
          useSubscriptionStore.getState().fetchSubscription(),
          useAccountStore.getState().loadAccounts(),
        ]);
        await authStorage.setUser(freshUser);
        set({ user: freshUser, isAuthenticated: true, isLoading: false });
        analytics.identify(freshUser);
        Sentry.setUser({
          id: String(freshUser.id),
          email: freshUser.email,
          name: freshUser.displayName || freshUser.username,
          username: freshUser.username,
        });
        analytics.capture(ANALYTICS_EVENTS.AUTH.SESSION_RESTORED);
      } catch {
        // Token expired — try refresh
        const newTokens = await get().refreshTokens();
        if (newTokens) {
          try {
            const freshUser = await authService.getMe();
            await authStorage.setUser(freshUser);
            set({ user: freshUser, isAuthenticated: true, isLoading: false });
          } catch {
            await authStorage.clearAll();
            set({ ...initialState, isLoading: false });
          }
        } else {
          await authStorage.clearAll();
          set({ ...initialState, isLoading: false });
        }
      }
    } catch {
      await authStorage.clearAll();
      set({ ...initialState, isLoading: false });
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

      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);

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
        name: user.displayName || user.username,
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

      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);

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
        name: user.displayName || user.username,
        username: user.username,
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.COMPLETED, { role: user.role });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      set({ isAuthenticating: false, error: message });
      throw error;
    }
  },

  preRegister: async (data: PreRegisterDTO) => {
    try {
      set({ isAuthenticating: true, error: null });

      const { user, tokens } = await authService.preRegister(data);

      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);

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
        name: user.displayName || user.username,
        username: user.username,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Pre-registration failed';
      set({ isAuthenticating: false, error: message });
      throw error;
    }
  },

  completeRegistration: async (data: CompleteRegistrationDTO) => {
    try {
      set({ isAuthenticating: true, error: null });

      const result = await authService.completeRegistration(data);
      const { user, tokens, linkedAccount } = result;

      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);

      set({
        user,
        tokens,
        isAuthenticated: true,
        isAuthenticating: false,
      });

      // Persist both accounts when a managed artist was created
      if (linkedAccount) {
        const { addAccount } = useAccountStore.getState();
        await addAccount({ user, tokens });
        await addAccount({ user: linkedAccount.user, tokens: linkedAccount.tokens });
      }

      analytics.identify(user);
      Sentry.setUser({
        id: String(user.id),
        email: user.email,
        name: user.displayName || user.username,
        username: user.username,
      });
      analytics.capture(ANALYTICS_EVENTS.REGISTRATION.COMPLETED, { role: user.role });

      return linkedAccount?.user?.id ?? null;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to complete registration';
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

  refreshTokens: async (): Promise<TokenPair | null> => {
    try {
      const currentRefreshToken = await authStorage.getRefreshToken();
      if (!currentRefreshToken) return null;

      const newTokens = await authService.refreshToken(currentRefreshToken);

      await authStorage.setToken(newTokens.accessToken);
      await authStorage.setRefreshToken(newTokens.refreshToken);

      set({ tokens: newTokens });
      return newTokens;
    } catch {
      await authStorage.clearAll();
      set({ ...initialState, isLoading: false });
      return null;
    }
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

      await authStorage.setToken(tokens.accessToken);
      await authStorage.setRefreshToken(tokens.refreshToken);
      await authStorage.setUser(user);

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
        name: user.displayName || user.username,
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

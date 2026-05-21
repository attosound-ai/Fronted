import axios, {
  AxiosInstance,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_CONFIG } from '@/constants/config';
import { authStorage } from '@/lib/auth/storage';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

// ── Request-body sanitisation ────────────────────────────────────
// Fields whose values must never leave the device.
const SENSITIVE_KEYS = new Set([
  'password',
  'confirmPassword',
  'creatorPassword',
  'creatorConfirmPassword',
  'newPassword',
  'oldPassword',
  'refreshToken',
  'accessToken',
  'token',
  'tempToken',
  'otp',
  'otpCode',
  'code',
  'cardNumber',
  'cvc',
  'cvv',
]);

const MAX_BODY_LENGTH = 4_000; // PostHog truncates large properties anyway

function sanitiseBody(body: unknown): string | undefined {
  if (body == null) return undefined;

  let obj: unknown = body;
  if (typeof body === 'string') {
    try {
      obj = JSON.parse(body);
    } catch {
      // Not JSON — redact the whole thing if it's too long
      return body.length > MAX_BODY_LENGTH ? body.slice(0, MAX_BODY_LENGTH) + '…' : body;
    }
  }

  if (typeof obj === 'object' && obj !== null) {
    const redacted = redactSensitive(obj as Record<string, unknown>);
    const serialised = JSON.stringify(redacted);
    return serialised.length > MAX_BODY_LENGTH
      ? serialised.slice(0, MAX_BODY_LENGTH) + '…'
      : serialised;
  }

  return String(body).slice(0, MAX_BODY_LENGTH);
}

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sanitiseHeaders(
  headers: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!headers) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'authorization' || lower === 'cookie' || lower === 'set-cookie') {
      safe[key] = '[REDACTED]';
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

/** Build a rich PostHog event payload from any Axios request/response. */
function buildRequestProperties(
  config: InternalAxiosRequestConfig | undefined,
  response: AxiosResponse | undefined,
  error?: AxiosError
): Record<string, unknown> {
  return {
    // ── Request ──
    url: config?.url,
    base_url: config?.baseURL,
    method: config?.method?.toUpperCase(),
    request_headers: sanitiseHeaders(config?.headers?.toJSON?.() ?? config?.headers),
    request_body: sanitiseBody(config?.data),
    request_params: config?.params ? JSON.stringify(config.params) : undefined,
    timeout: config?.timeout,

    // ── Response ──
    status: response?.status,
    status_text: response?.statusText,
    response_headers: sanitiseHeaders(
      response?.headers as unknown as Record<string, unknown>
    ),
    response_body: sanitiseBody(response?.data),

    // ── Meta ──
    success: !error,
    error_message: error
      ? (response?.data as Record<string, unknown>)?.error ||
        (response?.data as Record<string, unknown>)?.message ||
        error.message
      : undefined,
    error_code: error?.code,
    is_timeout: error?.code === 'ECONNABORTED',
    is_network_error: error?.message === 'Network Error',
  };
}

/**
 * ApiClient — HTTP client with JWT interceptors and token refresh queue.
 *
 * Request interceptor: attaches Bearer token from SecureStore.
 * Response interceptor: on 401, refreshes token and retries.
 * Concurrent 401s are queued so only one refresh happens at a time.
 *
 * Account switching: call `pauseRequests()` before swapping tokens,
 * then `resumeRequests()` after. Queued requests will use the new token.
 */

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Public endpoints that never need a token
const PUBLIC_ROUTES = [
  '/otp/',
  '/auth/login',
  '/auth/register',
  '/auth/check-phone',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
  // Signup entrypoints — session ID + OTP code are the credentials, no token yet.
  '/signup/sessions',
];

// Signup routes that require the signup_pending scoped token. Everything else
// under /signup/sessions/me/* lives here; the bare /signup/sessions and
// /signup/sessions/:id/verify-otp are public.
function isSignupAuthedRoute(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith('/signup/sessions/me');
}

// ── Account switch guard ──
// When true, requests are queued until the token swap completes.
let _paused = false;
let _resumeQueue: Array<() => void> = [];

/** Block all outgoing requests until resumeRequests() is called. */
export function pauseRequests(): void {
  _paused = true;
}

/** Unblock requests — all queued requests will proceed with the new token. */
export function resumeRequests(): void {
  _paused = false;
  const queue = _resumeQueue;
  _resumeQueue = [];
  queue.forEach((resolve) => resolve());
}

function waitUntilResumed(): Promise<void> {
  if (!_paused) return Promise.resolve();
  return new Promise((resolve) => {
    _resumeQueue.push(resolve);
  });
}

// --- Request Interceptor: Attach Bearer token ---
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Wait if account switch is in progress
    await waitUntilResumed();

    // Signup-scoped routes get the signup_pending token from signupStore.
    // Everything else gets the full-scope user token from SecureStore.
    //
    // `/media/sign` is a special case: it is callable both *during* signup
    // (for the avatar in the ProfileSetup wizard step) and *after* login
    // (for any media context). Prefer the user token; fall back to the
    // signup_pending token if there's no logged-in user yet. The backend
    // accepts signup_pending only for `context: "avatar"`.
    let token: string | null = null;
    if (isSignupAuthedRoute(config.url)) {
      const { getSignupToken } = await import('@/stores/signupStore');
      token = getSignupToken();
    } else if (config.url?.startsWith('/media/sign')) {
      token = await authStorage.getToken();
      if (!token) {
        const { getSignupToken } = await import('@/stores/signupStore');
        token = getSignupToken();
      }
    } else {
      token = await authStorage.getToken();
    }
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Inject X-User-ID only for chat-service routes (messages endpoints)
    if (config.url?.startsWith('/messages')) {
      const { useAuthStore } = await import('@/stores/authStore');
      const user = useAuthStore.getState().user;
      if (user && config.headers) {
        config.headers['X-User-ID'] = String(user.id);
      }
    }
    if (!token) {
      const isPublic = PUBLIC_ROUTES.some((route) => config.url?.includes(route));
      if (!isPublic) {
        console.warn('[API] No auth token found for request:', config.url);
      }
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// --- Response Interceptor: 401 handling with refresh queue ---

type FailedRequest = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null): void => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
};

/** Clear the refresh queue — call during account switch to prevent stale refreshes. */
export function clearRefreshQueue(): void {
  isRefreshing = false;
  failedQueue = [];
}

// Signal raised when the backend returns 426 Upgrade Required (i.e. this
// client build talked to a server that no longer supports the old endpoint).
// Top-level UI subscribes to this to swap the whole tree for an "update
// required" screen.
let _outdatedListeners: Array<() => void> = [];
let _isOutdated = false;
export function isClientOutdated(): boolean {
  return _isOutdated;
}
export function onClientOutdated(cb: () => void): () => void {
  _outdatedListeners.push(cb);
  return () => {
    _outdatedListeners = _outdatedListeners.filter((l) => l !== cb);
  };
}
function markClientOutdated(): void {
  if (_isOutdated) return;
  _isOutdated = true;
  _outdatedListeners.forEach((cb) => {
    try { cb(); } catch { /* swallow */ }
  });
}

apiClient.interceptors.response.use(
  (response) => {
    // Track every successful request with full context (sensitive fields redacted)
    analytics.capture(
      ANALYTICS_EVENTS.NETWORK.API_REQUEST,
      buildRequestProperties(response.config, response)
    );
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Track failed requests with full context (sensitive fields redacted)
    const props = buildRequestProperties(
      error.config as InternalAxiosRequestConfig | undefined,
      error.response as AxiosResponse | undefined,
      error
    );
    analytics.capture(ANALYTICS_EVENTS.NETWORK.API_REQUEST, props);
    analytics.capture(ANALYTICS_EVENTS.ERROR.API_ERROR, props);

    // 426 Upgrade Required: the backend dropped this endpoint. Swap UI to
    // "update required" screen. Don't retry; nothing helps until install.
    if (error.response?.status === 426) {
      markClientOutdated();
      return Promise.reject(error);
    }

    // 403 with `insufficient_scope`: a signup_pending token tried to reach a
    // route it shouldn't. There is no refresh that helps — only completing
    // the signup. Surface as-is so the caller can show the right message.
    if (error.response?.status === 403) {
      const body = error.response?.data as { error?: string } | undefined;
      if (typeof body?.error === 'string' && body.error.startsWith('insufficient_scope')) {
        return Promise.reject(error);
      }
    }

    // Only handle 401, only once per request
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh during account switch
    if (_paused) {
      return Promise.reject(error);
    }

    // Signup_pending tokens don't have a refresh flow — they're issued once
    // by /signup/sessions/:id/verify-otp with a 24h TTL. A 401 here means the
    // session expired server-side; clear the signup store and let the caller
    // re-enter the wizard.
    if (originalRequest.url && originalRequest.url.startsWith('/signup/sessions/me')) {
      const { useSignupStore } = await import('@/stores/signupStore');
      useSignupStore.getState().clear();
      return Promise.reject(error);
    }

    // Don't refresh if the token changed since this request was sent
    // (account was switched while the request was in-flight).
    // Refreshing with the wrong account's token would corrupt the session.
    const requestToken = originalRequest.headers.Authorization?.toString().replace(
      'Bearer ',
      ''
    );
    const currentToken = await authStorage.getToken();
    if (requestToken !== currentToken) {
      return Promise.reject(error);
    }

    // If refresh already in progress, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Dynamic import to break circular: client → authStore → authService → client
      const { useAuthStore } = await import('@/stores/authStore');
      const newTokens = await useAuthStore.getState().refreshTokens();

      if (newTokens) {
        originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        processQueue(null, newTokens.accessToken);
        return apiClient(originalRequest);
      } else {
        processQueue(new Error('Refresh failed'), null);
        // Expire session explicitly — refreshTokens() no longer does this
        // as a side effect, so the interceptor is the right place to decide.
        if (useAuthStore.getState().isAuthenticated) {
          useAuthStore.getState().expireSession('interceptor_refresh_failed');
        }
        return Promise.reject(error);
      }
    } catch (refreshError) {
      processQueue(refreshError, null);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;

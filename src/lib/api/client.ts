import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_CONFIG } from '@/constants/config';
import { authStorage } from '@/lib/auth/storage';
import { analytics, ANALYTICS_EVENTS } from '@/lib/analytics';

/**
 * ApiClient — HTTP client with JWT interceptors and token refresh queue.
 *
 * Request interceptor: attaches Bearer token from SecureStore.
 * Response interceptor: on 401, refreshes token and retries.
 * Concurrent 401s are queued so only one refresh happens at a time.
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
  '/auth/pre-register',
  '/auth/check-phone',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

// --- Request Interceptor: Attach Bearer token ---
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await authStorage.getToken();
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Track API errors
    analytics.capture(ANALYTICS_EVENTS.ERROR.API_ERROR, {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      error_message:
        (error.response?.data as Record<string, unknown>)?.error || error.message,
    });

    // Only handle 401, only once per request
    if (error.response?.status !== 401 || originalRequest._retry) {
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

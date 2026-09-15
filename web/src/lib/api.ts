import axios, { AxiosError } from 'axios';

import type { InternalAxiosRequestConfig } from 'axios';

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

type SessionExpiredHandler = () => void;

let refreshPromise: Promise<void> | null = null;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

export const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!cookie) {
    return null;
  }

  return decodeURIComponent(cookie.slice(prefix.length));
};

export const setSessionExpiredHandler = (handler: SessionExpiredHandler): void => {
  sessionExpiredHandler = handler;
};

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

const refreshClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (method && MUTATING_METHODS.has(method)) {
    const csrfToken = getCookie('csrf_token');
    if (csrfToken) {
      config.headers.set('X-CSRF-Token', csrfToken);
    }
  }

  return config;
});

const isRefreshExcludedEndpoint = (url?: string): boolean => {
  if (!url) {
    return false;
  }

  return url.includes('/auth/login') || url.includes('/auth/refresh');
};

const refreshSession = (): Promise<void> => {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/auth/refresh')
      .then(() => undefined)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

const expireSession = (): void => {
  sessionExpiredHandler?.();

  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.history.replaceState(null, '', '/login');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError): Promise<unknown> => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isRefreshExcludedEndpoint(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await refreshSession();
      return api(originalRequest);
    } catch (refreshError: unknown) {
      expireSession();
      return Promise.reject(refreshError);
    }
  },
);

export default api;

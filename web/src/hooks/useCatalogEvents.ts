import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect } from 'react';

import { api } from '../lib/api';
import { hasUserPermission } from '../lib/permissions';
import { useAuthStore } from '../stores/auth.store';

import type { QueryClient } from '@tanstack/react-query';

interface CatalogSubscription {
  users: number;
  close: () => void;
}

// Several catalog pickers can be mounted simultaneously. Share one connection
// per QueryClient/session and release it when the last picker unmounts.
const subscriptions = new WeakMap<QueryClient, Map<number, CatalogSubscription>>();

const connect = (queryClient: QueryClient): (() => void) => {
  let stopped = false;
  let source: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 2_000;
  const controller = new AbortController();

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['dp-configuration'] });
    void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const schedule = (): void => {
    if (stopped) return;
    retry = setTimeout(() => { void reconnect(); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  };
  const open = (): void => {
    if (stopped) return;
    const current = new EventSource('/api/catalog/events', { withCredentials: true });
    source = current;
    current.onopen = () => { retryDelay = 2_000; };
    current.addEventListener('ready', invalidate);
    current.addEventListener('catalog-changed', invalidate);
    current.onerror = () => {
      current.onerror = null;
      current.close();
      current.removeEventListener('ready', invalidate);
      current.removeEventListener('catalog-changed', invalidate);
      if (source === current) source = undefined;
      schedule();
    };
  };
  const reconnect = async (): Promise<void> => {
    try {
      // EventSource cannot use Axios's refresh interceptor. This authorized
      // probe renews an expired cookie before opening another streaming request.
      await api.get('/catalog', { params: { page: 1, pageSize: 1 }, signal: controller.signal });
      open();
    } catch (error) {
      if (isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)) return;
      schedule();
    }
  };
  open();

  return () => {
    stopped = true;
    controller.abort();
    clearTimeout(retry);
    source?.removeEventListener('ready', invalidate);
    source?.removeEventListener('catalog-changed', invalidate);
    if (source) {
      source.onerror = null;
      source.close();
    }
  };
};

export const useCatalogEvents = (): void => {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const userId = user?.id;
  const allowed = Boolean(user && (
    hasUserPermission(user, 'taller', 'read') || hasUserPermission(user, 'comercial', 'read')
  ));

  useEffect(() => {
    if (!allowed || !userId || typeof EventSource === 'undefined') return;
    let sessions = subscriptions.get(queryClient);
    if (!sessions) {
      sessions = new Map();
      subscriptions.set(queryClient, sessions);
    }
    let subscription = sessions.get(userId);
    if (!subscription) {
      subscription = { users: 0, close: connect(queryClient) };
      sessions.set(userId, subscription);
    }
    subscription.users++;
    return () => {
      subscription.users--;
      if (subscription.users === 0) {
        subscription.close();
        sessions.delete(userId);
      }
    };
  }, [allowed, userId, queryClient]);
};

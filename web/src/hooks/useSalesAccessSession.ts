import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type { Query } from '@tanstack/react-query';
import type { SalesAccessMode } from '@unithor/shared';

interface SalesAccessSession {
  mode: SalesAccessMode;
  revision: string;
}

// Clients/vehicles remain shared; their cached histories also contain OT/COT.
const scopedRoots = new Set([
  'work-orders', 'work-order-labor', 'quotations', 'quotation-payments',
  'payments', 'dashboard', 'finance', 'reports', 'clients', 'vehicles',
  'customer-email-preparation', 'notifications',
]);
const isScopedQuery = (query: Query): boolean => scopedRoots.has(String(query.queryKey[0]));

/** Refresh an open seller session when an administrator changes its scope. */
export const useSalesAccessSession = (): string => {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const previous = useRef<{ userId: number; revision: string } | null>(null);
  const [viewVersion, setViewVersion] = useState(0);
  const scope = useQuery({
    queryKey: ['sales-access', 'session', user?.id],
    queryFn: async () => (await api.get<SalesAccessSession>('/auth/sales-access')).data,
    enabled: user?.role === 'vendedor',
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });

  useEffect(() => {
    if (user?.role !== 'vendedor') {
      previous.current = null;
      return;
    }
    if (!scope.data?.revision) return;
    const current = { userId: user.id, revision: scope.data.revision };
    const changed = previous.current?.userId === user.id
      && previous.current.revision !== current.revision;
    previous.current = current;
    if (!changed) return;

    let active = true;
    // Cancel first so a response started before revocation cannot restore cache.
    void queryClient.cancelQueries({ predicate: isScopedQuery }).then(() => {
      if (!active) return;
      // Reset clears inactive detail/payment data as well as refetching lists.
      void queryClient.resetQueries({ predicate: isScopedQuery });
      // Remount observers so keepPreviousData and open dialogs drop old records.
      setViewVersion((version) => version + 1);
    });
    return () => { active = false; };
  }, [scope.data?.revision, user?.id, user?.role, queryClient]);

  return `${user?.id ?? 'guest'}:${viewVersion}`;
};

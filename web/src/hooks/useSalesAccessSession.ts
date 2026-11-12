import { notifyManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { api } from '../lib/api';
import { closeRevokedSalesRecords, getOpenSalesRecords, isSalesScopedQuery, querySalesRecord, salesRecordKey, salesScopeEpochKey } from '../lib/sales-access-cache';
import { useAuthStore } from '../stores/auth.store';

import type { OpenSalesRecord } from '../lib/sales-access-cache';
import type { SalesAccessMode } from '@unithor/shared';

interface SalesAccessSession {
  mode: SalesAccessMode;
  revision: string;
  records?: { workOrderIds: number[]; quotationIds: number[] };
}

/** Revalidate private data without remounting shared or still-authorized editors. */
export const useSalesAccessSession = (): void => {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const previous = useRef<{ userId: number; revision: string } | null>(null);
  const scope = useQuery({
    queryKey: ['sales-access', 'session', user?.id],
    queryFn: async () => {
      const checked = getOpenSalesRecords(queryClient);
      const workOrderIds = checked.filter((record) => record.scopeType === 'work_order').map((record) => record.targetId);
      const quotationIds = checked.filter((record) => record.scopeType === 'quotation').map((record) => record.targetId);
      const response = await api.get<SalesAccessSession>('/auth/sales-access', checked.length ? {
        params: { workOrderIds: workOrderIds.length ? workOrderIds.join(',') : undefined, quotationIds: quotationIds.length ? quotationIds.join(',') : undefined },
      } : undefined);
      return { ...response.data, checked };
    },
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
    const data = scope.data;
    if (!data?.revision) return;
    // An incomplete response cannot establish authorization for open records.
    if (data.checked.length && !data.records) return;
    const current = { userId: user.id, revision: data.revision };
    const changed = previous.current?.userId === user.id
      && previous.current.revision !== current.revision;
    const allowed = (record: OpenSalesRecord): boolean => (record.scopeType === 'work_order'
      ? data.records?.workOrderIds : data.records?.quotationIds)?.includes(record.targetId) ?? false;
    const revoked = new Set(data.checked.filter((record) => !allowed(record)).map(salesRecordKey));
    if (!changed && !revoked.size) { previous.current = current; return; }

    let active = true;
    void queryClient.cancelQueries({ predicate: (query) => {
      const record = querySalesRecord(query);
      return isSalesScopedQuery(query) && (changed || Boolean(record && revoked.has(salesRecordKey(record))));
    } }).then(() => {
      if (!active) return;
      notifyManager.batch(() => {
        previous.current = current;
        if (changed) queryClient.setQueryData<number>(salesScopeEpochKey, (value) => (value ?? 0) + 1);
        const checked = new Set(data.checked.map(salesRecordKey));
        for (const query of queryClient.getQueryCache().getAll()) {
          if (!isSalesScopedQuery(query)) continue;
          const record = querySalesRecord(query);
          if (record && revoked.has(salesRecordKey(record))) {
            if (query.state.data !== undefined || query.state.status !== 'error') {
              void queryClient.resetQueries({ queryKey: query.queryKey, exact: true });
            }
          } else if (changed && !query.isActive()) {
            queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
          } else if (changed && !record) {
            void queryClient.resetQueries({ queryKey: query.queryKey, exact: true });
          } else if (changed && record && (!checked.has(salesRecordKey(record)) || query.state.status === 'error')) {
            void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
          }
        }
        closeRevokedSalesRecords(queryClient, revoked);
      });
    });
    return () => { active = false; };
  }, [scope.data, scope.dataUpdatedAt, user?.id, user?.role, queryClient]);
};

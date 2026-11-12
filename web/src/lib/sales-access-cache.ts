import type { Query, QueryClient } from '@tanstack/react-query';
import type { SalesAccessScopeType } from '@unithor/shared';

export interface OpenSalesRecord { scopeType: SalesAccessScopeType; targetId: number }
type RecordListener = { record: OpenSalesRecord; close: () => void };
const listeners = new WeakMap<QueryClient, Set<RecordListener>>();
export const salesRecordKey = (record: OpenSalesRecord): string => `${record.scopeType}:${record.targetId}`;
export const salesScopeEpochKey = ['sales-access', 'cache-epoch'] as const;

export const registerSalesRecord = (client: QueryClient, record: OpenSalesRecord, close: () => void): (() => void) => {
  const entries = listeners.get(client) ?? new Set<RecordListener>();
  listeners.set(client, entries);
  const entry = { record, close };
  entries.add(entry);
  return () => { entries.delete(entry); };
};

export const querySalesRecord = (query: Query): OpenSalesRecord | undefined => {
  const [root, kind, id] = query.queryKey;
  const targetId = root === 'quotation-payments' ? kind : id;
  if (typeof targetId !== 'number' || !Number.isSafeInteger(targetId) || targetId <= 0) return;
  if (root === 'quotation-payments' || (root === 'quotations' && kind === 'detail')) return { scopeType: 'quotation', targetId };
  if ((root === 'work-orders' && kind === 'detail') || (root === 'work-order-labor' && ['worksheet', 'suggestions'].includes(String(kind)))) return { scopeType: 'work_order', targetId };
};

export const getOpenSalesRecords = (client: QueryClient): OpenSalesRecord[] => {
  const records = [...(listeners.get(client) ?? [])].map((entry) => entry.record);
  for (const query of client.getQueryCache().getAll()) {
    const record = querySalesRecord(query);
    if (record && query.isActive()) records.push(record);
  }
  return [...new Map(records.map((record) => [salesRecordKey(record), record])).values()];
};

export const closeRevokedSalesRecords = (client: QueryClient, revoked: Set<string>): void => {
  for (const entry of [...(listeners.get(client) ?? [])]) {
    if (revoked.has(salesRecordKey(entry.record))) entry.close();
  }
};

const privateRoots = new Set(['work-orders', 'work-order-labor', 'quotations', 'quotation-payments', 'payments', 'dashboard', 'finance', 'reports', 'customer-email-preparation', 'notifications']);
export const isSalesScopedQuery = (query: Query): boolean => (privateRoots.has(String(query.queryKey[0]))
  || (query.queryKey[0] === 'warehouses' && query.queryKey[1] === 'requests'))
  && !(query.queryKey[0] === 'work-orders' && query.queryKey[1] === 'mechanics');

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { registerSalesRecord } from '../lib/sales-access-cache';
import { useAuthStore } from '../stores/auth.store';

import type { SalesAccessScopeType } from '@unithor/shared';

/** Only confirmed revocations close editors; unrelated sharing changes preserve them. */
export const useSalesAccessRecord = (scopeType: SalesAccessScopeType, targetId: number, onRevoked: () => void): void => {
  const client = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const callback = useRef(onRevoked);
  callback.current = onRevoked;
  useEffect(() => {
    if (user?.role !== 'vendedor' || !Number.isSafeInteger(targetId) || targetId <= 0) return;
    const unregister = registerSalesRecord(client, { scopeType, targetId }, () => callback.current());
    void client.invalidateQueries({ queryKey: ['sales-access', 'session', user.id] });
    return unregister;
  }, [client, scopeType, targetId, user?.id, user?.role]);
};

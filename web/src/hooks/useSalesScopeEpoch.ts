import { useQuery } from '@tanstack/react-query';

import { salesScopeEpochKey } from '../lib/sales-access-cache';

/** Pagination keeps old rows only inside the same verified access scope. */
export const useSalesScopeEpoch = (): number => useQuery({
  queryKey: salesScopeEpochKey, queryFn: () => 0,
  initialData: 0, enabled: false, staleTime: Infinity,
}).data;

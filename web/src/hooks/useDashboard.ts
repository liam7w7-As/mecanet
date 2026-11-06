import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';

import type { UserPublic } from '../stores/auth.store';
import type { DashboardSummary } from '@unithor/shared';

type DashboardIdentity = Pick<UserPublic, 'id' | 'role'>;

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (user?: DashboardIdentity | null) => [...dashboardKeys.all, 'summary', user?.id, user?.role] as const,
};

export const useDashboardSummary = (user?: DashboardIdentity | null) =>
  useQuery({
    queryKey: dashboardKeys.summary(user),
    queryFn: async () => {
      const response = await api.get<DashboardSummary>('/dashboard/summary');
      return response.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    enabled: user !== null,
  });

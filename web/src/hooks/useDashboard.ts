import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';

import type { DashboardSummary } from '@unithor/shared';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
};

export const useDashboardSummary = () =>
  useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: async () => {
      const response = await api.get<DashboardSummary>('/dashboard/summary');
      return response.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

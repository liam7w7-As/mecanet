import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type {
  CreateWorkshopTimeRequestInput,
  ReviewWorkshopTimeRequestInput,
  WorkshopTimeEligibleItem,
  WorkshopTimeJournal,
  WorkshopTimeRequestRecord,
} from '@unithor/shared';

export const workshopTimeKeys = { all: ['workshop-time'] as const };

export const useWorkshopTime = (date: string, userId?: number, enabled = true) => {
  const viewerId = useAuthStore((state) => state.user?.id);
  const viewerRole = useAuthStore((state) => state.user?.role);
  return useQuery({
    queryKey: [...workshopTimeKeys.all, 'journal', viewerId, viewerRole, date, userId ?? 'all'],
    queryFn: async () => {
      const response = await api.get<WorkshopTimeJournal>('/workshop-time', {
        params: { fecha: date, ...(userId === undefined ? {} : { userId }) },
      });
      return response.data;
    },
    enabled: enabled && Boolean(viewerId),
    refetchInterval: 60_000,
  });
};

export const useWorkshopTimeEligibleItems = (userId?: number, enabled = true, date?: string) => {
  const viewerId = useAuthStore((state) => state.user?.id);
  const viewerRole = useAuthStore((state) => state.user?.role);
  return useQuery({
    queryKey: [...workshopTimeKeys.all, 'eligible', viewerId, viewerRole, userId ?? 'own', date],
    queryFn: async () => {
      const response = await api.get<{ items: WorkshopTimeEligibleItem[] }>(
        '/workshop-time/eligible-items',
        { params: { ...(userId === undefined ? {} : { userId }), ...(date ? { fecha: date } : {}) } },
      );
      return response.data.items;
    },
    enabled: enabled && Boolean(viewerId),
  });
};

// Uses the existing timer endpoint; the reason belongs to that session's audit note.
export const usePauseWorkshopTimerMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId, note }: { id: number; itemId: number; note?: string }) => {
      await api.post(`/work-orders/${id}/items/${itemId}/pause`, { note });
    },
    onSuccess: async () => {
      await Promise.all([['work-order-labor'], ['workshop-time'], ['work-orders']].map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ));
    },
  });
};

const useRefreshWorkshopTime = () => {
  const client = useQueryClient();
  return async (): Promise<void> => {
    await Promise.all(
      [['workshop-time'], ['work-order-labor'], ['work-orders'], ['quotations']].map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
  };
};

export const useCreateWorkshopTimeRequestMutation = () => {
  const refresh = useRefreshWorkshopTime();
  return useMutation({
    mutationFn: async (data: CreateWorkshopTimeRequestInput) => {
      const response = await api.post<{ request: WorkshopTimeRequestRecord }>(
        '/workshop-time/requests',
        data,
      );
      return response.data.request;
    },
    onSuccess: refresh,
  });
};

export const useReviewWorkshopTimeRequestMutation = () => {
  const refresh = useRefreshWorkshopTime();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ReviewWorkshopTimeRequestInput }) => {
      const response = await api.patch<{ request: WorkshopTimeRequestRecord }>(
        `/workshop-time/requests/${id}/review`,
        data,
      );
      return response.data.request;
    },
    onSuccess: refresh,
  });
};

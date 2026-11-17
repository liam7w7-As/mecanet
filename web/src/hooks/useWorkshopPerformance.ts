import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkshopCommercialReviewSchema,
  workshopPerformanceQuerySchema,
} from '@unithor/shared';
import { useRef } from 'react';

import { api } from '../lib/api';
import { normalizeBlobApiError } from '../lib/api-error';
import { hasUserPermission } from '../lib/permissions';
import { reportActorKey } from '../lib/report-access';
import { salesScopeEpochKey } from '../lib/sales-access-cache';
import { canExportWorkshopCosts, canReadWorkshopCosts } from '../lib/workshop-cost-report-access';
import { useAuthStore } from '../stores/auth.store';
import { notifyError } from '../stores/toast.store';

import type { UserPublic } from '../stores/auth.store';
import type {
  CreateWorkshopCommercialReviewInput,
  WorkshopCommercialReviewRecord,
  WorkshopPerformanceFilters,
  WorkshopPerformanceReport,
} from '@unithor/shared';

export const workshopPerformanceKey = ['reports', 'workshop-performance'] as const;

export const canReviewWorkshopCommercial = (user: UserPublic | null): boolean =>
  Boolean(
    user &&
    ['jefe', 'admin', 'desarrollador'].includes(user.role) &&
    hasUserPermission(user, 'taller', 'update'),
  );

export const useWorkshopPerformance = (filters: WorkshopPerformanceFilters) => {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const actorKey = reportActorKey(user);
  const allowed = canReadWorkshopCosts(user);
  const parsed = workshopPerformanceQuerySchema.safeParse(filters);
  const query = useQuery({
    queryKey: [...workshopPerformanceKey, actorKey, filters],
    queryFn: async ({ signal }) => {
      if (
        !parsed.success ||
        actorKey !== reportActorKey(useAuthStore.getState().user) ||
        !canReadWorkshopCosts(useAuthStore.getState().user)
      )
        throw new Error('Reporte no autorizado o filtros inválidos');
      const epoch = client.getQueryData(salesScopeEpochKey);
      const response = await api.get<WorkshopPerformanceReport>(
        '/reports/workshop-costs/analysis',
        {
          params: parsed.data,
          signal,
        },
      );
      if (
        actorKey !== reportActorKey(useAuthStore.getState().user) ||
        epoch !== client.getQueryData(salesScopeEpochKey) ||
        !canReadWorkshopCosts(useAuthStore.getState().user)
      )
        throw new Error('La sesión cambió');
      return response.data;
    },
    enabled: allowed && parsed.success,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.totals.runningSessions ? 30_000 : false),
  });
  return {
    ...query,
    data: allowed && parsed.success ? query.data : undefined,
    allowed,
    valid: parsed.success,
  };
};

export const useWorkshopCommercialReview = () => {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const actorKey = reportActorKey(user);
  const allowed = canReviewWorkshopCommercial(user);
  const completedActor = useRef<{ key: string; epoch: unknown }>();
  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: CreateWorkshopCommercialReviewInput) => {
      if (
        actorKey !== reportActorKey(useAuthStore.getState().user) ||
        !canReviewWorkshopCommercial(useAuthStore.getState().user)
      )
        throw new Error('Revisión no autorizada');
      const payload = createWorkshopCommercialReviewSchema.parse(input);
      const epoch = client.getQueryData(salesScopeEpochKey);
      const response = await api.post<{ review: WorkshopCommercialReviewRecord }>(
        '/reports/workshop-costs/commercial-reviews',
        payload,
      );
      if (
        actorKey !== reportActorKey(useAuthStore.getState().user) ||
        epoch !== client.getQueryData(salesScopeEpochKey) ||
        !canReviewWorkshopCommercial(useAuthStore.getState().user)
      )
        throw new Error('La sesión cambió');
      if (!response.data?.review) throw new Error('No se recibió la revisión guardada.');
      completedActor.current = { key: actorKey, epoch };
      return response.data.review;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: workshopPerformanceKey });
    },
  });
  return {
    ...mutation,
    allowed,
    data:
      allowed &&
      completedActor.current?.key === actorKey &&
      completedActor.current?.epoch === client.getQueryData(salesScopeEpochKey)
        ? mutation.data
        : undefined,
  };
};

/** Keep the legacy preview/download hooks intact; all analysis exports share these filters. */
export const useWorkshopPerformanceDownload = () => {
  const client = useQueryClient();
  const pending = useRef(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      format,
      filters,
      actorKey,
      epoch,
    }: {
      format: 'pdf' | 'excel';
      filters: WorkshopPerformanceFilters;
      previewWindow: Window | null;
      actorKey: string;
      epoch: unknown;
    }) => {
      if (
        actorKey !== reportActorKey(useAuthStore.getState().user) ||
        epoch !== client.getQueryData(salesScopeEpochKey) ||
        !canExportWorkshopCosts(useAuthStore.getState().user)
      )
        throw new Error('Exportación no autorizada');
      try {
        const response = await api.get<Blob>(`/reports/workshop-costs/analysis/${format}`, {
          params: workshopPerformanceQuerySchema.parse(filters),
          responseType: 'blob',
        });
        const expected =
          format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (
          !(response.data instanceof Blob) ||
          !response.data.size ||
          !String(response.headers?.['content-type'] ?? response.data.type).includes(expected)
        )
          throw new Error(
            `El servidor no devolvió un archivo ${format === 'pdf' ? 'PDF' : 'Excel'} válido.`,
          );
        return response.data;
      } catch (error) {
        throw await normalizeBlobApiError(error);
      }
    },
    onSuccess: (blob, { format, previewWindow, actorKey, epoch }) => {
      if (
        actorKey !== reportActorKey(useAuthStore.getState().user) ||
        epoch !== client.getQueryData(salesScopeEpochKey) ||
        !canExportWorkshopCosts(useAuthStore.getState().user)
      ) {
        previewWindow?.close();
        return;
      }
      if (format === 'pdf' && (!previewWindow || previewWindow.closed)) return;
      const url = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = url;
      else {
        const link = document.createElement('a');
        link.href = url;
        link.download = `UNITHOR-analisis-taller-${Date.now()}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), format === 'pdf' ? 300_000 : 30_000);
    },
    onError: (_error, { previewWindow }) => previewWindow?.close(),
    onSettled: () => {
      pending.current = false;
    },
  });
  const download = (format: 'pdf' | 'excel', filters: WorkshopPerformanceFilters): void => {
    if (
      pending.current ||
      !canExportWorkshopCosts(useAuthStore.getState().user) ||
      !workshopPerformanceQuerySchema.safeParse(filters).success
    )
      return;
    const previewWindow = format === 'pdf' ? window.open('about:blank', '_blank') : null;
    if (format === 'pdf' && !previewWindow) {
      notifyError(
        'Permite abrir pestañas emergentes para visualizar el PDF y vuelve a intentarlo.',
      );
      return;
    }
    if (previewWindow) previewWindow.opener = null;
    pending.current = true;
    mutation.mutate({
      format,
      filters,
      previewWindow,
      actorKey: reportActorKey(useAuthStore.getState().user),
      epoch: client.getQueryData(salesScopeEpochKey),
    });
  };
  return { ...mutation, download };
};

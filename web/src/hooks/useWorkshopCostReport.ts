import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workshopCostReportQuerySchema } from '@unithor/shared';
import { useRef } from 'react';

import { api } from '../lib/api';
import { normalizeBlobApiError } from '../lib/api-error';
import { reportActorKey } from '../lib/report-access';
import { salesScopeEpochKey } from '../lib/sales-access-cache';
import { canExportWorkshopCosts, canReadWorkshopCosts } from '../lib/workshop-cost-report-access';
import { useAuthStore } from '../stores/auth.store';
import { notifyError } from '../stores/toast.store';

import type { WorkshopCostReport, WorkshopCostReportFilters } from '@unithor/shared';

export const useWorkshopCostReport = (filters: WorkshopCostReportFilters) => {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const actorKey = reportActorKey(user);
  const allowed = canReadWorkshopCosts(user);
  const valid = workshopCostReportQuerySchema.safeParse(filters).success;
  const query = useQuery({
    queryKey: ['reports', 'workshop-cost', actorKey, filters],
    queryFn: async ({ signal }) => {
      if (!canReadWorkshopCosts(useAuthStore.getState().user))
        throw new Error('Reporte no autorizado');
      const epoch = client.getQueryData(salesScopeEpochKey);
      const response = await api.get<WorkshopCostReport>('/reports/workshop-costs/preview', {
        params: filters,
        signal,
      });
      if (
        actorKey !== reportActorKey(useAuthStore.getState().user) ||
        epoch !== client.getQueryData(salesScopeEpochKey) ||
        !canReadWorkshopCosts(useAuthStore.getState().user)
      )
        throw new Error('La sesión cambió');
      return response.data;
    },
    enabled: allowed && valid,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.totals.runningSessions ? 30_000 : false),
  });
  return { ...query, data: allowed && valid ? query.data : undefined, allowed, valid };
};

export const useWorkshopCostReportDownload = () => {
  const client = useQueryClient();
  const pending = useRef(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      format,
      filters,
    }: {
      format: 'pdf' | 'excel';
      filters: WorkshopCostReportFilters;
      previewWindow: Window | null;
    }) => {
      if (!canExportWorkshopCosts(useAuthStore.getState().user))
        throw new Error('Exportación no autorizada');
      const actorKey = reportActorKey(useAuthStore.getState().user);
      const epoch = client.getQueryData(salesScopeEpochKey);
      try {
        const response = await api.get<Blob>(`/reports/workshop-costs/${format}`, {
          params: workshopCostReportQuerySchema.parse(filters),
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
        ) {
          throw new Error(
            `El servidor no devolvió un archivo ${format === 'pdf' ? 'PDF' : 'Excel'} válido.`,
          );
        }
        return { blob: response.data, actorKey, epoch };
      } catch (error) {
        throw await normalizeBlobApiError(error);
      }
    },
    onSuccess: ({ blob, actorKey, epoch }, { format, previewWindow }) => {
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
        link.download = `UNITHOR-costos-mano-obra-${Date.now()}.xlsx`;
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
  const download = (format: 'pdf' | 'excel', filters: WorkshopCostReportFilters): void => {
    if (
      pending.current ||
      !canExportWorkshopCosts(useAuthStore.getState().user) ||
      !workshopCostReportQuerySchema.safeParse(filters).success
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
    mutation.mutate({ format, filters, previewWindow });
  };
  return { ...mutation, download };
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useRef } from 'react';

import { api } from '../lib/api';
import { normalizeBlobApiError } from '../lib/api-error';
import { canExportReport, canReadReport, reportActorKey } from '../lib/report-access';
import { salesScopeEpochKey } from '../lib/sales-access-cache';
import { useAuthStore } from '../stores/auth.store';
import { notifyError } from '../stores/toast.store';

import type { ReportArea } from '../lib/report-access';
import type {
  AdministrationReportFilters,
  CatalogReportFilters,
  CommercialReportFilters,
  FinancialReportFilters,
  FleetReportFilters,
  InventoryReportFilters,
  WorkshopReportFilters,
} from '@unithor/shared';

type ReportFormat = 'pdf' | 'excel';

type ReportFilters =
  | CommercialReportFilters
  | FinancialReportFilters
  | WorkshopReportFilters
  | InventoryReportFilters
  | CatalogReportFilters
  | FleetReportFilters
  | AdministrationReportFilters;

interface ReportRequest {
  area: ReportArea;
  format: ReportFormat;
  filters: ReportFilters;
}

const reportLabel: Record<ReportArea, string> = {
  administration: 'Cuentas',
  catalog: 'Catalogo',
  commercial: 'Comercial',
  finance: 'Finanzas',
  fleet: 'Clientes_Vehiculos',
  inventory: 'Almacenes',
  workshop: 'Taller',
};

const presentBlob = (
  blob: Blob,
  area: ReportArea,
  format: ReportFormat,
  previewWindow?: Window | null,
): void => {
  const objectUrl = URL.createObjectURL(blob);
  const filename = `Reporte_${reportLabel[area]}_UNITHOR_${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

  if (format === 'pdf') {
    if (previewWindow && !previewWindow.closed) {
      previewWindow.location.href = objectUrl;
    }
  } else {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), format === 'pdf' ? 5 * 60_000 : 30_000);
};

export const useReportDownload = () => {
  const queryClient = useQueryClient();
  const pending = useRef(false);
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      area,
      format,
      filters,
    }: ReportRequest & { previewWindow?: Window | null }) => {
      const actor = useAuthStore.getState().user;
      if (!canExportReport(actor, area)) throw new Error('Reporte no autorizado');
      const actorKey = reportActorKey(actor);
      const epoch = queryClient.getQueryData(salesScopeEpochKey);
      try {
        const response = await api.get<Blob>(`/reports/${area}/${format}`, { params: filters, responseType: 'blob' });
        const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (!(response.data instanceof Blob) || !response.data.size || !String(response.headers?.['content-type'] ?? response.data.type).includes(mime)) {
          throw new AxiosError('Archivo inválido', 'ERR_BAD_RESPONSE', response.config, response.request, { ...response, data: { error: { message: `El servidor no devolvió un archivo ${format === 'pdf' ? 'PDF' : 'Excel'} válido. Reintenta la descarga.` } } });
        }
        return { blob: response.data, area, format, actorKey, epoch };
      } catch (error) { throw await normalizeBlobApiError(error); }
    },
    onSuccess: ({ blob, area, format, actorKey, epoch }, variables) => {
      if (actorKey !== reportActorKey(useAuthStore.getState().user) || epoch !== queryClient.getQueryData(salesScopeEpochKey) || !canExportReport(useAuthStore.getState().user, area)) { variables.previewWindow?.close(); return; }
      presentBlob(blob, area, format, variables.previewWindow);
    },
    onError: (_error, variables) => {
      variables.previewWindow?.close();
    },
    onSettled: () => { pending.current = false; },
  });

  return {
    ...mutation,
    downloadExcel: (area: ReportArea, filters: ReportFilters) => {
      if (pending.current || !canExportReport(useAuthStore.getState().user, area)) return;
      pending.current = true;
      mutation.mutate({ area, format: 'excel', filters });
    },
    openPdf: (area: ReportArea, filters: ReportFilters) => {
      if (pending.current || !canExportReport(useAuthStore.getState().user, area)) return;
      const previewWindow = window.open('', '_blank');
      if (!previewWindow) { notifyError('Permite abrir pestañas emergentes para visualizar el PDF y vuelve a intentarlo.'); return; }
      previewWindow.opener = null;
      pending.current = true;
      mutation.mutate({ area, format: 'pdf', filters, previewWindow });
    },
  };
};

export const useReportPreview = <T,>(area: ReportArea, filters: ReportFilters, enabled = true) => {
  const user = useAuthStore((state) => state.user);
  return useQuery<T>({
    queryKey: ['reports', 'preview', area, filters],
    queryFn: async () => (await api.get<T>(`/reports/${area}/preview`, { params: filters })).data,
    enabled: enabled && canReadReport(user, area),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
};

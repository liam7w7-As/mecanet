import { useMutation } from '@tanstack/react-query';

import { api } from '../lib/api';

import type {
  AdministrationReportFilters,
  CatalogReportFilters,
  CommercialReportFilters,
  FinancialReportFilters,
  FleetReportFilters,
  InventoryReportFilters,
  WorkshopReportFilters,
} from '@unithor/shared';

type ReportArea = 'finance' | 'commercial' | 'workshop' | 'inventory' | 'catalog' | 'fleet' | 'administration';
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
    if (previewWindow) {
      previewWindow.location.href = objectUrl;
    } else {
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
    }
  } else {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
};

export const useReportDownload = () => {
  const mutation = useMutation({
    mutationFn: async ({
      area,
      format,
      filters,
    }: ReportRequest & { previewWindow?: Window | null }) => {
      const response = await api.get<Blob>(`/reports/${area}/${format}`, {
        params: filters,
        responseType: 'blob',
      });
      return { blob: response.data, area, format };
    },
    onSuccess: ({ blob, area, format }, variables) => {
      presentBlob(blob, area, format, variables.previewWindow);
    },
    onError: (_error, variables) => {
      variables.previewWindow?.close();
    },
  });

  return {
    ...mutation,
    downloadExcel: (area: ReportArea, filters: ReportFilters) =>
      mutation.mutate({ area, format: 'excel', filters }),
    openPdf: (area: ReportArea, filters: ReportFilters) => {
      const previewWindow = window.open('', '_blank');
      mutation.mutate({ area, format: 'pdf', filters, previewWindow });
    },
  };
};

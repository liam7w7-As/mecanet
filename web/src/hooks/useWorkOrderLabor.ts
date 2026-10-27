import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

import type {
  MyLaborOrder,
  WorkOrderPriceSuggestion,
  WorkOrderWorksheet,
  WorkshopDailyReport,
} from '../types/entities';
import type {
  AdjustWorkOrderItemHoursInput,
  AssignWorkOrderItemInput,
  CreateWorkOrderObservationInput,
  CreateWorkOrderPriceSuggestionInput,
  ReviewWorkOrderPriceSuggestionInput,
  UpdateWorkOrderItemEstimateInput,
} from '@unithor/shared';

interface WorksheetResponse {
  worksheet: WorkOrderWorksheet;
}

export const laborKeys = {
  all: ['work-order-labor'] as const,
  mine: () => [...laborKeys.all, 'mine'] as const,
  worksheets: () => [...laborKeys.all, 'worksheet'] as const,
  worksheet: (id: number) => [...laborKeys.worksheets(), id] as const,
  suggestions: (id: number) => [...laborKeys.all, 'suggestions', id] as const,
  daily: (fecha: string) => [...laborKeys.all, 'daily', fecha] as const,
};

const useWorksheetMutation = <TVariables>(
  mutationFn: (variables: TVariables & { id: number }) => Promise<WorkOrderWorksheet>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (worksheet, variables) => {
      queryClient.setQueryData(laborKeys.worksheet(variables.id), worksheet);
      void queryClient.invalidateQueries({ queryKey: laborKeys.mine() });
      void queryClient.invalidateQueries({ queryKey: laborKeys.worksheets() });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useMyLaborWorkOrders = (enabled = true) =>
  useQuery({
    queryKey: laborKeys.mine(),
    queryFn: async () => {
      const response = await api.get<{ items: MyLaborOrder[] }>('/work-orders/mine');
      return response.data.items ?? [];
    },
    enabled,
  });

export const useWorkOrderWorksheet = (id: number, enabled = true) =>
  useQuery({
    queryKey: laborKeys.worksheet(id),
    queryFn: async () => {
      const response = await api.get<WorksheetResponse>(`/work-orders/${id}/worksheet`);
      return response.data.worksheet;
    },
    enabled: enabled && Number.isInteger(id) && id > 0,
    refetchInterval: 30_000,
  });

export const useStartItemTimerMutation = () =>
  useWorksheetMutation<{ id: number; itemId: number }>(async ({ id, itemId }) => {
    const response = await api.post<WorksheetResponse>(
      `/work-orders/${id}/items/${itemId}/start`,
    );
    return response.data.worksheet;
  });

export const usePauseItemTimerMutation = () =>
  useWorksheetMutation<{ id: number; itemId: number }>(async ({ id, itemId }) => {
    const response = await api.post<WorksheetResponse>(
      `/work-orders/${id}/items/${itemId}/pause`,
    );
    return response.data.worksheet;
  });

export const useCompleteItemTimerMutation = () =>
  useWorksheetMutation<{ id: number; itemId: number; notasOperativas?: string | null }>(
    async ({ id, itemId, notasOperativas }) => {
      const response = await api.post<WorksheetResponse>(
        `/work-orders/${id}/items/${itemId}/complete`,
        { notasOperativas: notasOperativas ?? null },
      );
      return response.data.worksheet;
    },
  );

export const useAssignWorkOrderItemMutation = () =>
  useWorksheetMutation<{ id: number; itemId: number; data: AssignWorkOrderItemInput }>(
    async ({ id, itemId, data }) => {
      const response = await api.post<WorksheetResponse>(
        `/work-orders/${id}/items/${itemId}/assignment`,
        data,
      );
      return response.data.worksheet;
    },
  );

export const useUpdateItemEstimateMutation = () =>
  useWorksheetMutation<{ id: number; itemId: number; data: UpdateWorkOrderItemEstimateInput }>(
    async ({ id, itemId, data }) => {
      const response = await api.patch<WorksheetResponse>(
        `/work-orders/${id}/items/${itemId}/estimate`,
        data,
      );
      return response.data.worksheet;
    },
  );

export const useAdjustItemHoursMutation = () =>
  useWorksheetMutation<{ id: number; itemId: number; data: AdjustWorkOrderItemHoursInput }>(
    async ({ id, itemId, data }) => {
      const response = await api.post<WorksheetResponse>(
        `/work-orders/${id}/items/${itemId}/hours/adjust`,
        data,
      );
      return response.data.worksheet;
    },
  );

export const useValidateItemHoursMutation = () =>
  useWorksheetMutation<{ id: number; itemId: number; comentario?: string | null }>(
    async ({ id, itemId, comentario }) => {
      const response = await api.post<WorksheetResponse>(
        `/work-orders/${id}/items/${itemId}/hours/validate`,
        { comentario: comentario ?? null },
      );
      return response.data.worksheet;
    },
  );

export const useSubmitWorksheetProgressMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      porcentaje,
      comentario,
      bloqueos,
    }: {
      id: number;
      porcentaje: number;
      comentario: string;
      bloqueos?: string | null;
    }) => {
      const response = await api.patch<WorksheetResponse>(`/work-orders/${id}/execution`, {
        reporte: { porcentaje, comentario, bloqueos: bloqueos ?? null },
      });
      return response.data.worksheet;
    },
    onSuccess: (worksheet, variables) => {
      queryClient.setQueryData(laborKeys.worksheet(variables.id), worksheet);
      void queryClient.invalidateQueries({ queryKey: laborKeys.worksheets() });
      void queryClient.invalidateQueries({ queryKey: laborKeys.mine() });
    },
  });
};

export const useCreateObservationMutation = () => {  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
      files,
    }: {
      id: number;
      data: CreateWorkOrderObservationInput;
      files: File[];
    }) => {
      const formData = new FormData();
      if (data.texto) formData.append('texto', data.texto);
      if (data.workOrderItemId) formData.append('workOrderItemId', String(data.workOrderItemId));
      if (data.progressReportId) {
        formData.append('progressReportId', String(data.progressReportId));
      }
      for (const file of files) formData.append('files', file);
      const response = await api.post<WorksheetResponse>(
        `/work-orders/${id}/observations`,
        formData,
      );
      return response.data.worksheet;
    },
    onSuccess: (worksheet, variables) => {
      queryClient.setQueryData(laborKeys.worksheet(variables.id), worksheet);
      void queryClient.invalidateQueries({ queryKey: laborKeys.worksheets() });
    },
  });
};

export const usePriceSuggestions = (id: number, enabled = true) =>
  useQuery({
    queryKey: laborKeys.suggestions(id),
    queryFn: async () => {
      const response = await api.get<{ suggestions: WorkOrderPriceSuggestion[] }>(
        `/work-orders/${id}/price-suggestions`,
      );
      return response.data.suggestions ?? [];
    },
    enabled: enabled && Number.isInteger(id) && id > 0,
  });

export const useCreatePriceSuggestionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: CreateWorkOrderPriceSuggestionInput;
    }) => {
      const response = await api.post<{ suggestion: WorkOrderPriceSuggestion }>(
        `/work-orders/${id}/price-suggestions`,
        data,
      );
      return response.data.suggestion;
    },
    onSuccess: (_suggestion, variables) => {
      void queryClient.invalidateQueries({ queryKey: laborKeys.suggestions(variables.id) });
    },
  });
};

export const useReviewPriceSuggestionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      suggestionId,
      data,
    }: {
      id: number;
      suggestionId: number;
      data: ReviewWorkOrderPriceSuggestionInput;
    }) => {
      const response = await api.patch<{ suggestion: WorkOrderPriceSuggestion }>(
        `/work-orders/${id}/price-suggestions/${suggestionId}`,
        data,
      );
      return response.data.suggestion;
    },
    onSuccess: (_suggestion, variables) => {
      void queryClient.invalidateQueries({ queryKey: laborKeys.suggestions(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
};

export const useWorkshopDailyReport = (fecha: string, enabled = true) =>
  useQuery({
    queryKey: laborKeys.daily(fecha),
    queryFn: async () => {
      const response = await api.get<{ report: WorkshopDailyReport }>('/work-orders/reports/daily', {
        params: { fecha },
      });
      return response.data.report;
    },
    enabled,
  });

export const downloadWorkshopDailyReportPdf = async (fecha: string): Promise<void> => {
  const response = await api.get<Blob>('/work-orders/reports/daily/pdf', {
    params: { fecha },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reporte-diario-taller-${fecha}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

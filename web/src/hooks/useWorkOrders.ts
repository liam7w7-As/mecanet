import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from './useDebouncedValue';
import { api } from '../lib/api';

import type {
  CatalogItem,
  PaginatedResponse,
  WorkOrder,
} from '../types/entities';
import type {
  ChangeWorkOrderStatusInput,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderQueryInput,
} from '@unithor/shared';

interface WorkOrderResponse {
  workOrder: WorkOrder;
}

export type WorkOrderQueryParams = Partial<WorkOrderQueryInput>;

export const workOrderKeys = {
  all: ['work-orders'] as const,
  lists: () => [...workOrderKeys.all, 'list'] as const,
  list: (params: WorkOrderQueryParams) => [...workOrderKeys.lists(), params] as const,
  details: () => [...workOrderKeys.all, 'detail'] as const,
  detail: (id: number) => [...workOrderKeys.details(), id] as const,
};

export const useWorkOrders = (queryParams: WorkOrderQueryParams) =>
  useQuery({
    queryKey: workOrderKeys.list(queryParams),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<WorkOrder>>('/work-orders', {
        params: queryParams,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useWorkOrder = (id: number) =>
  useQuery({
    queryKey: workOrderKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<WorkOrderResponse>(`/work-orders/${id}`);
      return response.data.workOrder;
    },
    enabled: Number.isInteger(id) && id > 0,
  });

export const useCreateWorkOrderMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateWorkOrderInput) => {
      const response = await api.post<WorkOrderResponse>('/work-orders', data);
      return response.data.workOrder;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
};

export const useUpdateWorkOrderMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateWorkOrderInput }) => {
      const response = await api.patch<WorkOrderResponse>(`/work-orders/${id}`, data);
      return response.data.workOrder;
    },
    onSuccess: (workOrder) => {
      queryClient.setQueryData(workOrderKeys.detail(workOrder.id), workOrder);
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
    },
  });
};

export const useChangeWorkOrderStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ChangeWorkOrderStatusInput }) => {
      const response = await api.patch<WorkOrderResponse>(`/work-orders/${id}/status`, data);
      return response.data.workOrder;
    },
    onSuccess: (workOrder) => {
      queryClient.setQueryData(workOrderKeys.detail(workOrder.id), workOrder);
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
    },
  });
};

export const useCatalogItems = (term: string) => {
  const debouncedTerm = useDebouncedValue(term.trim(), 250);

  return useQuery({
    queryKey: ['catalog', 'picker', debouncedTerm],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CatalogItem>>('/catalog', {
        params: { page: 1, pageSize: 12, search: debouncedTerm || undefined },
      });
      return response.data;
    },
    staleTime: 60_000,
  });
};

type PdfMode = 'open' | 'download';

interface PdfRequest {
  id: number;
  codigo: string;
  mode: PdfMode;
  previewWindow?: Window | null;
}

const presentPdf = (
  blob: Blob,
  codigo: string,
  mode: PdfMode,
  previewWindow?: Window | null,
): void => {
  const objectUrl = URL.createObjectURL(blob);

  if (mode === 'open') {
    if (previewWindow) {
      previewWindow.location.href = objectUrl;
    } else {
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
    }
  } else {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${codigo}.pdf`;
    link.click();
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
};

export const useDownloadWorkOrderPdf = () => {
  const mutation = useMutation({
    mutationFn: async ({ id, codigo, mode, previewWindow }: PdfRequest) => {
      const response = await api.get<Blob>(`/work-orders/${id}/pdf`, {
        responseType: 'blob',
      });
      return { blob: response.data, codigo, mode, previewWindow };
    },
    onSuccess: ({ blob, codigo, mode, previewWindow }) => {
      presentPdf(blob, codigo, mode, previewWindow);
    },
    onError: (_error, request) => request.previewWindow?.close(),
  });

  return {
    ...mutation,
    downloadPdf: (id: number, codigo: string) => mutation.mutate({ id, codigo, mode: 'download' }),
    openPdf: (id: number, codigo: string) => {
      const previewWindow = window.open('', '_blank');
      mutation.mutate({ id, codigo, mode: 'open', previewWindow });
    },
  };
};

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from './useDebouncedValue';
import { api } from '../lib/api';

import type {
  CatalogItem,
  PaginatedResponse,
  WorkOrder,
  WorkOrderInspectionPhoto,
} from '../types/entities';
import type {
  ChangeWorkOrderStatusInput,
  CreateWorkOrderReentryInput,
  DeliverWorkOrderInput,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderQueryInput,
  WorkOrderInspectionPhotoSlot,
  AssignWorkOrderMechanicInput,
  CreateWorkOrderRequestInput,
  ReviewWorkOrderRequestInput,
  UpdateWorkOrderExecutionInput,
} from '@unithor/shared';

interface WorkOrderResponse {
  workOrder: WorkOrder;
}

export interface WorkOrderMechanic {
  id: number;
  nombre: string;
  email: string;
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

export const useMechanics = (enabled = true) =>
  useQuery({
    queryKey: [...workOrderKeys.all, 'mechanics'],
    queryFn: async () => {
      const response = await api.get<{ mechanics: WorkOrderMechanic[] }>('/work-orders/mechanics');
      return response.data.mechanics ?? [];
    },
    enabled,
    staleTime: 60_000,
  });

const updateWorkOrderCaches = (
  queryClient: ReturnType<typeof useQueryClient>,
  workOrder: WorkOrder,
): void => {
  queryClient.setQueryData(workOrderKeys.detail(workOrder.id), workOrder);
  void queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: ['quotations'] });
  void queryClient.invalidateQueries({ queryKey: ['catalog'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
};

export const useAssignWorkOrderMechanicMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AssignWorkOrderMechanicInput }) => {
      const response = await api.patch<WorkOrderResponse>(`/work-orders/${id}/assignment`, data);
      return response.data.workOrder;
    },
    onSuccess: (workOrder) => updateWorkOrderCaches(queryClient, workOrder),
  });
};

export const useUpdateWorkOrderExecutionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateWorkOrderExecutionInput }) => {
      const response = await api.patch<WorkOrderResponse>(`/work-orders/${id}/execution`, data);
      return response.data.workOrder;
    },
    onSuccess: (workOrder) => updateWorkOrderCaches(queryClient, workOrder),
  });
};

export const useCreateWorkOrderRequestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CreateWorkOrderRequestInput }) => {
      const response = await api.post<WorkOrderResponse>(`/work-orders/${id}/requests`, data);
      return response.data.workOrder;
    },
    onSuccess: (workOrder) => updateWorkOrderCaches(queryClient, workOrder),
  });
};

export const useReviewWorkOrderRequestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      requestId,
      data,
    }: {
      id: number;
      requestId: number;
      data: ReviewWorkOrderRequestInput;
    }) => {
      const response = await api.patch<WorkOrderResponse>(
        `/work-orders/${id}/requests/${requestId}`,
        data,
      );
      return response.data.workOrder;
    },
    onSuccess: (workOrder) => updateWorkOrderCaches(queryClient, workOrder),
  });
};

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
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useDeliverWorkOrderMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: DeliverWorkOrderInput }) => {
      const response = await api.post<WorkOrderResponse>(`/work-orders/${id}/deliver`, data);
      return response.data.workOrder;
    },
    onSuccess: (workOrder) => {
      queryClient.setQueryData(workOrderKeys.detail(workOrder.id), workOrder);
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useCreateWorkOrderReentryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CreateWorkOrderReentryInput }) => {
      const response = await api.post<WorkOrderResponse>(`/work-orders/${id}/reentry`, data);
      return response.data.workOrder;
    },
    onSuccess: (workOrder, variables) => {
      queryClient.setQueryData(workOrderKeys.detail(workOrder.id), workOrder);
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['quotations'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export interface InspectionPhotoUpload {
  slot: WorkOrderInspectionPhotoSlot;
  file: File;
}

export const useUploadWorkOrderInspectionPhotosMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      photos,
      onProgress,
    }: {
      id: number;
      photos: InspectionPhotoUpload[];
      onProgress?: (slot: WorkOrderInspectionPhotoSlot, percent: number) => void;
    }) => {
      const uploaded: WorkOrderInspectionPhoto[] = [];

      for (const photo of photos) {
        const formData = new FormData();
        formData.append('photo', photo.file);
        onProgress?.(photo.slot, 0);
        const response = await api.post<{ photo: WorkOrderInspectionPhoto }>(
          `/work-orders/${id}/inspection/photos/${photo.slot}`,
          formData,
          {
            onUploadProgress: (event) => {
              if (!event.total) return;
              onProgress?.(photo.slot, Math.round((event.loaded / event.total) * 100));
            },
          },
        );
        onProgress?.(photo.slot, 100);
        uploaded.push(response.data.photo);
      }

      return uploaded;
    },
    onSuccess: (_photos, variables) => {
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(variables.id) });
    },
  });
};

export const useDeleteWorkOrderInspectionPhotoMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, slot }: { id: number; slot: WorkOrderInspectionPhotoSlot }) => {
      await api.delete(`/work-orders/${id}/inspection/photos/${slot}`);
      return { id, slot };
    },
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(id) });
    },
  });
};

export type CatalogPickerType = 'parte' | 'estandar' | 'especifico' | 'all';

export const useCatalogItems = (term: string, tipo: CatalogPickerType = 'all', page = 1) => {
  const debouncedTerm = useDebouncedValue(term.trim(), 250);

  return useQuery({
    queryKey: ['catalog', 'picker', debouncedTerm, tipo, page],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<CatalogItem>>('/catalog', {
        params: {
          page,
          pageSize: 12,
          search: debouncedTerm || undefined,
          tipo: tipo === 'all' ? undefined : tipo,
        },
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
  filename: string,
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
    link.download = filename;
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
      return { blob: response.data, filename: `${codigo}.pdf`, mode, previewWindow };
    },
    onSuccess: ({ blob, filename, mode, previewWindow }) => {
      presentPdf(blob, filename, mode, previewWindow);
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

export const useDownloadWorkOrderReceptionPdf = () => {
  const mutation = useMutation({
    mutationFn: async ({ id, codigo, mode, previewWindow }: PdfRequest) => {
      const response = await api.get<Blob>(`/work-orders/${id}/reception-pdf`, {
        responseType: 'blob',
      });
      return {
        blob: response.data,
        filename: `${codigo}-comprobante-recepcion.pdf`,
        mode,
        previewWindow,
      };
    },
    onSuccess: ({ blob, filename, mode, previewWindow }) => {
      presentPdf(blob, filename, mode, previewWindow);
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

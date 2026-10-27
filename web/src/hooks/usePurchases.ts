import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from './useDebouncedValue';
import { api } from '../lib/api';

import type { PaginatedResponse, Purchase, PurchaseListResponse, Supplier } from '../types/entities';
import type {
  CreatePurchaseInput,
  PurchaseQueryInput,
  PurchaseReportQueryInput,
  RegisterPurchasePaymentInput,
  SupplierQueryInput,
  UpdateSupplierInput,
} from '@unithor/shared';

export type PurchaseQueryParams = Partial<PurchaseQueryInput>;
export type SupplierQueryParams = Partial<SupplierQueryInput>;
export type PurchaseReportFormat = 'pdf' | 'excel';

interface PurchaseResponse {
  purchase: Purchase;
}

interface SupplierResponse {
  supplier: Supplier;
}

export const purchaseKeys = {
  all: ['purchases'] as const,
  lists: () => [...purchaseKeys.all, 'list'] as const,
  list: (params: PurchaseQueryParams) => [...purchaseKeys.lists(), params] as const,
  details: () => [...purchaseKeys.all, 'detail'] as const,
  detail: (id: number) => [...purchaseKeys.details(), id] as const,
  suppliers: () => ['suppliers'] as const,
  supplierLists: () => [...purchaseKeys.suppliers(), 'list'] as const,
  supplierList: (params: SupplierQueryParams) =>
    [...purchaseKeys.supplierLists(), params] as const,
  supplierDetails: () => [...purchaseKeys.suppliers(), 'detail'] as const,
  supplierDetail: (id: number) => [...purchaseKeys.supplierDetails(), id] as const,
};

const invalidatePurchaseSideEffects = (queryClient: ReturnType<typeof useQueryClient>): void => {
  void queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['finance'] });
  void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
  void queryClient.invalidateQueries({ queryKey: ['catalog'] });
};

export const usePurchases = (queryParams: PurchaseQueryParams) =>
  useQuery({
    queryKey: purchaseKeys.list(queryParams),
    queryFn: async () => {
      const response = await api.get<PurchaseListResponse>('/purchases', { params: queryParams });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const usePurchase = (id: number | null) =>
  useQuery({
    queryKey: purchaseKeys.detail(id ?? 0),
    queryFn: async () => {
      const response = await api.get<PurchaseResponse>(`/purchases/${id}`);
      return response.data.purchase;
    },
    enabled: id !== null && Number.isInteger(id) && id > 0,
  });

export const useSuppliers = (queryParams: SupplierQueryParams, enabled = true) =>
  useQuery({
    queryKey: purchaseKeys.supplierList(queryParams),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Supplier>>('/suppliers', {
        params: queryParams,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
    enabled,
  });

export const useSupplier = (id: number | null, enabled = true) =>
  useQuery({
    queryKey: purchaseKeys.supplierDetail(id ?? 0),
    queryFn: async () => {
      const response = await api.get<SupplierResponse>(`/suppliers/${id}`);
      return response.data.supplier;
    },
    enabled: enabled && id !== null && Number.isInteger(id) && id > 0,
  });

export const useSupplierSearch = (term: string, enabled = true) => {
  const debouncedTerm = useDebouncedValue(term.trim(), 250);
  return useQuery({
    queryKey: purchaseKeys.supplierList({ page: 1, pageSize: 10, search: debouncedTerm }),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Supplier>>('/suppliers', {
        params: { page: 1, pageSize: 10, search: debouncedTerm || undefined },
      });
      return response.data;
    },
    enabled,
    placeholderData: keepPreviousData,
  });
};

export const useCreatePurchaseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      data,
      comprobante,
    }: {
      data: CreatePurchaseInput;
      comprobante: File;
    }) => {
      const formData = new FormData();
      formData.append('payload', JSON.stringify(data));
      formData.append('comprobante', comprobante);

      const response = await api.post<PurchaseResponse>('/purchases', formData);
      return response.data.purchase;
    },
    onSuccess: () => invalidatePurchaseSideEffects(queryClient),
  });
};

export const useVoidPurchaseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ purchaseId, motivo }: { purchaseId: number; motivo: string }) => {
      const response = await api.patch<PurchaseResponse>(`/purchases/${purchaseId}/void`, {
        motivo,
      });
      return response.data.purchase;
    },
    onSuccess: () => invalidatePurchaseSideEffects(queryClient),
  });
};

export const useRegisterPurchasePaymentMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      purchaseId,
      data,
    }: {
      purchaseId: number;
      data: RegisterPurchasePaymentInput;
    }) => {
      const response = await api.post<PurchaseResponse>(`/purchases/${purchaseId}/payment`, data);
      return response.data.purchase;
    },
    onSuccess: () => invalidatePurchaseSideEffects(queryClient),
  });
};

export const useUpdateSupplierMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplierId, data }: { supplierId: number; data: UpdateSupplierInput }) => {
      const response = await api.patch<SupplierResponse>(`/suppliers/${supplierId}`, data);
      return response.data.supplier;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.suppliers() });
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
    },
  });
};

export const useDownloadPurchaseReport = () =>
  useMutation({
    mutationFn: async ({
      format,
      filters,
    }: {
      format: PurchaseReportFormat;
      filters: PurchaseReportQueryInput;
    }) => {
      const response = await api.get<Blob>(`/purchases/report/${format}`, {
        params: filters,
        responseType: 'blob',
      });
      const extension = format === 'excel' ? 'xlsx' : 'pdf';
      const href = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `Reporte_Compras_UNITHOR_${Date.now()}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    },
  });

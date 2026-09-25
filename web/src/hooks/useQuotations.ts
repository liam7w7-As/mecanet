import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

import type { PaginatedResponse, Quotation, WorkOrder } from '../types/entities';
import type {
  ConvertQuotationInput,
  CreateQuotationInput,
  QuotationQueryInput,
  UpdateQuotationInput,
} from '@unithor/shared';

interface QuotationResponse {
  quotation: Quotation;
}

interface ConversionResponse {
  quotation: Quotation;
  workOrder: WorkOrder;
}

export type QuotationQueryParams = Partial<QuotationQueryInput>;

export const quotationKeys = {
  all: ['quotations'] as const,
  lists: () => [...quotationKeys.all, 'list'] as const,
  list: (params: QuotationQueryParams) => [...quotationKeys.lists(), params] as const,
  details: () => [...quotationKeys.all, 'detail'] as const,
  detail: (id: number) => [...quotationKeys.details(), id] as const,
};

export const useQuotations = (queryParams: QuotationQueryParams) =>
  useQuery({
    queryKey: quotationKeys.list(queryParams),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Quotation>>('/quotations', {
        params: queryParams,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });

export const useQuotation = (id: number) =>
  useQuery({
    queryKey: quotationKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<QuotationResponse>(`/quotations/${id}`);
      return response.data.quotation;
    },
    enabled: Number.isInteger(id) && id > 0,
  });

export const useCreateQuotationMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateQuotationInput) => {
      const response = await api.post<QuotationResponse>('/quotations', data);
      return response.data.quotation;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: quotationKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useUpdateQuotationMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateQuotationInput }) => {
      const response = await api.patch<QuotationResponse>(`/quotations/${id}`, data);
      return response.data.quotation;
    },
    onSuccess: (quotation) => {
      queryClient.setQueryData(quotationKeys.detail(quotation.id), quotation);
      void queryClient.invalidateQueries({ queryKey: quotationKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useConvertToWorkOrderMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ConvertQuotationInput }) => {
      const response = await api.post<ConversionResponse>(`/quotations/${id}/convert-to-ot`, data);
      return response.data;
    },
    onSuccess: ({ quotation }) => {
      queryClient.setQueryData(quotationKeys.detail(quotation.id), quotation);
      void queryClient.invalidateQueries({ queryKey: quotationKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
